const { Kafka } = require('kafkajs');
const logger = require('./logger');

let kafka, producer;

async function initKafka() {
  const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
  kafka = new Kafka({ clientId: process.env.KAFKA_CLIENT_ID || 'microsite-backend', brokers });

  // Initialize producer
  producer = kafka.producer();
  await producer.connect();
  logger.info('Kafka producer connected');

  // Create required topics if they don't exist
  const admin = kafka.admin();
  await admin.connect();
  const topics = [
    { topic: 'leads', numPartitions: 1, replicationFactor: 1 },
    { topic: 'visits', numPartitions: 1, replicationFactor: 1 },
    { topic: 'suspicious-events', numPartitions: 1, replicationFactor: 1 },
    { topic: 'deployments', numPartitions: 1, replicationFactor: 1 },
  ];

  try {
    await admin.createTopics({ topics, waitForLeaders: true });
    logger.info('Kafka topics created or already exist:', topics.map(t => t.topic).join(', '));
  } catch (err) {
    logger.error('Error creating Kafka topics:', err.message);
  } finally {
    await admin.disconnect();
  }
}

function getProducer() {
  if (!producer) throw new Error('Kafka producer not initialized');
  return producer;
}

module.exports = { initKafka, getProducer };
