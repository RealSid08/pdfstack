import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { samples } from './generate-samples.mjs';
import { registerHooks } from 'node:module';
// Match Wrangler's browser export selection for Mammoth.
registerHooks({
  resolve(specifier, context, next) {
    return next(
      specifier === 'mammoth' ? 'mammoth/mammoth.browser.js' : specifier,
      context,
    );
  },
});
const { toHtml, SERVER_EXTENSIONS } = await import('./conversion.ts');
const dir = mkdtempSync(join(tmpdir(), 'pdf-local-'));
const fixtures = await samples(dir, SERVER_EXTENSIONS);
for (const fixture of fixtures) {
  const result = await toHtml(
    new File([readFileSync(join(dir, fixture.name))], fixture.name),
    fixture.name.split('.').at(-1),
  );
  assert.ok(result.html || result.pdf, fixture.name);
  if (result.html && fixture.expect)
    assert.ok(
      result.html.includes(fixture.expect) ||
        result.html.replace(/<[^>]*>/g, '').includes(fixture.expect),
      fixture.name,
    );
}
const aliases =
  'txt log js jsx ts tsx css scss py rb go rs java c h cpp hpp cs php sh bash zsh sql yaml yml toml ini conf unknown'.split(
    ' ',
  );
let reference;
for (const ext of aliases) {
  const result = await toHtml(
    new File(['Parity acceptance sample'], `sample.${ext}`),
    ext,
  );
  const html = result.html.replace(/<h1>.*?<\/h1>/, '');
  if (reference) assert.equal(html, reference, ext);
  else reference = html;
}
for (const group of [
  ['html', 'htm'],
  ['md', 'markdown'],
  ['mhtml', 'mht'],
]) {
  let prior;
  for (const ext of group) {
    const result = await toHtml(
      new File(
        [
          group[0] === 'mhtml'
            ? 'Content-Type: text/html\r\n\r\n<p>Parity acceptance sample</p>'
            : 'Parity acceptance sample',
        ],
        `sample.${ext}`,
      ),
      ext,
    );
    if (prior) assert.equal(result.html, prior);
    else prior = result.html;
  }
}
console.log(
  JSON.stringify({
    fixtures: fixtures.length,
    advertisedExtensions: SERVER_EXTENSIONS.length,
    aliasParity: aliases.length + 6,
    ok: true,
    dir,
  }),
);
