const { Kafka } = require('kafkajs');
const nodemailer = require('nodemailer');
const axios = require('axios');
const logger = require('../config/logger');
const DomainEmail = require('../models/DomainEmail');
const Lead = require('../models/Lead');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});


// Kafka consumer
async function startNotificationWorker() {
  const kafka = new Kafka({ clientId: 'notifier', brokers: (process.env.KAFKA_BROKERS||'localhost:9092').split(',') });
  const consumer = kafka.consumer({ groupId: 'notification-worker' });
  await consumer.connect();
  await consumer.subscribe({ topic: 'leads', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const leadPayload = JSON.parse(message.value.toString());
        const lead = await Lead.findById(leadPayload.id);
        if (!lead) return;

        // Lookup domain emails
        const domainEmailDoc = await DomainEmail.findOne({ domains: lead.projectDomain });
        if (!domainEmailDoc) return;

        const emails = domainEmailDoc.email ? [domainEmailDoc.email] : [];
        for (const email of emails) {
          // Send email
          await transporter.sendMail({
            from: process.env.OTP_EMAIL,
            to: email,
            subject: `New Lead for ${lead.projectDomain}`,
            text: `Lead details:\nName: ${lead.name}\nMobile: ${lead.mobile}\nInterest: ${lead.interest}`,
          });
        }

        logger.info(`Notifications sent for lead ${lead._id}`);
      } catch (err) {
        logger.error(`Notification error: ${err.message}`);
      }
    }
  });
}

startNotificationWorker().catch(err => logger.error(err));
