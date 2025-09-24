// routes/adminIPs.js
const express = require("express");
const BlockedIP = require("../models/BlockedIP");
const { sendKafkaMessage } = require("../config/kafka"); // 👈 Kafka producer helper

const router = express.Router();

// 🔑 Simple auth middleware
function adminAuth(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  next();
}

router.use(adminAuth);

// 📌 Get all blocked IPs
router.get("/", async (req, res) => {
  const ips = await BlockedIP.find().sort({ createdAt: -1 });
  res.json(ips);
});

// 📌 Block an IP manually
router.post("/", async (req, res) => {
  const { ip, reason, permanent } = req.body;
  if (!ip) return res.status(400).json({ error: "IP is required" });

  try {
    const blocked = await BlockedIP.findOneAndUpdate(
      { ip },
      { ip, reason, permanent: !!permanent, createdAt: new Date() },
      { upsert: true, new: true }
    );

    // 👇 Send Kafka event
    await sendKafkaMessage("suspicious-events", {
      type: "BLOCK_IP",
      ip,
      reason: reason || "Manual block",
      permanent: !!permanent,
      timestamp: new Date().toISOString(),
    });

    res.json({ message: "IP blocked", blocked });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 📌 Unblock an IP
router.delete("/:ip", async (req, res) => {
  try {
    await BlockedIP.deleteOne({ ip: req.params.ip });

    // 👇 Send Kafka event
    await sendKafkaMessage("suspicious-events", {
      type: "UNBLOCK_IP",
      ip: req.params.ip,
      timestamp: new Date().toISOString(),
    });

    res.json({ message: `IP ${req.params.ip} unblocked` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
