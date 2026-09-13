import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const log = execFileSync('git', ['log', '--pretty=format:%s%x09%h', '-100'], { encoding: 'utf8' });
const entries = log.split('\n').filter((line) => /^[a-z]+(?:\([^)]+\))?!?:\s+.+\t[0-9a-f]+$/i.test(line));
const body = entries.length
  ? entries
      .map((line) => {
        const [subject, sha] = line.split('\t');
        return `- ${subject} (${sha})`;
      })
      .join('\n')
  : '- No conventional commits found';
fs.writeFileSync('CHANGELOG.md', `# Changelog\n\n## ${version}\n\n${body}\n`);
