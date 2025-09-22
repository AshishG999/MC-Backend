const mongoose = require('mongoose');


const DomainEmailSchema = new mongoose.Schema({
email: { type: String, required: true, lowercase: true },
domains: [{ type: String, lowercase: true }],
createdAt: { type: Date, default: Date.now }
});


module.exports = mongoose.model('DomainEmail', DomainEmailSchema);