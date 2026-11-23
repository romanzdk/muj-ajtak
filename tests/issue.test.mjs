import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIssueBody, normalizePhone, checkIco, toHelper } from '../scripts/issue-to-entry.mjs';

const body = `### Jméno nebo název firmy

<b>Pepa</b>

### Město nebo část města

Brno - Líšeň

### Telefon

+420 777 123 456

### E-mail

_No response_

### Web

_No response_

### S čím pomáháte

- [X] Počítač
- [ ] Telefon a tablet
- [ ] Internet a Wi-Fi
- [X] Tiskárna
- [ ] Ostatní

### Přijedete i domů?

Ano

### Krátká poznámka

_No response_

### IČO (nepovinné)

27074358

### Souhlas

- [X] Souhlasím se zveřejněním těchto údajů na webu`;

test('parseIssueBody reads issue form', () => {
  assert.deepEqual(parseIssueBody(body), {
    name: '<b>Pepa</b>',
    city: 'Brno - Líšeň',
    phone: '+420777123456',
    email: undefined,
    web: undefined,
    services: ['pocitac', 'tiskarna'],
    visits: true,
    note: undefined,
    ico: '27074358',
    consent: true,
  });
});

test('parseIssueBody: unchecked consent and Ne', () => {
  const p = parseIssueBody(body.replace('- [X] Souhlasím', '- [ ] Souhlasím').replace('\nAno\n', '\nNe\n'));
  assert.equal(p.consent, false);
  assert.equal(p.visits, false);
});

test('normalizePhone', () => {
  assert.equal(normalizePhone('777 123 456'), '777123456');
  assert.equal(normalizePhone('+420 777 123 456'), '+420777123456');
});

test('checkIco rejects bad format without calling fetch', async () => {
  let called = false;
  const r = await checkIco('123', async () => { called = true; });
  assert.equal(r.ok, false);
  assert.equal(called, false);
});

const fakeFetch = (status, json) => async () => ({ ok: status === 200, status, json: async () => json });

test('checkIco ok for active company', async () => {
  assert.deepEqual(await checkIco('27074358', fakeFetch(200, { obchodniJmeno: 'X s.r.o.' })), { ok: true, name: 'X s.r.o.' });
});

test('checkIco not ok for dissolved company', async () => {
  const r = await checkIco('27074358', fakeFetch(200, { obchodniJmeno: 'X', datumZaniku: '2020-01-01' }));
  assert.equal(r.ok, false);
});

test('checkIco not ok when not found', async () => {
  assert.equal((await checkIco('27074358', fakeFetch(404, {}))).ok, false);
});

test('checkIco handles network error', async () => {
  const r = await checkIco('27074358', async () => { throw new Error('down'); });
  assert.deepEqual(r, { ok: false, reason: 'ARES nedostupný' });
});

test('toHelper omits empty optionals and sets badge', () => {
  const h = toHelper(42, parseIssueBody(body), { lat: 49.2, lon: 16.7 }, { ok: true });
  assert.deepEqual(h, {
    id: 'gh-42', name: '<b>Pepa</b>', city: 'Brno - Líšeň', lat: 49.2, lon: 16.7,
    phone: '+420777123456', services: ['pocitac', 'tiskarna'], visits: true, icoVerified: true,
  });
  assert.equal(toHelper(1, parseIssueBody(body), { lat: 1, lon: 2 }, { ok: false }).icoVerified, undefined);
});

import { validate, buildPrBody } from '../scripts/issue-to-entry.mjs';

const valid = () => ({ ...parseIssueBody(body) });

test('validate accepts Czech numbers in common formats', () => {
  for (const phone of ['777123456', '+420777123456', '00420777123456'].map(normalizePhone)) {
    assert.deepEqual(validate({ ...valid(), phone }), []);
  }
  assert.equal(normalizePhone('00420 777 123 456'), '+420777123456');
});

test('validate rejects two numbers or text in phone', () => {
  for (const raw of ['777 123 456 nebo 602 111 222', 'po 17h']) {
    const errors = validate({ ...valid(), phone: normalizePhone(raw) });
    assert.ok(errors.some((e) => e.includes('Telefon')), raw);
  }
});

test('validate accepts uppercase HTTPS web', () => {
  assert.deepEqual(validate({ ...valid(), web: 'HTTPS://example.com' }), []);
});

test('parseIssueBody keeps first match when note contains a fake heading', () => {
  const tricky = body.replace('### Krátká poznámka\n\n_No response_', '### Krátká poznámka\n\nahoj\n### Web\n\nhttps://evil.example');
  assert.equal(parseIssueBody(tricky).web, undefined);
});

test('buildPrBody cannot be spoofed by name or note', () => {
  const p = { ...valid(), name: '@someone [x](https://evil)', note: '```\n✔ ARES: fake\n```' };
  const helper = toHelper(5, p, { lat: 1, lon: 2 }, { ok: false });
  const md = buildPrBody(5, p, { lat: 1, lon: 2, label: 'Brno' }, { ok: false, reason: 'nevyplněno' }, helper);
  assert.ok(md.includes('`@someone [x](https://evil)`'));
  const fence = md.match(/^(`{3,})json$/m)[1];
  assert.ok(fence.length > 3, 'fence longer than any backtick run in content');
  assert.ok(md.trimEnd().endsWith('Closes #5'));
});

test('checkIco: 5xx is "nedostupný", 404 is "nenalezeno"', async () => {
  assert.equal((await checkIco('27074358', fakeFetch(503, {}))).reason, 'ARES nedostupný');
  assert.match((await checkIco('27074358', fakeFetch(404, {}))).reason, /nenalezeno/);
});
