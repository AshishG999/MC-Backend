const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { Octokit } = require('@octokit/rest');
const githubCache = require('./githubCache');
const logger = require('../config/logger');
const Project = require('../models/Project');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USER = process.env.GITHUB_USER;
const PROJECTS_DIR = '/var/www/microsites';
const NGINX_SITES_AVAILABLE = '/etc/nginx/sites-available';
const NGINX_SITES_ENABLED = '/etc/nginx/sites-enabled';

const octokit = new Octokit({ auth: GITHUB_TOKEN });

/**
 * Sanitize domain to use as GitHub repo name
 */
function sanitizeRepoName(domain) {
  return domain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/**
 * Create GitHub repo if it doesn't exist
 */
async function createGithubRepo(domain) {
  const repoName = sanitizeRepoName(domain);

  try {
    const { data } = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      private: true,
      auto_init: false,
    });
    await Project.findOneAndUpdate({domain},{githubRepo: `https://github.com/${GITHUB_USER}/${repoName}.git`})
    logger.info(`GitHub repo created: ${repoName}`);
    return data.clone_url;
  } catch (err) {
    if (err.status === 422) {
      logger.info(`GitHub repo already exists: ${repoName}`);
      return `https://github.com/${GITHUB_USER}/${repoName}.git`;
    }
    throw err;
  }
}

/**
 * Initialize local project folder and write index.html
 */
function initProjectFolder(projectName) {
  const projectPath = path.join(PROJECTS_DIR, projectName);
  if (!fs.existsSync(projectPath)) fs.mkdirSync(projectPath, { recursive: true });

  const indexHtml = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${projectName}</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  </head>
  <body>
      <div class="container mt-5">
          <h1>Welcome to ${projectName}</h1>
          <p>This is a basic Microsite deployed via the dashboard.</p>
      </div>
  </body>
  </html>
  `;
  fs.writeFileSync(path.join(projectPath, 'index.html'), indexHtml.trim());
  logger.info(`Initialized local project folder for ${projectName}`);

  return projectPath;
}

/**
 * Push local project to GitHub
 */
async function deleteProject(project) {
    const repoName = sanitizeRepoName(project.domain);
    const projectPath = initProjectFolder(repoName);

     const cmds = [
      `rm -R ${projectPath}`,
    ].join(' && ');

    exec(cmds, (err, stdout, stderr) => {
      if (err) {
        logger.error(`delete ${projectPath} error: ${stderr}`);
        return reject(err);
      }
      logger.info(`delete ${projectPath}: ${stdout}`);
      resolve(true);
    });
}

async function pushToGithub(projectPath, repoUrl) {
  return new Promise((resolve, reject) => {
    const tokenRepoUrl = repoUrl.replace(
      'https://',
      `https://${GITHUB_USER}:${GITHUB_TOKEN}@`
    );

    const cmds = [
      `cd ${projectPath}`,
      'if [ ! -d ".git" ]; then git init; fi',
      'git remote remove origin || true',
      `git remote add origin ${tokenRepoUrl}`,
      'git add .',
      'git commit -m "Initial commit" || true',
      'git branch -M main',
      'git push -u origin main -f'
    ].join(' && ');

    exec(cmds, (err, stdout, stderr) => {
      if (err) {
        logger.error(`Git push error: ${stderr}`);
        return reject(err);
      }
      logger.info(`Project pushed to GitHub: ${stdout}`);
      resolve(true);
    });
  });
}

/**
 * Create Nginx config and install SSL via Certbot
 */
function createNginxConfig(domain, projectName) {
  const configContent = `
server {
    listen 80;
    server_name ${domain};

    root ${PROJECTS_DIR}/${projectName};
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
  `.trim();

  const configPath = path.join(NGINX_SITES_AVAILABLE, projectName);
  fs.writeFileSync(configPath, configContent);
  logger.info(`Nginx config written for ${domain}`);

  const enabledPath = path.join(NGINX_SITES_ENABLED, projectName);
  if (!fs.existsSync(enabledPath)) fs.symlinkSync(configPath, enabledPath);

  // Reload Nginx
  exec('nginx -s reload', (err, stdout, stderr) => {
    if (err) {
      logger.error(`Nginx reload error: ${stderr}`);
    } else {
      logger.info(`Nginx reloaded for ${domain}`);

      // Run Certbot to install SSL certificate
      const certbotCmd = `certbot --nginx -d ${domain} --non-interactive --agree-tos -m admin@${domain} --redirect`;
      exec(certbotCmd, (errCert, stdoutCert, stderrCert) => {
        if (errCert) {
          logger.error(`Certbot SSL install error: ${stderrCert}`);
        } else {
          logger.info(`Certbot SSL installed for ${domain}: ${stdoutCert}`);
          // Test auto-renewal
          exec('certbot renew --dry-run', (errRenew, stdoutRenew, stderrRenew) => {
            if (errRenew) {
              logger.error(`Certbot renewal test failed: ${stderrRenew}`);
            } else {
              logger.info(`Certbot renewal test successful: ${stdoutRenew}`);
            }
          });
        }
      });
    }
  });
}

/**
 * Update GitHub cache
 */
async function updateCacheForProject(project) {
  const repoName = sanitizeRepoName(project.domain);
  try {
    const { data } = await octokit.repos.get({
      owner: GITHUB_USER,
      repo: repoName,
    });
    githubCache.set(`${GITHUB_USER}/${repoName}`, {
      stars: data.stargazers_count,
      forks: data.forks_count,
      watchers: data.watchers_count,
      openIssues: data.open_issues_count,
      lastUpdated: data.updated_at,
      repoUrl: data.html_url,
    });
    logger.info(`GitHub cache updated for ${repoName}`);
  } catch (err) {
    logger.error(`Failed to update GitHub cache for ${repoName}: ${err.message}`);
  }
}

/**
 * Main deploy function
 */
async function deployProject(project) {
  try {
    const repoName = sanitizeRepoName(project.domain);
    const repoUrl = project.githubRepo || await createGithubRepo(project.domain);
    const projectPath = initProjectFolder(repoName);
    await pushToGithub(projectPath, repoUrl);
    await updateCacheForProject(project);
    createNginxConfig(project.domain, repoName);
    logger.info(`Deployment finished for ${project.domain}`);
  } catch (err) {
    logger.error(`Deployment failed for ${project.domain}: ${err.message}`);
  }
}

module.exports = { deployProject , deleteProject};
