const requestIp = require('request-ip');
const useragent = require('express-useragent');
const geoip = require('geoip-lite');
const VisitorLog = require('../models/VisitorLog');
const logger = require('../config/logger');

async function logVisitor(req, res, next) {
  try {
    const ip = requestIp.getClientIp(req) || req.ip || 'Unknown';
    const ua = useragent.parse(req.headers['user-agent']);
    const geo = geoip.lookup(ip) || {};

    const log = new VisitorLog({
      projectDomain: req.headers['x-project-domain'] || req.query.domain || 'unknown',
      ip,
      browser: ua.browser,
      os: ua.os,
      device: ua.platform,
      country: geo.country || '',
      region: geo.region || '',
      city: geo.city || '',
      latitude: geo.ll ? geo.ll[0] : null,
      longitude: geo.ll ? geo.ll[1] : null,
      area: geo.metro ? `Metro-${geo.metro}` : '',
    });

    await log.save();
    logger.info(`Visitor logged for ${log.projectDomain} - IP: ${ip}`);
  } catch (err) {
    logger.error(`Visitor logging failed: ${err.message}`);
  } finally {
    next();
  }
}

module.exports = logVisitor;
