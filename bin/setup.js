import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import gradient from 'gradient-string';
import { execSync } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
const MSF_DIR = path.join(os.homedir(), '.msf');

export async function runSetup(config) {
  console.log(boxen(
    gradient.rainbow('Welcome to MSF Setup') + '\n\n' +
    chalk.white('This wizard will connect MSF to your GitHub Copilot\n') +
    chalk.white('and configure your personal AI gateway.'),
    { padding: 1, borderColor: 'cyan', borderStyle: 'double', textAlignment: 'center' }
  ));

  console.log('');

  // ── Step 1: GitHub Copilot Auth ──────────────────────────────
  const spinner1 = ora({ text: 'Checking GitHub CLI...', color: 'cyan' }).start();
  let ghAvailable = false;
  try {
    execSync('gh --version', { stdio: 'ignore' });
    ghAvailable = true;
    spinner1.succeed(chalk.green('GitHub CLI found'));
  } catch {
    spinner1.warn(chalk.yellow('GitHub CLI not found — will use device flow instead'));
  }

  console.log('');

  const { authMethod } = await inquirer.prompt([{
    type: 'list',
    name: 'authMethod',
    message: chalk.cyan('How would you like to authenticate with GitHub Copilot?'),
    choices: [
      ...(ghAvailable ? [{
        name: chalk.green('🔑 GitHub CLI (recommended)') + chalk.dim(' — uses your existing gh auth'),
        value: 'gh'
      }] : []),
      {
        name: chalk.blue('🌐 Device Flow') + chalk.dim(' — authorize in browser'),
        value: 'device'
      },
      {
        name: chalk.yellow('🔐 PAT Token') + chalk.dim(' — paste a GitHub token manually'),
        value: 'pat'
      }
    ]
  }]);

  let token = null;

  if (authMethod === 'gh') {
    const spinner = ora({ text: 'Getting token from GitHub CLI...', color: 'cyan' }).start();
    try {
      const { stdout } = await execAsync('gh auth token');
      token = stdout.trim();
      spinner.succeed(chalk.green('Got token from GitHub CLI'));
    } catch {
      spinner.fail(chalk.red('Failed to get token from gh CLI'));
      console.log(chalk.dim('Try running: gh auth login'));
      process.exit(1);
    }
  } else if (authMethod === 'device') {
    token = await deviceFlowAuth();
  } else {
    const { pat } = await inquirer.prompt([{
      type: 'password',
      name: 'pat',
      message: chalk.cyan('Paste your GitHub Personal Access Token:'),
      mask: '•'
    }]);
    token = pat.trim();
  }

  // Validate Copilot access
  const spinner2 = ora({ text: 'Validating GitHub Copilot access...', color: 'cyan' }).start();
  try {
    const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/json' }
    });
    if (!res.ok) {
      spinner2.fail(chalk.red('Could not access GitHub Copilot API'));
      console.log(chalk.dim('Make sure your account has an active GitHub Copilot subscription.'));
      process.exit(1);
    }
    spinner2.succeed(chalk.green('GitHub Copilot access confirmed ✓'));
  } catch (err) {
    spinner2.fail(chalk.red('Validation failed: ' + err.message));
    process.exit(1);
  }

  console.log('');

  // ── Step 2: Gateway config ───────────────────────────────────
  const { port } = await inquirer.prompt([{
    type: 'input',
    name: 'port',
    message: chalk.cyan('Which port should the MSF gateway run on?'),
    default: '3000',
    validate: val => {
      const n = parseInt(val);
      if (isNaN(n) || n < 1024 || n > 65535) return 'Enter a valid port (1024-65535)';
      return true;
    }
  }]);

  const { theme } = await inquirer.prompt([{
    type: 'list',
    name: 'theme',
    message: chalk.cyan('Choose your UI theme:'),
    choices: [
      { name: '🌙 Dark (default)', value: 'dark' },
      { name: '☀️  Light', value: 'light' },
      { name: '🌊 Ocean', value: 'ocean' },
      { name: '🌿 Forest', value: 'forest' }
    ]
  }]);

  console.log('');
  console.log(chalk.bold.cyan('  ── Identity Setup ──────────────────────────────'));
  console.log(chalk.dim('  MSF has a personality and remembers who you are.\n'));

  // ── Step 3: User identity ────────────────────────────────────
  const { userName } = await inquirer.prompt([{
    type: 'input',
    name: 'userName',
    message: chalk.cyan('What\'s your name?'),
    validate: val => val.trim().length > 0 || 'Please enter your name'
  }]);

  const { userBio } = await inquirer.prompt([{
    type: 'input',
    name: 'userBio',
    message: chalk.cyan('Anything else MSF should know about you? (optional)'),
    default: ''
  }]);

  // ── Step 4: MSF identity ─────────────────────────────────────
  const { msfName } = await inquirer.prompt([{
    type: 'input',
    name: 'msfName',
    message: chalk.cyan('What should MSF call itself?'),
    default: 'MSF'
  }]);

  console.log('');

  // ── Save everything ──────────────────────────────────────────
  const saveSpinner = ora({ text: 'Saving configuration...', color: 'cyan' }).start();

  config.set('copilot_token', token);
  config.set('port', parseInt(port));
  config.set('theme', theme);
  config.set('gateway_name', msfName + ' Gateway');
  config.set('msf_name', msfName);
  config.set('user_name', userName);
  config.set('setup_complete', true);
  config.set('setup_date', new Date().toISOString());

  // Write soul.md
  fs.mkdirSync(MSF_DIR, { recursive: true });

  const soulContent = `# SOUL

## Who ${msfName} Is

- Warm but not sappy. Helpful but not performative.
- Sharp and direct — gives real answers, not filler.
- Has a dry sense of humor. Uses it naturally, not forcefully.
- Remembers context across the conversation.
- Has opinions. Will disagree respectfully if something seems off.
- Takes initiative — if something can be improved, says so.

## Core Values

- Be genuinely useful, not just responsive.
- Never pad replies with unnecessary text.
- Treat the user as an intelligent adult.
- Be honest even when it's not what they want to hear.

## Vibe

Think of that one friend who's brilliant, easy to talk to, and always follows through. That's ${msfName}.
`;

  const userContent = `# USER

## Profile

- **Name:** ${userName}
${userBio ? `- **Notes:** ${userBio}` : ''}

## Memory

(${msfName} will add things here as it learns about you.)
`;

  const memoryContent = `# MEMORY

(${msfName} will store important facts here during conversations.)
`;

  fs.writeFileSync(path.join(MSF_DIR, 'soul.md'), soulContent);
  fs.writeFileSync(path.join(MSF_DIR, 'user.md'), userContent);
  fs.writeFileSync(path.join(MSF_DIR, 'memory.md'), memoryContent);

  saveSpinner.succeed(chalk.green('Configuration saved'));

  console.log('');
  console.log(boxen(
    gradient.rainbow('✓ Setup Complete!') + '\n\n' +
    chalk.white(`Hi ${userName}! Your AI is named ${chalk.cyan(msfName)}.\n`) +
    chalk.white(`Port: ${chalk.cyan(port)} · Theme: ${chalk.cyan(theme)}\n\n`) +
    chalk.white('Run ') + chalk.cyan('msf') + chalk.white(' to start your gateway.\n') +
    chalk.dim('In chat, say "remember that..." to update memory.\n') +
    chalk.dim('Say "update your soul: ..." to tweak personality.'),
    { padding: 1, borderColor: 'green', borderStyle: 'round', textAlignment: 'center' }
  ));
  console.log('');
}

async function deviceFlowAuth() {
  const CLIENT_ID = 'Iv1.b507a08c87ecfe98';
  const spinner = ora({ text: 'Requesting device code...', color: 'cyan' }).start();

  const codeRes = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, scope: 'copilot' })
  });

  const codeData = await codeRes.json();
  spinner.stop();

  console.log('');
  console.log(boxen(
    chalk.white('Open this URL in your browser:\n\n') +
    chalk.cyan(codeData.verification_uri) + '\n\n' +
    chalk.white('Enter code: ') + chalk.bold.yellow(codeData.user_code),
    { padding: 1, borderColor: 'cyan', borderStyle: 'round' }
  ));
  console.log('');

  const pollSpinner = ora({ text: 'Waiting for authorization...', color: 'cyan' }).start();

  while (true) {
    await new Promise(r => setTimeout(r, (codeData.interval || 5) * 1000));

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: codeData.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    });

    const tokenData = await tokenRes.json();

    if (tokenData.access_token) {
      pollSpinner.succeed(chalk.green('Authorized ✓'));
      return tokenData.access_token;
    }

    if (tokenData.error === 'access_denied') {
      pollSpinner.fail(chalk.red('Authorization denied'));
      process.exit(1);
    }
  }
}
