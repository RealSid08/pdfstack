import assert from 'node:assert/strict';
const origin = process.argv[2] || 'https://stack.realsid08.me';
const get = async (path, init) => {
  const response = await fetch(origin + path, { ...init, signal: AbortSignal.timeout(20000) });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return response;
};
const health = await (await get('/api/health')).json();
assert.equal(health.ok, true);
assert.ok(health.version);
const capabilities = await (await get('/api/capabilities')).json();
assert.ok(capabilities.serverExtensions.includes('docx'));
assert.equal(capabilities.textFallback, true);
const html = await (await get('/')).text();
assert.match(html, /<title>Stack · Combine files into one PDF<\/title>/);
const script = html.match(/src="([^"]+\.js)"/);
assert.ok(script, 'App JavaScript entry must exist');
await get(script[1]);
// Probe validation without recording a synthetic user visit on every deploy.
const event = await fetch(origin + '/api/events', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ event: 'deployment_probe' }), signal: AbortSignal.timeout(20000) });
assert.equal(event.status, 400);
console.log(JSON.stringify({ ok: true, origin, deploymentVersion: health.version }));
