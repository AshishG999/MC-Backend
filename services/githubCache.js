// githubCache.js
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes
const cacheStore = {};

function get(key) {
  const cached = cacheStore[key];
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    delete cacheStore[key];
    return null;
  }
  return cached.data;
}

function set(key, data) {
  cacheStore[key] = {
    data,
    timestamp: Date.now(),
  };
}

module.exports = { get, set };
