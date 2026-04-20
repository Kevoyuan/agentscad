import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';
import { createServer, IncomingMessage, ServerResponse } from 'http';

const PORT = 3010; // Health check port
const projectRoot = resolve(__dirname, '../..');

// Health check server
const healthServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Next.js dev server wrapper is running\n');
});
healthServer.listen(PORT, () => {
  console.log(`Health check server on port ${PORT}`);
});

// Start Next.js dev server
let child: ChildProcess | null = null;

function startNext() {
  console.log('Starting Next.js dev server...');
  child = spawn('node', [
    resolve(projectRoot, 'node_modules/.bin/next'),
    'dev', '-p', '3000'
  ], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: { ...process.env },
  });

  child.on('exit', (code, signal) => {
    console.log(`Next.js exited with code=${code} signal=${signal}, restarting in 5s...`);
    child = null;
    setTimeout(startNext, 5000);
  });

  child.on('error', (err) => {
    console.error('Failed to start Next.js:', err);
    setTimeout(startNext, 5000);
  });
}

startNext();

process.on('SIGTERM', () => {
  if (child) child.kill('SIGTERM');
  healthServer.close();
  process.exit(0);
});
