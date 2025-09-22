const mongoose = require('mongoose');


const LeadSchema = new mongoose.Schema({
projectDomain: { type: String, required: true, index: true },
projectName: String,
name: { type: String, required: true },
mobile: { type: String, required: true },
interest: { type: String },
ip: String,
userAgent: String,
isp: String,
geo: {
country: String, state: String, city: String, area: String, lat: Number, lng: Number
},
sanitizedData: mongoose.Schema.Types.Mixed,
createdAt: { type: Date, default: Date.now }
});


module.exports = mongoose.model('Lead', LeadSchema);