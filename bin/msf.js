#!/usr/bin/env node
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  const { default: chalk } = await import('chalk');
  const { default: gradient } = await import('gradient-string');
  const { default: figlet } = await import('figlet');
  const { default: boxen } = await import('boxen');
  const { default: open } = await import('open');
  const { Conf } = await import('conf');

  const config = new Conf({ projectName: 'msf' });

  const printBanner = () => {
    const banner = figlet.textSync('MSF', { font: 'Big' });
    console.log(gradient.pastel.multiline(banner));
    console.log(chalk.dim('  My Smart Friend — AI Gateway\n'));
  };

  if (command === 'setup') {
    printBanner();
    const { runSetup } = await import('./setup.js');
    await runSetup(config);
    return;
  }

  if (command === 'stop') {
    const pidFile = path.join(process.env.HOME, '.msf', 'gateway.pid');
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

  // Check if configured
  const token = config.get('copilot_token');
  if (!token) {
    printBanner();
    console.log(boxen(
      chalk.yellow('MSF is not set up yet.\n\n') +
      chalk.white('Run: ') + chalk.cyan('msf setup'),
      { padding: 1, borderColor: 'yellow', borderStyle: 'round' }
    ));
    process.exit(1);
  }

  // Start gateway
  printBanner();
  const { startGateway } = await import('../gateway/server.js');
  const port = config.get('port') || 3000;

  console.log(boxen(
    chalk.green('✓ MSF Gateway is starting...\n\n') +
    chalk.white('URL: ') + chalk.cyan(`http://localhost:${port}`) + '\n' +
    chalk.dim('Press Ctrl+C to stop'),
    { padding: 1, borderColor: 'green', borderStyle: 'round' }
  ));

  await startGateway(config);

  // Open browser
  setTimeout(() => {
    open(`http://localhost:${port}`);
  }, 1000);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
