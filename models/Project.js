const mongoose = require('mongoose');


const ProjectSchema = new mongoose.Schema({
domain: { type: String, required: true, unique: true, lowercase: true, trim: true },
projectName: { type: String, required: true },
githubRepo: { type: String },
city: { type: String },
status: { type: String, enum: ['active','inactive','suspended'], default: 'inactive' },
createdAt: { type: Date, default: Date.now }
});


module.exports = mongoose.model('Project', ProjectSchema);