// Independent real-world legacy PPT and Content-Location MHTML fixtures.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import { zipSync } from 'fflate';
const base = process.argv[2] || 'https://pdf.realsid08.me',
  dir = mkdtempSync(join(tmpdir(), 'pdf-extra-'));
// Apache POI's checked-in binary PowerPoint fixture, not a generated CFB shell.
const source =
  'https://svn.apache.org/repos/asf/poi/tags/REL_3_14_FINAL/test-data/slideshow/basic_test_ppt_file.ppt';
execFileSync('curl', [
  '-fsS',
  '--max-time',
  '30',
  source,
  '-o',
  join(dir, 'actual.ppt'),
]);
const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
  'base64',
);
const html = `MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="sample"\r\n\r\n--sample\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Content Location acceptance sample</p><img src="https://example.test/local.png">\r\n--sample\r\nContent-Type: image/png\r\nContent-Location: https://example.test/local.png\r\nContent-Transfer-Encoding: base64\r\n\r\n${image.toString('base64')}\r\n--sample--\r\n`;
writeFileSync(join(dir, 'location.mhtml'), html);
for (const [name, expect, pages] of [
  ['actual.ppt', 'This is the title on page 2', 2],
  ['location.mhtml', 'Content Location acceptance sample', 1],
]) {
  await new Promise((r) => setTimeout(r, 21000));
  const form = new FormData();
  form.set('file', new File([readFileSync(join(dir, name))], name));
  const res = await fetch(base + '/api/convert', {
    method: 'POST',
    body: form,
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.equal(res.status, 200, new TextDecoder().decode(bytes).slice(0, 300));
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), '%PDF');
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), pages);
  const path = join(dir, name + '.pdf');
  writeFileSync(path, bytes);
  const text = execFileSync('/opt/homebrew/bin/pdftotext', [path, '-'], {
    encoding: 'utf8',
  });
  assert.ok(text.includes(expect));
  if (name === 'actual.ppt') {
    assert.ok(!text.includes('Master'));
    assert.equal(text.split('This is a test title').length - 1, 1);
  } else
    assert.match(
      execFileSync('/opt/homebrew/bin/pdfimages', ['-list', path], {
        encoding: 'utf8',
      }),
      /\bimage\b/,
    );
  console.log(
    JSON.stringify({ name, ok: true, pages, bytes: bytes.length, dir }),
  );
}
const bomb = zipSync({ 'word/document.xml': new Uint8Array(41 * 1024 * 1024) });
const f = new FormData();
f.set('file', new File([bomb], 'oversized-archive.docx'));
const r = await fetch(base + '/api/convert', { method: 'POST', body: f });
assert.equal(r.status, 422);
assert.equal((await r.json()).error.code, 'CONVERSION_FAILED');
console.log('Archive expansion limit passed.');
