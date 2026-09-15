import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const standalone = `${root}/.next/standalone`;

if (!existsSync(standalone)) {
  throw new Error('standalone_build_missing');
}

mkdirSync(`${standalone}/.next`, { recursive: true });
cpSync(`${root}/.next/static`, `${standalone}/.next/static`, { recursive: true });
if (existsSync(`${root}/public`)) {
  cpSync(`${root}/public`, `${standalone}/public`, { recursive: true });
}

// OpenNext copies the traced standalone tree and recreates pnpm's symlinks
// (e.g. node_modules/next -> .pnpm/next@…). Materializing those links turns
// them into directories that OpenNext skips, so esbuild falls back to the
// project's root node_modules and bundles sharp's native binaries, breaking
// `opennextjs-cloudflare build` on every platform (including Workers Builds).
// Keep the links by default; only materialize when explicitly requested for a
// local Windows machine whose esbuild cannot read linked directories.
if (process.env.MATERIALIZE_STANDALONE_SYMLINKS !== '1') {
  process.exit(0);
}

function resolveLink(linkPath) {
  let current = linkPath;
  for (let depth = 0; depth < 32; depth += 1) {
    const stat = lstatSync(current);
    if (!stat.isSymbolicLink()) return current;
    current = path.resolve(path.dirname(current), readlinkSync(current));
  }
  throw new Error(`standalone_symlink_loop:${linkPath}`);
}

function materializeSymlinks(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    const stat = lstatSync(entryPath);
    if (stat.isSymbolicLink()) {
      const targetPath = resolveLink(entryPath);
      if (!existsSync(targetPath)) {
        throw new Error(`standalone_dangling_symlink:${entryPath}`);
      }
      rmSync(entryPath, { force: true, recursive: true });
      cpSync(targetPath, entryPath, { dereference: true, force: true, recursive: true });
      continue;
    }
    if (stat.isDirectory()) materializeSymlinks(entryPath);
  }
}

materializeSymlinks(standalone);
