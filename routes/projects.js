const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const validateRequest = require('../middleware/validateRequest');
const sanitizeInput = require('../middleware/sanitizeInput');
const Project = require('../models/Project');
const { deployProject } = require('../services/deployService');
const githubCache = require('../services/githubCache');
const { Octokit } = require('@octokit/rest');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USER = process.env.GITHUB_USER;

const octokit = new Octokit({ auth: GITHUB_TOKEN });

/**
 * Create a new project
 */
router.post('/',
  body('domain').isString().trim().notEmpty().isFQDN().withMessage('Invalid domain'),
  body('projectName').isString().trim().isLength({ min: 2 }),
  validateRequest,
  sanitizeInput(['projectName']),
  async (req, res) => {
    try {
      const { domain, projectName, githubRepo, city, status } = req.body;

      // Check for duplicates
      const existing = await Project.findOne({ domain });
      if (existing) {
        return res.status(409).json({ message: 'Project with this domain already exists.' });
      }

      const newProject = new Project({
        domain: domain.toLowerCase(),
        projectName,
        githubRepo: githubRepo || '', 
        city,
        status: status || 'inactive'
      });

      const savedProject = await newProject.save();

      // Trigger deployment in background
      setImmediate(() => {
        deployProject(savedProject);
      });

      return res.status(201).json({
        message: 'Project created and deployment started.',
        project: savedProject
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Internal server error.' });
    }
  }
);

/**
 * Get all projects with GitHub info
 */
router.get('/', async (req, res) => {
  try {
    const projects = await Project.find();
    const result = [];

    for (const proj of projects) {
      const cacheKey = `${GITHUB_USER}/${proj.projectName}`;
      let repoData = githubCache.get(cacheKey);

      if (!repoData) {
        try {
          const { data } = await octokit.repos.get({
            owner: GITHUB_USER,
            repo: proj.projectName,
          });

          repoData = {
            stars: data.stargazers_count,
            forks: data.forks_count,
            watchers: data.watchers_count,
            openIssues: data.open_issues_count,
            lastUpdated: data.updated_at,
            repoUrl: data.html_url,
          };
          githubCache.set(cacheKey, repoData);
        } catch {
          repoData = null;
        }
      }

      result.push({
        ...proj._doc,
        githubData: repoData,
      });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * Update project
 */
router.put('/:id', async (req, res) => {
  try {
    const updated = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });

    // Optionally re-deploy if projectName or domain changed
    setImmediate(() => {
      deployProject(updated);
    });

    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

/**
 * Delete project
 */

function sanitizeRepoName(domain) {
  return domain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

router.delete('/:id', async (req, res) => {
  try {
    console.log(req.params);
    
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // 1. Delete GitHub repo (optional, if intended)
    try {
      await octokit.repos.delete({
        owner: GITHUB_USER,
        repo: sanitizeRepoName(project.domain)
      });
    } catch (e) {
      console.warn('GitHub repo not deleted:', e.message);
    }

    // 2. Delete deployed project (call your deployService cleanup)
    // await deployService.deleteProject(project);

    // 3. Delete from database
    await Project.findByIdAndDelete(req.params.id);

    return res.status(200).json({ message: 'Project deleted successfully.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;
