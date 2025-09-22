const mongoose = require('mongoose');
const logger = require('./logger');


async function connectMongo() {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI not set');
    await mongoose.connect(uri, { dbName: 'microsite' });
    logger.info('Connected to MongoDB Atlas');
}


module.exports = { connectMongo };