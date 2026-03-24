import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import gradient from 'gradient-string';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import path from 'path';

const execAsync = promisify(exec);

export async function runSetup(config) {
  console.log(boxen(
    gradient.rainbow('Welcome to MSF Setup') + '\n\n' +
    chalk.white('This wizard will connect MSF to your GitHub Copilot\n') +
    chalk.white('and configure your personal AI gateway.'),
    { padding: 1, borderColor: 'cyan', borderStyle: 'double', textAlignment: 'center' }
  ));

  console.log('');

  // Step 1: Check GitHub CLI
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

  // Step 2: Auth method
  const { authMethod } = await inquirer.prompt([
    {
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
    }
  ]);

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
    await deviceFlowAuth().then(t => { token = t; });
  } else if (authMethod === 'pat') {
    const { pat } = await inquirer.prompt([
      {
        type: 'password',
        name: 'pat',
        message: chalk.cyan('Paste your GitHub Personal Access Token:'),
        mask: '•'
      }
    ]);
    token = pat.trim();
  }

  // Validate token & check Copilot access
  const spinner2 = ora({ text: 'Validating GitHub Copilot access...', color: 'cyan' }).start();
  try {
    const res = await fetch('https://api.github.com/copilot_internal/v2/token', {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/json'
      }
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

  // Step 3: Configure port
  const { port } = await inquirer.prompt([
    {
      type: 'input',
      name: 'port',
      message: chalk.cyan('Which port should the MSF gateway run on?'),
      default: '3000',
      validate: (val) => {
        const n = parseInt(val);
        if (isNaN(n) || n < 1024 || n > 65535) return 'Please enter a valid port (1024-65535)';
        return true;
      }
    }
  ]);

  // Step 4: Gateway name
  const { gatewayName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'gatewayName',
      message: chalk.cyan('Give your gateway a name:'),
      default: 'My MSF Gateway'
    }
  ]);

  // Step 5: Theme
  const { theme } = await inquirer.prompt([
    {
      type: 'list',
      name: 'theme',
      message: chalk.cyan('Choose your UI theme:'),
      choices: [
        { name: '🌙 Dark (default)', value: 'dark' },
        { name: '☀️  Light', value: 'light' },
        { name: '🌊 Ocean', value: 'ocean' },
        { name: '🌿 Forest', value: 'forest' }
      ]
    }
  ]);

  // Save config
  const saveSpinner = ora({ text: 'Saving configuration...', color: 'cyan' }).start();
  config.set('copilot_token', token);
  config.set('port', parseInt(port));
  config.set('gateway_name', gatewayName);
  config.set('theme', theme);
  config.set('setup_complete', true);
  config.set('setup_date', new Date().toISOString());
  saveSpinner.succeed(chalk.green('Configuration saved'));

  console.log('');
  console.log(boxen(
    gradient.rainbow('✓ Setup Complete!') + '\n\n' +
    chalk.white(`Gateway: ${chalk.cyan(gatewayName)}\n`) +
    chalk.white(`Port: ${chalk.cyan(port)}\n`) +
    chalk.white(`Theme: ${chalk.cyan(theme)}\n\n`) +
    chalk.white('Run ') + chalk.cyan('msf') + chalk.white(' to start your gateway'),
    { padding: 1, borderColor: 'green', borderStyle: 'round', textAlignment: 'center' }
  ));
  console.log('');
}

async function deviceFlowAuth() {
  // GitHub OAuth device flow
  const CLIENT_ID = 'Iv1.b507a08c87ecfe98'; // GitHub Copilot CLI client ID

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

  // Poll for token
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
