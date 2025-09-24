const blockedIPs = new Set();

function addBlockedIP(ip) {
  blockedIPs.add(ip);
}

function removeBlockedIP(ip) {
  blockedIPs.delete(ip);
}

function isBlocked(ip) {
  return blockedIPs.has(ip);
}

module.exports = { addBlockedIP, removeBlockedIP, isBlocked };
