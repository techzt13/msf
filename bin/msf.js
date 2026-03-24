#!/usr/bin/env node
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execSync, spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MSF_DATA_DIR = path.join(os.homedir(), '.msf');
const MSF_CODE_DIR = path.join(os.homedir(), '.msf-app');
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

  // ── msf status ──────────────────────────────────────────────
  if (command === 'status') {
    const pidFile = path.join(MSF_DATA_DIR, 'gateway.pid');
    if (fs.existsSync(pidFile)) {
      const pid = fs.readFileSync(pidFile, 'utf8').trim();
      try {
        process.kill(parseInt(pid), 0); // check if alive
        const config = readConfig();
        const port = config?.port || 3000;
        console.log(chalk.green(`✓ MSF gateway is running (PID ${pid})`));
        console.log(chalk.dim(`  URL: http://localhost:${port}`));
      } catch {
        console.log(chalk.yellow('Gateway PID file exists but process is not running.'));
        fs.unlinkSync(pidFile);
      }
    } else {
      console.log(chalk.yellow('MSF gateway is not running.'));
      console.log(chalk.dim('  Start it with: msf start'));
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
      process.exit(1);
    }
    return;
  }

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

  const port = config.port || 3000;

  // ── msf start (background daemon) ───────────────────────────
  if (command === 'start') {
    const pidFile = path.join(MSF_DATA_DIR, 'gateway.pid');

    // Check if already running
    if (fs.existsSync(pidFile)) {
      const existingPid = fs.readFileSync(pidFile, 'utf8').trim();
      try {
        process.kill(parseInt(existingPid), 0);
        console.log(chalk.yellow(`MSF gateway is already running (PID ${existingPid})`));
        console.log(chalk.dim(`  URL: http://localhost:${port}`));
        console.log(chalk.dim('  Stop it with: msf stop'));
        return;
      } catch {
        // stale pid, continue
        fs.unlinkSync(pidFile);
      }
    }

    const logFile = path.join(MSF_DATA_DIR, 'gateway.log');
    const out = fs.openSync(logFile, 'a');
    const err = fs.openSync(logFile, 'a');

    const child = spawn(process.execPath, [path.join(MSF_CODE_DIR, 'bin', 'msf.js'), '--gateway-only'], {
      detached: true,
      stdio: ['ignore', out, err]
    });

    child.unref();
    fs.writeFileSync(pidFile, String(child.pid));

    console.log(chalk.green(`✓ MSF gateway started in background (PID ${child.pid})`));
    console.log(chalk.dim(`  URL:  http://localhost:${port}`));
    console.log(chalk.dim(`  Logs: ~/.msf/gateway.log`));
    console.log(chalk.dim('  Stop: msf stop'));

    setTimeout(() => {
      open(`http://localhost:${port}`);
    }, 1500);
    return;
  }

  // ── msf --gateway-only (internal, used by daemon) ───────────
  if (command === '--gateway-only') {
    fs.writeFileSync(path.join(MSF_DATA_DIR, 'gateway.pid'), String(process.pid));
    const { startGateway } = await import('../gateway/server.js');
    await startGateway();
    return;
  }

  // ── msf (foreground, default) ────────────────────────────────
  printBanner();

  console.log(boxen(
    chalk.green(`✓ ${config.msf_name || 'MSF'} is starting...\n\n`) +
    chalk.white('URL: ') + chalk.cyan(`http://localhost:${port}`) + '\n' +
    chalk.dim('Your data: ~/.msf/\n') +
    chalk.dim('Press Ctrl+C to stop  |  Run ') + chalk.cyan('msf start') + chalk.dim(' to run in background'),
    { padding: 1, borderColor: 'green', borderStyle: 'round' }
  ));

  fs.writeFileSync(path.join(MSF_DATA_DIR, 'gateway.pid'), String(process.pid));

  const { startGateway } = await import('../gateway/server.js');
  await startGateway();

  setTimeout(() => {
    open(`http://localhost:${port}`);
  }, 1000);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
