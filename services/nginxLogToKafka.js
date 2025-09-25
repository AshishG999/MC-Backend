const { Tail } = require('tail');
const useragent = require('express-useragent');
const VisitorLog = require('../models/VisitorLog');
const Project = require('../models/Project');
const BlockedIP = require('../models/BlockedIP');
const { getProducer } = require('../config/kafka');
const logger = require('../config/logger');
const axios = require('axios');
const { exec } = require('child_process');

const LOG_FILE = '/var/log/nginx/kafka_access.log';
const logRegex = /^(\S+) - (\S+) \[([^\]]+)] "(.*?)" (\d+) (\d+) "(.*?)" "(.*?)"$/;

// In-memory sets to prevent repeated blocking
const blockedIPsSet = new Set();
const ip404Counter = {}; // track number of 404s per IP
// Whitelisted IPs that should never be blocked
const WHITELIST = new Set([
  "106.214.36.226" // safe IP
]);

// Malicious/scanner paths to auto-block
const maliciousPaths = [
  '/wp-admin/setup-config.php',
  '/phpmyadmin/',
  '/SQLiteManager/',
  '/test/sqlite/',
  '/HNAP1/',
  '/main.php',
  '/SQLite/main.php',
  '/sqlite/main.php',
  '/sqlitemanager/main.php'
];

// Get ASN info from ipinfo.io
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

// Block IP function: Mongo + iptables + in-memory set
async function blockIP(ip, reason = 'Suspicious activity') {
  if (blockedIPsSet.has(ip)) return;

  try {
    blockedIPsSet.add(ip);

    // Save to MongoDB
    await BlockedIP.create({ ip, reason });

    // Block at server level
    exec(`sudo iptables -A INPUT -s ${ip} -j DROP`, (err) => {
      if (err) logger.error(`Failed to block IP ${ip}: ${err.message}`);
      else logger.warn(`Blocked IP: ${ip} - Reason: ${reason}`);
    });
  } catch (err) {
    logger.error(`Error blocking IP ${ip}: ${err.message}`);
  }
}

// Tail nginx logs
async function startNginxLogTail() {
  const tail = new Tail(LOG_FILE);
  logger.info("Watching nginx log file: " + LOG_FILE);

  tail.on('line', async (line) => {
    try {
      const match = line.match(logRegex);
      if (!match) return;

      const [
        _, remoteAddr, host, timeLocal, request,
        status, bytesSent, referer, userAgentStr
      ] = match;

      const [method, pathRaw, protocol] = request.split(' ');
      const path = decodeURIComponent(pathRaw);

      const project = await Project.findOne({ domain: host });
      const projectDomain = project ? project.domain : host;

      const ua = useragent.parse(userAgentStr);
      const asnInfo = await getASNInfo(remoteAddr);

      const loc = asnInfo?.loc ? asnInfo.loc.split(',') : [];
      const latitude = loc.length ? parseFloat(loc[0]) : null;
      const longitude = loc.length ? parseFloat(loc[1]) : null;

      // Suspicious VPN / Proxy detection
      const isVPNorProxy =
        asnInfo &&
        (
          asnInfo.org?.toLowerCase().includes('vpn') ||
          asnInfo.org?.toLowerCase().includes('proxy') ||
          ['aws', 'google', 'digitalocean'].some(x =>
            asnInfo.org?.toLowerCase().includes(x)
          )
        );

      // Log data
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
        partial: parseInt(status) === 206,
      };

      // Save visitor log
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

      // === AUTOMATIC BLOCKING LOGIC ===

      // Increment 404 counter
      if (parseInt(status) === 404) {
        ip404Counter[remoteAddr] = (ip404Counter[remoteAddr] || 0) + 1;
      }

      // Check for malicious path or too many 404s
      const isMaliciousPath = maliciousPaths.some(p =>
        path.toLowerCase().includes(p.toLowerCase())
      );

      if ((isMaliciousPath || (ip404Counter[remoteAddr] >= 5)) &&
          !blockedIPsSet.has(remoteAddr)) {
        const reason = isMaliciousPath
          ? `Malicious path scan (${path})`
          : `Multiple 404 requests (${ip404Counter[remoteAddr]})`;
        await blockIP(remoteAddr, reason);

        // reset counter after blocking
        ip404Counter[remoteAddr] = 0;
      }

      // Also block VPN/proxy
      if (isVPNorProxy && !blockedIPsSet.has(remoteAddr) && !WHITELIST.has(remoteAddr)) {
        await blockIP(remoteAddr, 'Suspicious VPN/Proxy');
      }

    } catch (err) {
      logger.error(`Error processing nginx log line: ${err.message}`);
    }
  });

  tail.on('error', (err) => {
    logger.error(`Tail error: ${err}`);
  });

  logger.info('Nginx log tail started with automatic IP blocking.');
}

module.exports = { startNginxLogTail };
