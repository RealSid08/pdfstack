// Production acceptance. Set VERIFY_ONLY to comma-separated filenames to rerun
// failures; defaults cover distinct formats, with aliases tested locally.
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import assert from 'node:assert/strict';
import { samples } from './generate-samples.mjs';
const base = process.argv[2] || 'https://pdf.realsid08.me';
const dir = mkdtempSync(join(tmpdir(), 'pdf-realsid-verify-'));
const get = (path) =>
  JSON.parse(
    execFileSync('curl', ['-fsS', `${base}${path}`], { encoding: 'utf8' }),
  );
const health = get('/api/health'),
  capabilities = get('/api/capabilities');
assert.equal(health.ok, true);
assert.equal(capabilities.maxFileBytes, 26214400);
assert.equal(capabilities.textFallback, true);
const fixtures = await samples(dir, capabilities.serverExtensions);
assert.deepEqual(
  fixtures
    .filter((f) => f.name.startsWith('sample.'))
    .map((f) => f.name.slice(7))
    .sort(),
  [...capabilities.serverExtensions].sort(),
);
console.log(
  JSON.stringify({ dir, health, capabilities, fixtureCount: fixtures.length }),
);
const results = [];
const aliases = new Set(
  'htm markdown mht log jsx ts tsx css scss py rb go rs java c h cpp hpp cs php sh bash zsh sql yaml yml toml ini conf'.split(
    ' ',
  ),
);

let lastLaunch = 0;
for (const fixture of fixtures) {
  if (
    !process.env.VERIFY_ALL_ALIASES &&
    fixture.name.startsWith('sample.') &&
    aliases.has(fixture.name.slice(7))
  )
    continue;
  if (
    process.env.VERIFY_ONLY &&
    !process.env.VERIFY_ONLY.split(',').includes(fixture.name)
  )
    continue;
  await new Promise((r) =>
    setTimeout(r, Math.max(0, 21000 - (Date.now() - lastLaunch))),
  );
  const output = join(dir, `${fixture.name}.pdf`),
    headers = output + '.headers';
  const start = Date.now();
  lastLaunch = start;
  try {
    const status = execFileSync(
      'curl',
      [
        '-sS',
        '--max-time',
        '45',
        '-D',
        headers,
        '-o',
        output,
        '-w',
        '%{http_code}',
        '-F',
        `file=@${join(dir, fixture.name)}`,
        `${base}/api/convert`,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(status, '200', readFileSync(output).toString().slice(0, 400));
    const bytes = readFileSync(output);
    assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
    assert.match(
      readFileSync(headers, 'utf8'),
      /content-type: application\/pdf/i,
    );
    const pdf = await PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() > 0);
    const text = execFileSync('/opt/homebrew/bin/pdftotext', [output, '-'], {
      encoding: 'utf8',
    });
    if (fixture.expect)
      assert.ok(
        text.replace(/\s+/g, ' ').includes(fixture.expect),
        `Missing ${fixture.expect}; got ${text.slice(0, 300)}`,
      );
    if (fixture.image) {
      const images = execFileSync(
        '/opt/homebrew/bin/pdfimages',
        ['-list', output],
        { encoding: 'utf8' },
      );
      assert.match(images, /\bimage\b/);
    }
    if (fixture.pages) assert.equal(pdf.getPageCount(), fixture.pages);
    if (fixture.landscape)
      assert.ok(pdf.getPage(0).getWidth() > pdf.getPage(0).getHeight());
    if (fixture.name === 'sample.html')
      assert.ok(!text.includes('SCRIPT_EXECUTED'));
    if (fixture.name === 'sample.epub')
      assert.ok(text.indexOf('EPUB acceptance') < text.indexOf('EPUB second'));
    results.push({
      name: fixture.name,
      ok: true,
      bytes: bytes.length,
      pages: pdf.getPageCount(),
      ms: Date.now() - start,
    });
  } catch (e) {
    results.push({
      name: fixture.name,
      ok: false,
      error: e.message,
      ms: Date.now() - start,
    });
  }
  console.log(JSON.stringify(results.at(-1)));
  writeFileSync(join(dir, 'results.json'), JSON.stringify(results, null, 2));
}
for (const [name, contents, status, code] of [
  ['sample.exe', Buffer.from([0, 255, 1, 2, 3, 0]), '400', 'UNSUPPORTED_TYPE'],
  ['large.txt', Buffer.alloc(26214401, 65), '413', 'TOO_LARGE'],
  [
    'corrupt.docx',
    Buffer.from([80, 75, 3, 4, 0, 0]),
    '422',
    'CONVERSION_FAILED',
  ],
  ['empty.txt', '', '422', 'CONVERSION_FAILED'],
]) {
  writeFileSync(join(dir, name), contents);
  const output = join(dir, `${name}.json`);
  try {
    const actual = execFileSync(
      'curl',
      [
        '-sS',
        '--max-time',
        '45',
        '-o',
        output,
        '-w',
        '%{http_code}',
        '-F',
        `file=@${join(dir, name)}`,
        `${base}/api/convert`,
      ],
      { encoding: 'utf8' },
    );
    const body = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(actual, status);
    assert.deepEqual(Object.keys(body), ['error']);
    assert.equal(body.error.code, code);
    assert.equal(typeof body.error.message, 'string');
    results.push({ name, ok: true, status: actual, code });
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
  }
  console.log(JSON.stringify(results.at(-1)));
}
// Missing file, malformed options, and unknown endpoint do not launch browsers.
for (const [name, args, status, code] of [
  ['missing', ['-F', 'other=value'], '422', 'CONVERSION_FAILED'],
  [
    'options',
    ['-F', `file=@${join(dir, 'sample.txt')}`, '-F', 'options={'],
    '422',
    'CONVERSION_FAILED',
  ],
  ['endpoint', [], '400', 'UNSUPPORTED_TYPE'],
]) {
  const output = join(dir, `${name}.json`);
  try {
    const actual = execFileSync(
      'curl',
      [
        '-sS',
        '-o',
        output,
        '-w',
        '%{http_code}',
        ...args,
        `${base}/api/${name === 'endpoint' ? 'unknown' : 'convert'}`,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(actual, status);
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).error.code, code);
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
  }
  console.log(JSON.stringify(results.at(-1)));
}
writeFileSync(join(dir, 'results.json'), JSON.stringify(results, null, 2));
console.log(
  JSON.stringify({
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    dir,
  }),
);
if (results.some((r) => !r.ok)) process.exitCode = 1;
