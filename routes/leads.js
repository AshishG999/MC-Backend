const express = require('express');
const { body } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const sanitizeInput = require('../middleware/sanitizeInput');
const rateLimiter = require('../middleware/rateLimiter');
const Lead = require('../models/Lead');
const Project = require('../models/Project');
const geoip = require('../utils/geoip');
const { getProducer } = require('../config/kafka');
const logger = require('../config/logger');

const router = express.Router();

// POST /api/v1/leads - submit a contact form / lead
router.post('/',
  rateLimiter,
  body('projectDomain').isString().trim().notEmpty().isFQDN(),
  body('name').isString().trim().isLength({ min: 2 }).escape(),
  body('mobile').isString().trim().isLength({ min: 6 }).escape(),
  validateRequest,
  sanitizeInput(['name', 'interest']),
  async (req, res) => {
    try {
      const { projectDomain, projectName, name, mobile, interest } = req.body;
      const domain = projectDomain.toLowerCase();

      // Optional: Check if project exists
      const project = await Project.findOne({ domain });

      // Get IP & user agent
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
      const ua = req.get('User-Agent');

      // Geo lookup
      const geo = geoip.lookup(ip) || {};

      // Create lead document
      const lead = new Lead({
        projectDomain: domain,
        projectName: projectName || project?.projectName || '',
        name,
        mobile,
        interest,
        ip,
        userAgent: ua,
        geo: {
          country: geo.country || '',
          state: geo.region || '',
          city: geo.city || '',
          area: geo.metro ? `Metro-${geo.metro}` : '',
          lat: geo.ll?.[0] || null,
          lng: geo.ll?.[1] || null
        },
        sanitizedData: { raw: true }
      });

      await lead.save();

      // Push lead to Kafka for real-time notification
      try {
        const producer = getProducer();
        await producer.send({
          topic: 'leads',
          messages: [
            {
              key: domain,
              value: JSON.stringify({ id: lead._id, domain, name, mobile })
            }
          ]
        });
        logger.info(`Lead pushed to Kafka: ${lead._id}`);
      } catch (kafkaErr) {
        logger.error(`Kafka push failed: ${kafkaErr.message}`);
      }

      res.status(201).json({ ok: true, id: lead._id });
    } catch (err) {
      logger.error(`Lead submission failed: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
