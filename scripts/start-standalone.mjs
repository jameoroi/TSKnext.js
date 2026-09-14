import { spawn } from 'node:child_process';
import { cp } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const standaloneRoot = path.join(root, '.next', 'standalone');

// Next's standalone output intentionally omits these directories. Copy them
// at start so the same production artifact serves CSS, client JS, images and
// public files in local, container and self-hosted deployments.
await cp(path.join(root, 'public'), path.join(standaloneRoot, 'public'), {
  recursive: true,
  force: true,
});
await cp(path.join(root, '.next', 'static'), path.join(standaloneRoot, '.next', 'static'), {
  recursive: true,
  force: true,
});

const server = spawn(process.execPath, [path.join(standaloneRoot, 'server.js')], {
  cwd: standaloneRoot,
  env: process.env,
  stdio: 'inherit',
});

server.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
