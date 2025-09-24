// models/BlockedIP.js
const mongoose = require("mongoose");

const BlockedIPSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true },
  reason: { type: String, default: "Suspicious activity" },
  permanent: { type: Boolean, default: false }, // 👈 if true, never auto-expire
  createdAt: { type: Date, default: Date.now },
});

// TTL index for non-permanent bans (7 days)
BlockedIPSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 7, partialFilterExpression: { permanent: false } }
);

module.exports = mongoose.model("BlockedIP", BlockedIPSchema);
