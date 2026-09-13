import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const legacyRoot = path.join(root, 'src', 'legacy-api');
const ignored = new Set(['node_modules', '.next', '.open-next', '.git']);
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const files = walk(root).filter((file) => /\.(?:ts|tsx|js|mjs)$/.test(file));
const text = new Map(files.map((file) => [file, fs.readFileSync(file, 'utf8')]));
const legacy = files.filter((file) => file.startsWith(legacyRoot + path.sep));

function resolveImport(importer, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return '';
  const base = specifier.startsWith('@/')
    ? path.join(root, 'src', specifier.slice(2))
    : path.resolve(path.dirname(importer), specifier);
  const candidates = [
    base,
    ...['.ts', '.tsx', '.js', '.mjs'].map((ext) => `${base}${ext}`),
    ...['index.ts', 'index.tsx', 'index.js', 'index.mjs'].map((name) => path.join(base, name)),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || '';
}

function dependencies(importer, source) {
  const specs = [...source.matchAll(/(?:from|import\s*\(|require\s*\()\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1],
  );
  return new Set(specs.map((specifier) => resolveImport(importer, specifier)).filter(Boolean));
}

const reverseGraph = new Map(files.map((file) => [file, new Set()]));
for (const [importer, source] of text) {
  for (const dependency of dependencies(importer, source)) reverseGraph.get(dependency)?.add(importer);
}
const report = legacy.map((file) => {
  const references = [...(reverseGraph.get(file) || [])];
  return {
    file: path.relative(root, file).replaceAll('\\', '/'),
    references: references.map((candidate) => path.relative(root, candidate).replaceAll('\\', '/')),
  };
});
const unused = report.filter((row) => row.references.length === 0);
console.log(
  JSON.stringify(
    {
      legacyFiles: report.length,
      referenced: report.length - unused.length,
      unused: unused.map((row) => row.file),
      report,
    },
    null,
    2,
  ),
);
if (process.argv.includes('--strict') && unused.length) process.exitCode = 1;
