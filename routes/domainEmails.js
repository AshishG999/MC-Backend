const express = require('express');
const DomainEmail = require('../models/DomainEmail');
const { body } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const sanitizeInput = require('../middleware/sanitizeInput');

const router = express.Router();

router.post('/',
  body('email').isEmail(),
  body('domains').isArray().optional(),
  validateRequest,
  sanitizeInput(['email']),
  async (req, res) => {
    const { email, domains } = req.body;
    const doc = new DomainEmail({ email: email.toLowerCase(), domains: (domains || []).map(d => d.toLowerCase()) });
    await doc.save();
    res.status(201).json(doc);
  }
);

router.get('/', async (req, res) => {
  const all = await DomainEmail.find();
  res.json(all);
});

router.put('/:id', async (req, res) => {
  const updated = await DomainEmail.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

router.delete('/:id', async (req, res) => {
  await DomainEmail.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
