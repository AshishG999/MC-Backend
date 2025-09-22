import Contact from '../models/Contact.js';

export const submitContact = async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const contact = new Contact({ ...req.body, ip });
    await contact.save();
    res.status(201).json({ message: 'Contact saved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
