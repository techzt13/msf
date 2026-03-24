#!/usr/bin/env node
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MSF_DATA_DIR = path.join(os.homedir(), '.msf');       // user data
const MSF_CODE_DIR = path.join(os.homedir(), '.msf-app');   // code
const CONFIG_FILE = path.join(MSF_DATA_DIR, 'config.json');

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return null;
  }
}

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  const { default: chalk } = await import('chalk');
  const { default: gradient } = await import('gradient-string');
  const { default: figlet } = await import('figlet');
  const { default: boxen } = await import('boxen');
  const { default: open } = await import('open');
  const { default: ora } = await import('ora');

  const printBanner = () => {
    const banner = figlet.textSync('MSF', { font: 'Big' });
    console.log(gradient.pastel.multiline(banner));
    console.log(chalk.dim('  My Smart Friend — AI Gateway\n'));
  };

  // ── msf setup ───────────────────────────────────────────────
  if (command === 'setup') {
    printBanner();
    const { runSetup } = await import('./setup.js');
    await runSetup({ set: () => {}, get: () => {} });
    return;
  }

  // ── msf stop ────────────────────────────────────────────────
  if (command === 'stop') {
    const pidFile = path.join(MSF_DATA_DIR, 'gateway.pid');
    if (fs.existsSync(pidFile)) {
      const pid = fs.readFileSync(pidFile, 'utf8').trim();
      try {
        process.kill(parseInt(pid), 'SIGTERM');
        fs.unlinkSync(pidFile);
        console.log(chalk.green('✓ MSF gateway stopped.'));
      } catch {
        console.log(chalk.yellow('Gateway was not running.'));
        fs.unlinkSync(pidFile);
      }
    } else {
      console.log(chalk.yellow('Gateway is not running.'));
    }
    return;
  }

  // ── msf update ──────────────────────────────────────────────
  if (command === 'update') {
    printBanner();
    console.log(chalk.dim('  Updating MSF code only — ~/.msf/ is never touched.\n'));

    const spinner = ora({ text: 'Fetching latest MSF from GitHub...', color: 'cyan' }).start();
    try {
      execSync(
        'curl -fsSL https://raw.githubusercontent.com/techzt13/msf/main/install.sh | bash',
        { stdio: 'pipe' }
      );
      spinner.succeed(chalk.green('MSF updated successfully ✓'));
      console.log('');
      console.log(boxen(
        chalk.white('MSF is up to date.\n\n') +
        chalk.dim('Your config, memory, soul, token and workspace\n') +
        chalk.dim('in ~/.msf/ are completely untouched.\n\n') +
        chalk.white('Run ') + chalk.cyan('msf') + chalk.white(' to start.'),
        { padding: 1, borderColor: 'green', borderStyle: 'round' }
      ));
    } catch (err) {
      spinner.fail(chalk.red('Update failed'));
      console.log(chalk.dim(err.message));
      console.log(chalk.dim('\nManual update:\n  curl -fsSL https://raw.githubusercontent.com/techzt13/msf/main/install.sh | bash'));
      process.exit(1);
    }
    return;
  }

  // ── msf (start gateway) ──────────────────────────────────────
  const config = readConfig();
  if (!config || !config.setup_complete) {
    printBanner();
    console.log(boxen(
      chalk.yellow('MSF is not set up yet.\n\n') +
      chalk.white('Run: ') + chalk.cyan('msf setup'),
      { padding: 1, borderColor: 'yellow', borderStyle: 'round' }
    ));
    process.exit(1);
  }

  printBanner();
  const { startGateway } = await import('../gateway/server.js');
  const port = config.port || 3000;

  fs.writeFileSync(path.join(MSF_DATA_DIR, 'gateway.pid'), String(process.pid));

  console.log(boxen(
    chalk.green(`✓ ${config.msf_name || 'MSF'} is starting...\n\n`) +
    chalk.white('URL: ') + chalk.cyan(`http://localhost:${port}`) + '\n' +
    chalk.dim('Your data: ~/.msf/\n') +
    chalk.dim('Press Ctrl+C to stop'),
    { padding: 1, borderColor: 'green', borderStyle: 'round' }
  ));

  await startGateway();

  setTimeout(() => {
    open(`http://localhost:${port}`);
  }, 1000);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
