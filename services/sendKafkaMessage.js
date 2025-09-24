const { Kafka } = require('kafkajs');
const logger = require('../config/logger');

const kafka = new Kafka({
  clientId: 'visitor-logger',
  brokers: ['localhost:9092'], // update with your broker(s)
});

const producer = kafka.producer();

async function sendKafkaMessage(topic, message) {
  try {
    await producer.connect();
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    });
    logger.info(`Kafka message sent to topic ${topic}`);
  } catch (err) {
    logger.error(`Failed to send Kafka message: ${err.message}`);
  }
}

module.exports = sendKafkaMessage;
