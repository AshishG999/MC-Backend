const sanitizeHtml = require('sanitize-html');


module.exports = function sanitizeInput(fields = []) {
return (req, res, next) => {
for (const key of fields) {
if (req.body[key] && typeof req.body[key] === 'string') {
req.body[key] = sanitizeHtml(req.body[key], { allowedTags: [], allowedAttributes: {} }).trim();
}
}
next();
};
};