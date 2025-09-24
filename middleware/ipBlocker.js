// middleware/ipBlocker.js
const requestIp = require("request-ip");
const logger = require("../config/logger");
const BlockedIP = require("../models/BlockedIP");

async function ipBlocker(req, res, next) {
  const clientIp = requestIp.getClientIp(req);

  try {
    const blocked = await BlockedIP.findOne({ ip: clientIp });
    if (blocked) {
      logger.warn(`Blocked request from blacklisted IP: ${clientIp}`);
      return res.status(403).json({ error: "Your IP has been blocked" });
    }

    next();
  } catch (err) {
    logger.error("IP blocker error", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = ipBlocker;
