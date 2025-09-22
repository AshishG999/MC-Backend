const mongoose = require('mongoose');


const VisitLogSchema = new mongoose.Schema({
projectDomain: { type: String, index: true },
path: String,
ip: String,
userAgent: String,
geo: { country: String, state: String, city: String, lat: Number, lng: Number },
event: String,
meta: mongoose.Schema.Types.Mixed,
createdAt: { type: Date, default: Date.now }
});


module.exports = mongoose.model('VisitLog', VisitLogSchema);