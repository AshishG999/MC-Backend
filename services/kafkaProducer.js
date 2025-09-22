const { getProducer } = require('../config/kafka');

async function push(topic, message, key) {
  const producer = getProducer();
  await producer.send({ topic, messages: [{ key: key || null, value: JSON.stringify(message) }] });
}

module.exports = { push };
