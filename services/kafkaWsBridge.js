const { Kafka } = require('kafkajs');
const WebSocket = require('ws');
const logger = require('../config/logger');

const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const kafka = new Kafka({ clientId: 'microsite-dashboard', brokers });

async function startKafkaWsServer(server) {
  // ✅ Start WebSocket server on /ws
  const wss = new WebSocket.Server({ server, path: "/ws" });
  logger.info('WebSocket server started for dashboard at /ws');

  // ✅ Log client connections
  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    logger.info(`WebSocket client connected: ${clientIp}`);

    ws.on('close', () => logger.info(`WebSocket client disconnected: ${clientIp}`));
  });

  const consumer = kafka.consumer({ groupId: 'dashboard-group' });
  await consumer.connect();

  // ✅ Topics to subscribe
  const topics = ['leads', 'visits', 'suspicious-events', 'deployments'];
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      let data;
      try {
        data = JSON.parse(message.value.toString());
      } catch (err) {
        logger.error(`Failed to parse Kafka message from topic ${topic}: ${err.message}`);
        return;
      }

      const payload = { topic, data };

      // ✅ Broadcast to all connected clients
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          console.log(`Sending payload to client: ${JSON.stringify(payload)}`);
          client.send(JSON.stringify(payload));
        }
      });

    },
  });

  // ✅ Handle consumer crashes
  consumer.on("consumer.crash", (event) => {
    logger.error("Kafka consumer crashed", event.payload.error);
  });

  // ✅ Heartbeat for WS keep-alive
  setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    });
  }, 30000);

  // ✅ Graceful shutdown
  process.on("SIGINT", async () => {
    await consumer.disconnect();
    wss.close();
    logger.info("Kafka consumer & WS closed cleanly");
    process.exit(0);
  });

  return wss; // return instance if needed
}

module.exports = { startKafkaWsServer };
