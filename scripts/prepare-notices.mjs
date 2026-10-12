// Preserve the locked dependency license texts alongside distributed assets.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const inventory = JSON.parse(execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], { encoding: 'utf8' }));
mkdirSync('dist/licenses', { recursive: true });
let notices = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
for (const packages of Object.values(inventory)) {
  for (const pkg of packages) {
    const texts = [];
    for (const directory of pkg.paths) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isFile() && /^(licen[cs]e|copying|notice)([._-]|$)/i.test(entry.name)) {
          texts.push(`--- ${entry.name} ---\n${readFileSync(join(directory, entry.name), 'utf8')}`);
        }
      }
    }
    const filename = `${pkg.name.replaceAll('/', '__')}.txt`;
    if (texts.length) {
      writeFileSync(join('dist/licenses', filename), `${pkg.name} ${pkg.versions.join(', ')}\n${texts.join('\n\n')}\n`);
    }
  }
}
writeFileSync('dist/THIRD_PARTY_NOTICES.md', notices);
writeFileSync('dist/LICENSE.txt', readFileSync('LICENSE'));
console.log('Prepared third-party license texts in dist/licenses');
