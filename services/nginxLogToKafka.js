const { Kafka } = require('kafkajs');
const Tail = require('tail').Tail;
const logger = require('../config/logger');
const Project = require('../models/Project');
const VisitorLog = require('../models/VisitorLog');

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
const kafka = new Kafka({ clientId: 'nginx-log-producer', brokers: KAFKA_BROKERS });
const producer = kafka.producer();

const NGINX_LOG_FILE = '/var/log/nginx/kafka_access.log'; // make sure this matches your Nginx config

async function startNginxLogProducer() {
  try {
    await producer.connect();
    logger.info('Kafka producer connected for Nginx log.');

    // Cache project domains to reduce DB queries
    let projects = await Project.find({}, 'domain');
    const projectDomains = projects.map(p => p.domain.toLowerCase());

    const tail = new Tail(NGINX_LOG_FILE);

    tail.on('line', async (line) => {
      try {
        const regex = /(\S+) - (\S+) \[([^\]]+)] "(\S+) (\S+) (\S+)" (\d+) (\d+) "([^"]*)" "([^"]*)"/;
        const match = line.match(regex);
        if (!match) return;

        const [
          _, remoteAddr, host, timeLocal, method, path, protocol,
          status, bytesSent, referer, userAgent
        ] = match;

        const domain = host.toLowerCase();

        // Only log if domain is a project in DB
        if (!projectDomains.includes(domain)) return;

        const logData = {
          projectDomain: domain,
          ip: remoteAddr,
          path,
          method,
          status: parseInt(status),
          bytesSent: parseInt(bytesSent),
          referer,
          userAgent,
          timestamp: new Date().toISOString(),
        };

        // Save to MongoDB
        const visitorLog = new VisitorLog({
          projectDomain: logData.projectDomain,
          ip: logData.ip,
          browser: logData.userAgent, // you can parse with useragent if needed
          os: '',
          device: '',
          country: '',
          region: '',
          city: '',
          latitude: null,
          longitude: null,
          area: '',
          createdAt: new Date(),
        });
        await visitorLog.save();

        // Send to Kafka
        await producer.send({
          topic: 'visits',
          messages: [{ key: domain, value: JSON.stringify(logData) }],
        });

        logger.info(`Visitor logged & sent to Kafka for project: ${domain}`);

      } catch (err) {
        logger.error(`Failed to process Nginx log line: ${err.message}`);
      }
    });

    tail.on('error', (err) => logger.error(`Tail error: ${err.message}`));

    logger.info(`Tailing Nginx log file: ${NGINX_LOG_FILE}`);
  } catch (err) {
    logger.error(`Kafka producer connection failed: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { startNginxLogProducer };
