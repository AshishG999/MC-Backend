const geoip = require('geoip-lite');

function lookup(ip) {
  try {
    return geoip.lookup(ip) || {};
  } catch (e) {
    return {};
  }
}

module.exports = { lookup };
