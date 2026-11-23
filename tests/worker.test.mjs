import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const env = { TURNSTILE_SECRET: 's', GITHUB_TOKEN: 't' };
const ORIGIN = 'https://romanzdk.github.io';
const form = {
  name: 'Jan Novák', city: 'Mnichovice', phone: '777 123 456', services: ['pocitac'], visits: true,
  consentPublish: true, consentProcessing: true, turnstileToken: 'tok',
};
const post = (body, origin = ORIGIN) => new Request('https://w.example/prihlaska', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

let calls;
const reply = (status, body) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('turnstile')) return reply(200, { success: init.body.get('response') === 'tok' });
    if (String(url).includes('nominatim')) return reply(200, [{ lat: '49.936', lon: '14.709', display_name: 'Mnichovice' }]);
    if (String(url).includes('api.github.com')) return reply(201, { number: 1 });
    throw new Error(String(url));
  };
});

test('valid application creates a private issue', async () => {
  const res = await worker.fetch(post(form), env);
  assert.equal(res.status, 200);
  const gh = calls.find((c) => c.url.includes('api.github.com'));
  assert.ok(gh.url.endsWith('/repos/romanzdk/muj-ajtak-prihlasky/issues'));
  assert.equal(gh.init.headers.Authorization, 'Bearer t');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('foreign origin gets 404 and nothing is called', async () => {
  const res = await worker.fetch(post(form, 'https://evil.example'), env);
  assert.equal(res.status, 404);
  assert.equal(calls.length, 0);
});

test('honeypot pretends success without creating an issue', async () => {
  const res = await worker.fetch(post({ ...form, website: 'spam' }), env);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
});

test('failed turnstile is rejected', async () => {
  const res = await worker.fetch(post({ ...form, turnstileToken: 'bad' }), env);
  assert.equal(res.status, 403);
  assert.ok(!calls.some((c) => c.url.includes('api.github.com')));
});

test('validation errors come back as 422 with Czech messages', async () => {
  const res = await worker.fetch(post({ ...form, phone: '909123456' }), env);
  assert.equal(res.status, 422);
  assert.match((await res.json()).errors[0], /Telefon/);
});

test('GitHub failure gives friendly 502', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).includes('api.github.com') ? reply(500, {}) : orig(url, init));
  const res = await worker.fetch(post(form), env);
  assert.equal(res.status, 502);
});

test('CORS preflight answers 204 without body', async () => {
  const res = await worker.fetch(new Request('https://w.example/prihlaska', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

import { buildNotifyEmail } from '../worker/index.js';

test('notify e-mail has UTF-8 subject, applicant and issue link', () => {
  const raw = buildNotifyEmail({ name: 'Jan Novák', city: 'Mnichovice' }, 'https://github.com/romanzdk/muj-ajtak-prihlasky/issues/7', new Date('2026-11-23T10:00:00Z'));
  assert.match(raw, /^From: .*<prihlasky@najdiajtaka\.cz>$/m);
  assert.match(raw, /^To: romanzdk@gmail\.com$/m);
  assert.match(raw, /^Subject: =\?UTF-8\?B\?/m);
  assert.match(raw, /Content-Type: text\/plain; charset=utf-8/);
  const body = Buffer.from(raw.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8');
  assert.ok(body.includes('Jan Novák, Mnichovice'));
  assert.ok(body.includes('https://github.com/romanzdk/muj-ajtak-prihlasky/issues/7'));
  const subject = raw.match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/m)[1];
  assert.equal(Buffer.from(subject, 'base64').toString('utf8'), 'Nová přihláška: Jan Novák');
});

test('application still succeeds when the notify e-mail fails', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => (String(url).includes('api.github.com') ? reply(201, { number: 7, html_url: 'https://github.com/x/y/issues/7' }) : orig(url, init));
  let sent = 0;
  const res = await worker.fetch(post(form), { ...env, NOTIFY: { send: async () => { sent++; throw new Error('mail down'); } } });
  assert.equal(res.status, 200);
});
