// middleware/security.js
const logger = require("../config/logger");

const ALLOWED_DOMAIN = "https://portal.urbanpillar.info";

function securityMiddleware(req, res, next) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const userAgent = req.headers["user-agent"] || "Unknown";

  // ✅ Only allow requests from allowed domain
  if (!(origin === ALLOWED_DOMAIN || referer.startsWith(ALLOWED_DOMAIN))) {
    logger.warn(`Suspicious access attempt blocked by securityMiddleware:
      Origin: ${origin},
      Referer: ${referer},
      UA: ${userAgent},
      Path: ${req.originalUrl}
    `);
    return res.status(403).json({ error: "Access denied" });
  }

  // ✅ Log safe traffic
  logger.info(`Security check passed:
    Origin: ${origin},
    Referer: ${referer},
    UA: ${userAgent},
    Path: ${req.originalUrl}
  `);

  next();
}

module.exports = securityMiddleware;
