const { Tail } = require('tail');
const useragent = require('express-useragent');
const VisitorLog = require('../models/VisitorLog');
const Project = require('../models/Project');
const { getProducer } = require('../config/kafka');
const logger = require('../config/logger');
const axios = require('axios');

const LOG_FILE = '/var/log/nginx/kafka_access.log';
const logRegex = /^(\S+) - (\S+) \[([^\]]+)] "(.*?)" (\d+) (\d+) "(.*?)" "(.*?)"$/;

async function getASNInfo(ip) {
  try {
    const res = await axios.get(
      `https://ipinfo.io/${ip}/json?token=${process.env.IPINFO_TOKEN}`
    );
    return res.data;
  } catch {
    return null;
  }
}

async function startNginxLogTail() {
  const tail = new Tail(LOG_FILE);
  console.log("Watching nginx log file:", LOG_FILE);

  tail.on('line', async (line) => {
    try {
      const match = line.match(logRegex);
      if (!match) return;

      const [
        _, remoteAddr, host, timeLocal, request,
        status, bytesSent, referer, userAgentStr
      ] = match;

      const [method, pathRaw, protocol] = request.split(' ');
      const path = decodeURIComponent(pathRaw); // <-- decode URL path

      const project = await Project.findOne({ domain: host });
      const projectDomain = project ? project.domain : host;

      const ua = useragent.parse(userAgentStr);
      const asnInfo = await getASNInfo(remoteAddr);

      const loc = asnInfo?.loc ? asnInfo.loc.split(',') : [];
      const latitude = loc.length ? parseFloat(loc[0]) : null;
      const longitude = loc.length ? parseFloat(loc[1]) : null;

      const isVPNorProxy =
        asnInfo &&
        (
          asnInfo.org?.toLowerCase().includes('vpn') ||
          asnInfo.org?.toLowerCase().includes('proxy') ||
          ['aws', 'google', 'digitalocean'].some(x =>
            asnInfo.org?.toLowerCase().includes(x)
          )
        );

      const logData = {
        projectDomain,
        ip: remoteAddr,
        browser: ua.browser,
        os: ua.os,
        device: ua.platform,
        country: asnInfo?.country || '',
        region: asnInfo?.region || '',
        city: asnInfo?.city || '',
        latitude,
        longitude,
        area: asnInfo?.postal ? `Postal-${asnInfo.postal}` : '',
        path,
        method,
        status: parseInt(status),
        referer,
        userAgent: userAgentStr,
        timestamp: new Date(),
        suspicious: isVPNorProxy,
        asnOrg: asnInfo?.org || '',
        partial: parseInt(status) === 206, // <-- mark partial content
      };

      // Save to MongoDB
      await new VisitorLog(logData).save();

      // Push to Kafka
      const producer = getProducer();
      await producer.send({
        topic: 'visits',
        messages: [{ key: projectDomain, value: JSON.stringify(logData) }],
      });

      logger.info(
        `Visitor logged: ${projectDomain} - ${remoteAddr} - Suspicious: ${isVPNorProxy} - Partial: ${logData.partial}`
      );
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
