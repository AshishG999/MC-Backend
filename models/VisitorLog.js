const mongoose = require('mongoose');

const VisitorLogSchema = new mongoose.Schema({
  projectDomain: { type: String, required: true },
  ip: { type: String, required: true },
  browser: String,
  os: String,
  device: String,
  country: String,
  region: String,
  city: String,
  latitude: Number,
  longitude: Number,
  area: String,
  path: String,
  method: String,
  status: Number,
  referer: String,
  userAgent: String,
  suspicious: { type: Boolean, default: false },
  asnOrg: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('VisitorLog', VisitorLogSchema);
