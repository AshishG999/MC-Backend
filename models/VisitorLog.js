const mongoose = require('mongoose');

const VisitorLogSchema = new mongoose.Schema({
  projectDomain: String,
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
  timestamp: Date,
  asnOrg: String,
  suspicious: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('VisitorLog', VisitorLogSchema);
