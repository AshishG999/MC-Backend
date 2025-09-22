const express = require('express');
const router = express.Router();
const { deployProject } = require('../services/deployService');
const Project = require('../models/Project');
const logger = require('../config/logger');

// GitHub webhook endpoint
router.post('/github', async (req, res) => {
  try {
    const event = req.headers['x-github-event'];
    if (event !== 'push') {
      return res.status(200).send('Ignored non-push event');
    }

    const repoName = req.body.repository.name;
    logger.info(`Received push webhook for repo: ${repoName}`);

    // Find project by repo name
    const project = await Project.findOne({ projectName: repoName });
    if (!project) {
      logger.warn(`No project found for repo: ${repoName}`);
      return res.status(404).send('Project not found');
    }

    // Trigger deployment
    setImmediate(() => deployProject(project));

    return res.status(200).send('Deployment triggered');
  } catch (err) {
    logger.error(`Webhook error: ${err.message}`);
    return res.status(500).send('Internal server error');
  }
});

module.exports = router;
