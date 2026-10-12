// Generates disposable samples and verifies the deployed contract using real curl uploads.
// Run: node worker/verify-live.mjs [https://pdf.realsid08.me]
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { zipSync, strToU8 } from 'fflate';
import * as XLSX from 'xlsx';
import { PDFDocument } from 'pdf-lib';
import assert from 'node:assert/strict';
const base = process.argv[2] || 'https://pdf.realsid08.me';
const dir = mkdtempSync(join(tmpdir(), 'pdf-realsid-verify-'));
const word = `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX acceptance sample</w:t></w:r></w:p></w:body></w:document>`;
writeFileSync(join(dir, 'sample.docx'), zipSync({
  '[Content_Types].xml': strToU8(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`),
  '_rels/.rels': strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`),
  'word/document.xml': strToU8(word),
}));
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Product', 'Quantity'], ['Apples', 3], ['Rice', 2]]), 'Groceries');
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Second sheet sample'], ['Page break verified']]), 'Notes');
writeFileSync(join(dir, 'sample.xlsx'), XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
const samples = {
  md: '# Markdown acceptance sample\n\n**Bold** and a table.\n\n| Item | Count |\n|---|---|\n| Apples | 3 |\n',
  txt: 'TXT acceptance sample\nLiteral <script>alert(1)</script> stays text.\n',
  csv: 'Name,Count\n"CSV acceptance sample",3\n"Comma, inside",4\n',
  json: '{"acceptance":"JSON acceptance sample","items":[1,2,3]}',
  html: '<h1>HTML acceptance sample</h1><script>document.body.textContent="SCRIPT_EXECUTED"</script><iframe src="http://169.254.169.254/"></iframe><img src="https://example.com/tracker.png"><style>@import "https://example.com/style.css";</style><p>Safe content remains.</p>',
};
for (const [ext, text] of Object.entries(samples)) writeFileSync(join(dir, `sample.${ext}`), text);
const health = JSON.parse(execFileSync('curl', ['-fsS', `${base}/api/health`], { encoding: 'utf8' }));
assert.equal(health.ok, true);
const capabilities = JSON.parse(execFileSync('curl', ['-fsS', `${base}/api/capabilities`], { encoding: 'utf8' }));
assert.equal(capabilities.maxFileBytes, 26214400);
console.log(JSON.stringify({ dir, health, capabilities }));
for (const ext of ['docx', 'xlsx', ...Object.keys(samples)]) {
  // Workers Free permits one new browser per 20 seconds for the whole account.
  await new Promise((resolve) => setTimeout(resolve, 21000));
  const output = join(dir, `${ext}.pdf`);
  const headers = join(dir, `${ext}.headers`);
  const status = execFileSync('curl', ['-sS', '--max-time', '45', '-D', headers, '-o', output, '-w', '%{http_code}', '-F', `file=@${join(dir, `sample.${ext}`)}`, '-F', `options=${JSON.stringify({ pageSize: ext === 'txt' ? 'Letter' : 'A4', landscape: ext === 'xlsx' })}`, `${base}/api/convert`], { encoding: 'utf8' });
  assert.equal(status, '200', `${ext}: ${readFileSync(output).toString().slice(0, 400)}`);
  const bytes = readFileSync(output);
  assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
  assert.match(readFileSync(headers, 'utf8'), /content-type: application\/pdf/i);
  const pdf = await PDFDocument.load(bytes);
  assert.ok(pdf.getPageCount() > 0);
  const text = execFileSync('pdftotext', [output, '-'], { encoding: 'utf8' });
  assert.match(text, ext === 'xlsx' ? /Groceries/ : new RegExp(`${ext.toUpperCase() === 'MD' ? 'Markdown' : ext.toUpperCase()} acceptance sample`));
  if (ext === 'html') assert.ok(!text.includes('SCRIPT_EXECUTED'));
  if (ext === 'xlsx') { assert.equal(pdf.getPageCount(), 2); assert.ok(pdf.getPage(0).getWidth() > pdf.getPage(0).getHeight()); }
  if (ext === 'txt') assert.equal(Math.round(pdf.getPage(0).getWidth()), 612);
  console.log(JSON.stringify({ ext, bytes: bytes.length, pages: pdf.getPageCount(), width: pdf.getPage(0).getWidth(), height: pdf.getPage(0).getHeight() }));
}
for (const [name, contents, expectedStatus, expectedCode] of [
  ['sample.exe', 'unsupported', '400', 'UNSUPPORTED_TYPE'],
  ['large.txt', Buffer.alloc(26214401, 65), '413', 'TOO_LARGE'],
  ['corrupt.docx', 'not a zip', '422', 'CONVERSION_FAILED'],
]) {
  writeFileSync(join(dir, name), contents);
  const output = join(dir, `${name}.json`);
  const status = execFileSync('curl', ['-sS', '--max-time', '45', '-o', output, '-w', '%{http_code}', '-F', `file=@${join(dir, name)}`, `${base}/api/convert`], { encoding: 'utf8' });
  const body = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(status, expectedStatus); assert.equal(body.error.code, expectedCode);
  console.log(JSON.stringify({ name, status, body }));
}
console.log('All live conversion and error assertions passed. Samples retained at ' + dir);
