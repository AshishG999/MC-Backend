require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { connectMongo } = require('./config/mongo');
const { initKafka } = require('./config/kafka');
const logger = require('./config/logger');
const logVisitor = require('./middleware/logVisitor');
const adminIPsRoutes = require("./routes/adminIPs");
const projectsRoutes = require('./routes/projects');
const leadsRoutes = require('./routes/leads');
const domainEmailRoutes = require('./routes/domainEmails');
const logsRoutes = require('./routes/logs');
const webhookRoutes = require('./routes/webhooks');
const securityMiddleware = require("./middleware/security");
const ipBlocker = require('./middleware/ipBlocker');
const startDetector = require('./services/suspiciousTrafficDetector');
const http = require('http');
const WebSocket = require('ws');
const { startKafkaWsServer } = require('./services/kafkaWsBridge');
const { startNginxLogTail } = require('./services/nginxLogToKafka');

startDetector();
const app = express();

// ✅ Security headers
app.use(helmet());

// ✅ CORS restriction
const ALLOWED_DOMAIN = process.env.APP_STATE === 'developer' ? 'http://localhost:3000' : "https://portal.urbanpillar.info";
app.use(cors({
  origin: ALLOWED_DOMAIN,
  credentials: true
}));

// ✅ Global middleware
app.use(ipBlocker);
app.use(securityMiddleware);
app.use(logVisitor);

// ✅ Parsers & logging
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// ✅ Routes
app.use('/webhooks', webhookRoutes);
app.use('/api/v1/projects', projectsRoutes);
app.use('/api/v1/leads', leadsRoutes);
app.use('/api/v1/domain-emails', domainEmailRoutes);
app.use('/api/v1/logs', logsRoutes);
app.use("/api/v1/admin/ips", adminIPsRoutes);

// ✅ Root endpoint
app.get('/', (req, res) => res.json({ ok: true, service: 'microsite-backend' }));

// ✅ Database + Kafka init
connectMongo().catch(err => {
  logger.error('MongoDB connection failed', err);
  process.exit(1);
});
initKafka().catch(err => {
  logger.error('Kafka init failed', err);
});

// ✅ Create HTTP server
const server = http.createServer(app);

// ✅ Attach WebSocket server
// const wss = new WebSocket.Server({ server, path: "/ws" });
startKafkaWsServer(server).catch(err => logger.error("WS Server Error:", err));
startNginxLogTail().catch(err => console.error(err));
// ✅ Start server
const port = process.env.PORT || 9500;
server.listen(port, () => logger.info(`Server started on port ${port}`));
