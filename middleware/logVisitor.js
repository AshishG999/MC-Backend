// middleware/logVisitor.js
const requestIp = require('request-ip');
const useragent = require('express-useragent');
const geoip = require('geoip-lite');
const VisitorLog = require('../models/VisitorLog');
const logger = require('../config/logger');
const { getProducer } = require('../config/kafka');

async function logVisitor(req, res, next) {
  const clientIp = requestIp.getClientIp(req) || req.ip || 'Unknown';
  const ua = useragent.parse(req.headers['user-agent']);
  const geo = geoip.lookup(clientIp) || {};

  const logData = {
    projectDomain: req.headers['x-project-domain'] || req.query.domain || 'unknown',
    ip: clientIp,
    browser: ua.browser,
    os: ua.os,
    device: ua.platform,
    country: geo.country || '',
    region: geo.region || '',
    city: geo.city || '',
    latitude: geo.ll ? geo.ll[0] : null,
    longitude: geo.ll ? geo.ll[1] : null,
    area: geo.metro ? `Metro-${geo.metro}` : '',
    path: req.originalUrl,
    userAgent: req.headers['user-agent'] || 'Unknown',
    timestamp: new Date().toISOString(),
  };

  try {
    // Save to MongoDB
    const log = new VisitorLog(logData);
    await log.save();
    logger.info(`Visitor logged for ${log.projectDomain} - IP: ${clientIp}`);
    let logsData = await VisitorLog.find({}).limit(40);
    // Send Kafka message
    const producer = getProducer();
    await producer.send({
      topic: 'visits',
      messages: [
        { key: log.projectDomain, value: JSON.stringify(logsData) },
      ],
    });
    logger.info(`Visitor log sent to Kafka for ${log.projectDomain}`);

  } catch (err) {
    logger.error(`Visitor logging failed: ${err.message}`);
  } finally {
    next();
  }
}

module.exports = logVisitor;
