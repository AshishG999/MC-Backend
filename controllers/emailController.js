import Email from '../models/Email.js';

export const addEmail = async (req, res) => {
  try {
    const email = new Email(req.body);
    await email.save();
    res.status(201).json(email);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
