// Deterministic service-failure coverage without deliberately disrupting the
// production Browser Rendering service.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const modules = {
  'cloudflare:workers':
    'export const tracing={startSpan(){return {setAttribute(){},setAttributes(){},end(){}}}};',
  '@cloudflare/puppeteer':
    'export default {launch: (...args)=>globalThis.testLaunch(...args)};',
};
registerHooks({
  resolve(specifier, context, next) {
    if (modules[specifier])
      return {
        url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]),
        shortCircuit: true,
      };
    if (specifier === 'mammoth') specifier = 'mammoth/mammoth.browser.js';
    if (
      specifier.startsWith('./') &&
      context.parentURL?.includes('/worker/') &&
      !specifier.endsWith('.ts')
    )
      specifier += '.ts';
    return next(specifier, context);
  },
});
const worker = (await import('./index.ts')).default;
const env = {
  CONVERT_LIMITER: { limit: async () => ({ success: true }) },
  BROWSER: {},
  VERSION: { id: 'test' },
};
const pending = [];
const ctx = {
  waitUntil(p) {
    pending.push(p);
  },
};
const request = () => {
  const form = new FormData();
  form.set('file', new File(['Service error test'], 'test.txt'));
  return new Request('https://example.test/api/convert', {
    method: 'POST',
    body: form,
  });
};
for (const [message, status, code] of [
  ['Service unavailable', 500, 'INTERNAL'],
  ['429 browser rate limit', 429, 'RATE_LIMITED'],
]) {
  globalThis.testLaunch = async () => {
    throw new Error(message);
  };
  const response = await worker.fetch(request(), env, ctx);
  assert.equal(response.status, status);
  assert.equal((await response.json()).error.code, code);
}
let closeCount = 0;
const original = setTimeout;
globalThis.setTimeout = (fn, delay, ...args) =>
  original(fn, delay === 30000 ? 1 : delay, ...args);
globalThis.testLaunch = async () => {
  await new Promise((r) => original(r, 20));
  return {
    close: async () => {
      closeCount++;
    },
  };
};
const timeout = await worker.fetch(request(), env, ctx);
assert.equal(timeout.status, 422);
assert.match((await timeout.json()).error.message, /too long/);
await Promise.all(pending);
assert.ok(closeCount > 0, 'late launched browser must close');
globalThis.setTimeout = original;
console.log(
  JSON.stringify({
    service500: true,
    service429: true,
    deadline422: true,
    lateBrowserClosed: true,
  }),
);
