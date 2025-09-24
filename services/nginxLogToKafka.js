// services/nginxLogToKafka.js
const Tail = require('tail').Tail;
const useragent = require('express-useragent');
const geoip = require('geoip-lite');
const VisitorLog = require('../models/VisitorLog');
const Project = require('../models/Project');
const { getProducer } = require('../config/kafka');
const logger = require('../config/logger');

const LOG_FILE = '/var/log/nginx/kafka_access.log'; // your kafka log

// Regex to match nginx kafka log line
const logRegex = /^(\S+) - (\S+) \[([^\]]+)] "(.*?)" (\d+) (\d+) "(.*?)" "(.*?)"$/;

async function startNginxLogTail() {
  const tail = new Tail(LOG_FILE);

  tail.on('line', async (line) => {
    try {
      const match = line.match(logRegex);
      if (!match) return;

      const [
        _, remoteAddr, host, timeLocal, request,
        status, bytesSent, referer, userAgentStr
      ] = match;

      const [method, path, protocol] = request.split(' ');

      // Determine project domain
      const project = await Project.findOne({ domain: host });
      const projectDomain = project ? project.domain : host;

      // Parse user-agent
      const ua = useragent.parse(userAgentStr);

      // Geo lookup
      const geo = geoip.lookup(remoteAddr) || {};

      const logData = {
        projectDomain,
        ip: remoteAddr,
        browser: ua.browser,
        os: ua.os,
        device: ua.platform,
        country: geo.country || '',
        region: geo.region || '',
        city: geo.city || '',
        latitude: geo.ll ? geo.ll[0] : null,
        longitude: geo.ll ? geo.ll[1] : null,
        area: geo.metro ? `Metro-${geo.metro}` : '',
        path,
        method,
        status: parseInt(status),
        referer,
        userAgent: userAgentStr,
        timestamp: new Date(),
      };

      // Save to MongoDB
      const log = new VisitorLog(logData);
      await log.save();

      // Send to Kafka
      const producer = getProducer();
      await producer.send({
        topic: 'visits',
        messages: [
          { key: projectDomain, value: JSON.stringify(logData) },
        ],
      });

      logger.info(`Visitor log saved & sent to Kafka: ${projectDomain} - ${remoteAddr}`);
    } catch (err) {
      logger.error(`Error processing nginx log line: ${err.message}`);
    }
  });

  tail.on('error', (err) => {
    logger.error(`Tail error: ${err}`);
  });

  logger.info('Nginx log tail started...');
}

module.exports = { startNginxLogTail };
