require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const { connectMongo } = require('./config/mongo');
const { initKafka } = require('./config/kafka');
const logger = require('./config/logger');
const logVisitor = require('./middleware/logVisitor');

const projectsRoutes = require('./routes/projects');
const leadsRoutes = require('./routes/leads');
const domainEmailRoutes = require('./routes/domainEmails');
const logsRoutes = require('./routes/logs');
const webhookRoutes = require('./routes/webhooks');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

app.use('/webhooks', webhookRoutes);

app.use(logVisitor); 

// Connect to MongoDB
connectMongo().catch(err => {
logger.error('MongoDB connection failed', err);
process.exit(1);
});


// Initialize Kafka
initKafka().catch(err => {
logger.error('Kafka init failed', err);
});


// Routes
app.use('/api/v1/projects', projectsRoutes);
app.use('/api/v1/leads', leadsRoutes);
app.use('/api/v1/domain-emails', domainEmailRoutes);
app.use('/api/v1/logs', logsRoutes);


app.get('/', (req, res) => res.json({ ok: true, service: 'microsite-backend' }));


const port = process.env.PORT || 9500;
app.listen(port, '127.0.0.1', () => logger.info(`Server started on port ${port}`));
