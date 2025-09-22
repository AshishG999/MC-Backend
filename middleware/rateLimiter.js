const rateLimit = require('express-rate-limit');


const createLimiter = rateLimit({
windowMs: 60 * 1000, // 1 minute
max: 30, // limit each IP to 30 requests per windowMs
standardHeaders: true,
legacyHeaders: false,
});


module.exports = createLimiter;