const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const { deployProject } = require('../services/deployService');
const logger = require('../config/logger');

/**
 * Create a new project
 */
router.post('/', async (req, res) => {
  try {
    const { domain, projectName, githubRepo, city, status } = req.body;

    // Validate required fields
    if (!domain || !projectName) {
      return res.status(400).json({ message: 'Domain and projectName are required.' });
    }

    // Check for duplicate domain
    const existing = await Project.findOne({ domain });
    if (existing) {
      return res.status(409).json({ message: 'Project with this domain already exists.' });
    }

    // Save project in DB
    const newProject = new Project({
      domain,
      projectName,
      githubRepo: githubRepo || '', // will create if empty
      city,
      status: status || 'inactive',
    });

    const savedProject = await newProject.save();
    logger.info(`Project created: ${savedProject.projectName} (${savedProject.domain})`);

    // Trigger auto deployment (non-blocking)
    setImmediate(() => {
      deployProject(savedProject);
    });

    return res.status(201).json({ message: 'Project created and deployment started.', project: savedProject });
  } catch (err) {
    logger.error(`Create project error: ${err.message}`);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

/**
 * Get all projects
 */
router.get('/', async (req, res) => {
  try {
    const projects = await Project.find();
    return res.status(200).json(projects);
  } catch (err) {
    logger.error(`Fetch projects error: ${err.message}`);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

/**
 * Update project
 */
router.put('/:id', async (req, res) => {
  try {
    const updated = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.status(200).json(updated);
  } catch (err) {
    logger.error(`Update project error: ${err.message}`);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

/**
 * Delete project
 */
router.delete('/:id', async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    return res.status(200).json({ message: 'Project deleted successfully.' });
  } catch (err) {
    logger.error(`Delete project error: ${err.message}`);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;
