const express = require('express');
const VisitLog = require('../models/VisitLog');

const router = express.Router();

router.get('/', async (req, res) => {
  const { domain, event, from, to, limit = 100 } = req.query;
  const q = {};
  if (domain) q.projectDomain = domain.toLowerCase();
  if (event) q.event = event;
  if (from || to) q.createdAt = {};
  if (from) q.createdAt.$gte = new Date(from);
  if (to) q.createdAt.$lte = new Date(to);

  const logs = await VisitLog.find(q).sort({ createdAt: -1 }).limit(parseInt(limit));
  res.json(logs);
});

module.exports = router;
