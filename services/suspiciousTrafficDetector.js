const { Kafka } = require('kafkajs');
const logger = require('../config/logger');
const { addBlockedIP } = require('./blocklist');

const kafka = new Kafka({
  clientId: 'suspicious-detector',
  brokers: ['localhost:9092'], // update with your brokers
});

const consumer = kafka.consumer({ groupId: 'traffic-monitor' });

// Simple rules for suspicious activity
const requestCounts = {};

function isSuspicious(log) {
  const ip = log.ip;
  const ua = log.browser + ' ' + log.os;

  // Rule 1: Too many requests from same IP
  requestCounts[ip] = (requestCounts[ip] || 0) + 1;
  if (requestCounts[ip] > 100) { // adjust threshold
    return true;
  }

  // Rule 2: Suspicious User-Agent
  if (/curl|bot|crawler/i.test(ua)) {
    return true;
  }

  // Rule 3: Geo anomaly (e.g., no geo data or flagged country)
  if (!log.country || ['CN', 'RU'].includes(log.country)) {
    return true;
  }

  return false;
}

async function startDetector() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'visitor-logs', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const log = JSON.parse(message.value.toString());
        if (isSuspicious(log)) {
          addBlockedIP(log.ip);
          logger.warn(`Suspicious activity detected. Blocked IP: ${log.ip}`);
        }
      } catch (err) {
        logger.error(`Detector error: ${err.message}`);
      }
    },
  });
}

module.exports = startDetector;
