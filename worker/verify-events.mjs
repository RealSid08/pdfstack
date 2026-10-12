// Tests the public endpoint; use wrangler tail --search product_event separately
// to verify ingestion, not just the HTTP acknowledgement.
import assert from 'node:assert/strict';
const base = process.argv[2] || 'https://pdf.realsid08.me';
const cases = [
  [
    'valid',
    {
      event: 'pdf_downloaded',
      count: 2,
      bytes: 1234,
      pages: 3,
      durationMs: 245,
      route: 'server',
      outcome: 'success',
      viewport: 'desktop',
      filename: 'MUST_NOT_BE_LOGGED',
    },
    204,
  ],
  ['unknown event', { event: 'unexpected' }, 400],
  ['negative', { event: 'files_added', count: -1 }, 400],
  ['too big number', { event: 'files_added', bytes: 2 ** 40 }, 400],
  ['numeric string', { event: 'files_added', count: '2' }, 400],
  ['fractional count', { event: 'files_added', count: 1.5 }, 400],
  ['route', { event: 'file_ready', route: 'private-file-name' }, 400],
  ['outcome', { event: 'file_ready', outcome: 'unexpected' }, 400],
  ['viewport', { event: 'page_view', viewport: 'unexpected' }, 400],
  ['oversize', { event: 'page_view', junk: 'x'.repeat(2100) }, 413],
  ['cross origin', { event: 'page_view' }, 403, 'https://example.com'],
  ['missing origin', { event: 'page_view' }, 403, ''],
];
for (const [name, data, status, origin = base] of cases) {
  const headers = { 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  const response = await fetch(base + '/api/events', {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  assert.equal(response.status, status, name);
  assert.equal(await response.text(), '');
  console.log(JSON.stringify({ name, status, ok: true }));
}
const malformed = await fetch(base + '/api/events', {
  method: 'POST',
  headers: { origin: base, 'content-type': 'application/json' },
  body: '{',
});
assert.equal(malformed.status, 400);
const wrongType = await fetch(base + '/api/events', {
  method: 'POST',
  headers: { origin: base, 'content-type': 'text/plain' },
  body: '{}',
});
assert.equal(wrongType.status, 415);
console.log('All 14 telemetry endpoint cases passed.');
if (process.env.VERIFY_RATE_LIMIT === '1') {
  let limited = 0;
  // Invalid events exercise the limiter without polluting product counts.
  for (let batch = 0; batch < 14; batch++) {
    const statuses = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const r = await fetch(base + '/api/events', {
          method: 'POST',
          headers: { origin: base, 'content-type': 'application/json' },
          body: '{"event":"invalid"}',
        });
        if (r.status === 429) {
          assert.equal(r.headers.get('retry-after'), '60');
          limited++;
        } else assert.equal(r.status, 400);
        await r.arrayBuffer();
        return r.status;
      }),
    );
    if (statuses.every((s) => s === 429)) break;
  }
  assert.ok(limited > 0, 'event rate limiter must reject a burst');
  const form = new FormData();
  form.set('other', 'value');
  const response = await fetch(base + '/api/convert', {
    method: 'POST',
    body: form,
  });
  assert.equal(
    response.status,
    422,
    'event burst must not exhaust conversion limiter',
  );
  console.log(
    JSON.stringify({
      eventLimiter: true,
      limited,
      conversionLimiterIndependent: true,
    }),
  );
}
