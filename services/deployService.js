const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Octokit } = require('@octokit/rest');
const logger = require('../config/logger');
const githubCache = require('./githubCache');
const Project = require('../models/Project');
const { publishGitHubStatus } = require('./githubPublisher');
const { getProducer } = require('../config/kafka');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USER = process.env.GITHUB_USER;
const PROJECTS_DIR = '/var/www/microsites';
const NGINX_SITES_AVAILABLE = '/etc/nginx/sites-available';
const NGINX_SITES_ENABLED = '/etc/nginx/sites-enabled';

const octokit = new Octokit({ auth: GITHUB_TOKEN });
const producer = getProducer();

/**
 * Helper: Send Kafka deployment status
 */
async function streamStatus(domain, message, type = 'info') {
  const payload = {
    domain,
    timestamp: new Date().toISOString(),
    type, // 'info' or 'error'
    message
  };
  try {
    await producer.send({
      topic: 'deployments',
      messages: [{ value: JSON.stringify(payload) }],
    });
  } catch (err) {
    console.error(`Failed to send Kafka message: ${err.message}`);
  }
}

/**
 * Sanitize domain to use as GitHub repo name
 */
function sanitizeRepoName(domain) {
  return domain.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/**
 * Execute shell command and stream stdout/stderr to Kafka
 */
function runCommand(domain, command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const cmd = spawn(command, args, { shell: true, ...options });

    cmd.stdout.on('data', data => streamStatus(domain, data.toString(), 'info'));
    cmd.stderr.on('data', data => streamStatus(domain, data.toString(), 'error'));

    cmd.on('close', code => {
      if (code === 0) resolve(true);
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
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
    await Project.findOneAndUpdate({ domain }, { githubRepo: `https://github.com/${GITHUB_USER}/${repoName}.git` });
    await streamStatus(domain, `GitHub repo created: ${repoName}`);
    return { status: 'new', url: data.clone_url };
  } catch (err) {
    if (err.status === 422) {
      await Project.findOneAndUpdate({ domain }, { githubRepo: `https://github.com/${GITHUB_USER}/${repoName}.git` });
      await streamStatus(domain, `GitHub repo already exists: ${repoName}`);
      return { status: 'old', url: `https://github.com/${GITHUB_USER}/${repoName}.git` };
    }
    await streamStatus(domain, `GitHub repo creation failed: ${err.message}`, 'error');
    throw err;
  }
}

/**
 * Initialize project folder (clone repo if exists, otherwise create static index.html)
 */
async function initProjectFolder(projectName, domain) {
  const projectPath = path.join(PROJECTS_DIR, projectName);

  if (fs.existsSync(projectPath)) fs.rmSync(projectPath, { recursive: true, force: true });
  fs.mkdirSync(projectPath, { recursive: true });

  const repoUrl = `https://${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${sanitizeRepoName(domain)}.git`;

  try {
    await runCommand(domain, 'git', ['clone', repoUrl, projectPath]);
    await streamStatus(domain, `Cloned repository into ${projectPath}`);
  } catch (err) {
    await streamStatus(domain, `Repo not found, creating default index.html`, 'info');
    const indexHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${projectName}</title>
      </head>
      <body>
          <h1>Welcome to ${projectName}</h1>
          <p>This is a basic Microsite deployed via the dashboard.</p>
      </body>
      </html>
    `;
    fs.writeFileSync(path.join(projectPath, 'index.html'), indexHtml.trim());
    await streamStatus(domain, `Default index.html created`);
  }

  return projectPath;
}

/**
 * Push project to GitHub
 */
async function pushToGithub(projectPath, repo, domain) {
  const tokenRepoUrl = repo.url.replace('https://', `https://${GITHUB_USER}:${GITHUB_TOKEN}@`);

  if (repo.status === 'new') {
    const cmds = [
      'if [ ! -d ".git" ]; then git init; fi',
      'git remote remove origin || true',
      `git remote add origin ${tokenRepoUrl}`,
      'git add .',
      'git commit -m "Initial commit" || true',
      'git branch -M main',
      'git push -u origin main -f'
    ].join(' && ');

    await runCommand(domain, cmds, [], { cwd: projectPath });
    await streamStatus(domain, `Project pushed to GitHub`);
  } else {
    // Already existing repo, just pull latest
    await runCommand(domain, 'git', ['pull', tokenRepoUrl, 'main'], { cwd: projectPath });
    await streamStatus(domain, `Existing repo updated on server`);
  }
}

/**
 * Create Nginx config + SSL
 */
async function createNginxConfig(domain, projectName) {
  const configContent = `
server {
    listen 80;
    server_name ${domain};

    root ${PROJECTS_DIR}/${projectName};
    index index.html;

    # Restrict to India -> Maharashtra
    if ($geoip2_country_code != "IN") {
        return 403;
    }

    location / {
        try_files $uri $uri/ =404;
    }
}
  `.trim();

  const configPath = path.join(NGINX_SITES_AVAILABLE, projectName);
  fs.writeFileSync(configPath, configContent);
  await streamStatus(domain, `Nginx config written for ${domain}`);

  const enabledPath = path.join(NGINX_SITES_ENABLED, projectName);
  if (!fs.existsSync(enabledPath)) fs.symlinkSync(configPath, enabledPath);

  try {
    await runCommand(domain, 'nginx', ['-s', 'reload']);
    await streamStatus(domain, `Nginx reloaded for ${domain}`);
  } catch (err) {
    await streamStatus(domain, `Nginx reload error: ${err.message}`, 'error');
  }

  try {
    await runCommand(domain, 'certbot', ['--nginx', '-d', domain, '--non-interactive', '--agree-tos', '-m', `admin@${domain}`, '--redirect']);
    await streamStatus(domain, `Certbot SSL installed for ${domain}`);
  } catch (err) {
    await streamStatus(domain, `Certbot SSL error: ${err.message}`, 'error');
  }
}

/**
 * Update GitHub cache
 */
async function updateCacheForProject(project) {
  const repoName = sanitizeRepoName(project.domain);
  try {
    const { data } = await octokit.repos.get({ owner: GITHUB_USER, repo: repoName });
    githubCache.set(`${GITHUB_USER}/${repoName}`, {
      stars: data.stargazers_count,
      forks: data.forks_count,
      watchers: data.watchers_count,
      openIssues: data.open_issues_count,
      lastUpdated: data.updated_at,
      repoUrl: data.html_url,
    });
    await streamStatus(project.domain, `GitHub cache updated for ${repoName}`);
  } catch (err) {
    await streamStatus(project.domain, `Failed to update GitHub cache: ${err.message}`, 'error');
  }
}

/**
 * Delete project folder
 */
async function deleteProject(project) {
  return new Promise((resolve, reject) => {
    const repoName = sanitizeRepoName(project.domain);
    const projectPath = path.join(PROJECTS_DIR, repoName);

    fs.rm(projectPath, { recursive: true, force: true }, async (err) => {
      if (err) {
        await streamStatus(project.domain, `Failed to delete project folder: ${err.message}`, 'error');
        return reject(err);
      }
      await streamStatus(project.domain, `Project folder deleted: ${projectPath}`);
      resolve(true);
    });
  });
}

/**
 * Main deploy function
 */
async function deployProject(project) {
  try {
    const repo = project.githubRepo
      ? { status: 'old', url: project.githubRepo }
      : await createGithubRepo(project.domain);

    const projectPath = await initProjectFolder(sanitizeRepoName(project.domain), project.domain);

    await pushToGithub(projectPath, repo, project.domain);
    await updateCacheForProject(project);
    await createNginxConfig(project.domain, sanitizeRepoName(project.domain));
    await publishGitHubStatus(project);

    await streamStatus(project.domain, `Deployment finished for ${project.domain}`);
  } catch (err) {
    await streamStatus(project.domain, `Deployment failed: ${err.message}`, 'error');
  }
}

module.exports = {
  deployProject,
  deleteProject
};
