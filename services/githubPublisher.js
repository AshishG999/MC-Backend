const githubCache = require('./githubCache');
const { getProducer } = require('../config/kafka');
const logger = require('../config/logger');

async function publishGitHubStatus(project) {
  try {
    const repoName = project.domain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const cached = githubCache.get(`${process.env.GITHUB_USER}/${repoName}`);

    if (!cached) {
      logger.warn(`No GitHub cache found for ${repoName}`);
      return;
    }

    const payload = {
      projectDomain: project.domain,
      github: cached,
      timestamp: new Date(),
      status: "updated"
    };

    const producer = getProducer();
    await producer.send({
      topic: 'deployments',
      messages: [{ value: JSON.stringify(payload) }],
    });

    logger.info(`Published GitHub status for ${project.domain}`);
  } catch (err) {
    logger.error(`Failed to publish GitHub status: ${err.message}`);
  }
}

module.exports = { publishGitHubStatus };
