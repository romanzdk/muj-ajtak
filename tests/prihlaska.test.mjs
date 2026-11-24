import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fromForm, validate, normalizePhone, checkIco, namesMatch, toHelper,
  processApplication, extractHelper, upsertHelper,
} from '../prihlaska.js';

const form = () => ({
  name: 'Jan Novák', city: 'Mnichovice', phone: '777 123 456', email: '', web: '',
  services: ['pocitac', 'telefon', 'hacker'], visits: true, note: 'Ahoj', ico: '',
  consentPublish: true, consentProcessing: true,
});
const valid = () => fromForm(form());

test('fromForm cleans fields and drops unknown services', () => {
  const p = fromForm({ ...form(), name: 'Evil‮\n- ✔ ARES: Microsoft', ico: '270 74 358' });
  assert.ok(!/[\n‮]/.test(p.name));
  assert.deepEqual(p.services, ['pocitac', 'telefon']);
  assert.equal(p.phone, '777123456');
  assert.equal(p.ico, '27074358');
});

test('consent needs both boxes', () => {
  assert.ok(validate(fromForm({ ...form(), consentProcessing: false })).length);
  assert.deepEqual(validate(valid()), []);
});

test('normalizePhone', () => {
  assert.equal(normalizePhone('+420 777 123 456'), '+420777123456');
  assert.equal(normalizePhone('00420 777 123 456'), '+420777123456');
});

test('phone: regular CZ ok, premium or junk rejected', () => {
  for (const phone of ['777123456', '+420222333444']) assert.deepEqual(validate({ ...valid(), phone }), [], phone);
  for (const raw of ['909123456', '+420906123456', '777 123 456 nebo 602 111 222', 'po 17h']) {
    assert.ok(validate({ ...valid(), phone: normalizePhone(raw) }).some((e) => e.includes('Telefon')), raw);
  }
});

test('e-mail and web format', () => {
  assert.ok(validate({ ...valid(), email: 'Volejte 909 ?cc=x' }).some((e) => e.includes('E-mail')));
  assert.deepEqual(validate({ ...valid(), email: 'pepa@example.cz' }), []);
  assert.deepEqual(validate({ ...valid(), web: 'HTTPS://example.com' }), []);
  assert.ok(validate({ ...valid(), web: 'javascript:alert(1)' }).some((e) => e.includes('Web')));
});

test('blocked names', () => {
  for (const name of ['Microsoft podpora', 'Banka – bezpečnost', 'Policie ČR', 'Apple Support']) {
    assert.ok(validate({ ...valid(), name }).some((e) => e.includes('Jméno')), name);
  }
});

const fakeFetch = (status, json) => async () => ({ ok: status === 200, status, json: async () => json });

test('checkIco', async () => {
  let called = false;
  assert.equal((await checkIco('123', async () => { called = true; })).ok, false);
  assert.equal(called, false);
  assert.deepEqual(await checkIco('27074358', fakeFetch(200, { obchodniJmeno: 'X s.r.o.' })), { ok: true, name: 'X s.r.o.' });
  assert.equal((await checkIco('27074358', fakeFetch(200, { datumZaniku: '2020-01-01' }))).ok, false);
  assert.match((await checkIco('27074358', fakeFetch(404, {}))).reason, /nenalezeno/);
  assert.equal((await checkIco('27074358', fakeFetch(503, {}))).reason, 'ARES nedostupný');
  assert.equal((await checkIco('27074358', async () => { throw new Error('x'); })).reason, 'ARES nedostupný');
});

test('namesMatch ignores case, diacritics and legal form', () => {
  assert.equal(namesMatch('PC Servis Brno', 'PC SERVIS BRNO s.r.o.'), true);
  assert.equal(namesMatch('Jan Novák', 'Jan Novak'), true);
  assert.equal(namesMatch('Pepa', 'Asseco Central Europe, a.s.'), false);
});

test('toHelper: badge only on name match, empty optionals omitted', () => {
  const geo = { lat: 1, lon: 2 };
  const ok = toHelper('x', { ...valid(), name: 'Asseco Central Europe', ico: '27074358' }, geo, { ok: true, name: 'Asseco Central Europe, a.s.' });
  assert.equal(ok.icoName, 'Asseco Central Europe, a.s.');
  const bad = toHelper('x', { ...valid(), ico: '27074358' }, geo, { ok: true, name: 'Asseco Central Europe, a.s.' });
  assert.equal(bad.ico, undefined);
  assert.equal(bad.email, undefined);
});

const routeFetch = (routes) => async (url) => {
  for (const [part, res] of Object.entries(routes)) if (String(url).includes(part)) return res();
  throw new Error(`unexpected ${url}`);
};
const nominatim = (found) => () => ({ ok: true, status: 200, json: async () => found });

test('processApplication: valid form → helper + issue body with json block', async () => {
  const fetchFn = routeFetch({ nominatim: nominatim([{ lat: '49.93601', lon: '14.70905', display_name: 'Mnichovice, Česko' }]) });
  const r = await processApplication(form(), { fetchFn, id: 'p-1' });
  assert.equal(r.errors, undefined);
  assert.equal(r.helper.lat, 49.936);
  assert.equal(r.title, 'Přihláška: Jan Novák');
  assert.deepEqual(extractHelper(r.body), r.helper);
});

test('processApplication: validation errors, unknown city, geocoder down', async () => {
  assert.ok((await processApplication({ ...form(), name: '' }, { fetchFn: async () => { throw new Error('no'); } })).errors.length);
  const none = await processApplication(form(), { fetchFn: routeFetch({ nominatim: nominatim([]) }), id: 'p' });
  assert.match(none.errors[0], /nepodařilo najít/);
  const down = await processApplication(form(), { fetchFn: async () => { throw new Error('down'); }, id: 'p' });
  assert.match(down.errors[0], /neodpovídá/);
});

test('note with backticks cannot break out of the json fence', async () => {
  const fetchFn = routeFetch({ nominatim: nominatim([{ lat: '1', lon: '2', display_name: 'X' }]) });
  const r = await processApplication({ ...form(), note: '```\n"id": "hack"\n````' }, { fetchFn, id: 'p-2' });
  assert.equal(extractHelper(r.body).id, 'p-2');
});

test('extractHelper rejects edited JSON that breaks the rules', () => {
  const body = (h) => '````json\n' + JSON.stringify(h) + '\n````';
  const h = { id: 'p', name: 'Jan', city: 'X', lat: 1, lon: 2, services: ['pocitac'], visits: true, phone: '777123456' };
  assert.deepEqual(extractHelper(body(h)), h);
  assert.throws(() => extractHelper(body({ ...h, phone: '909123456' })), /Telefon/);
  assert.throws(() => extractHelper(body({ ...h, lat: 'x' })), /povinná/);
  assert.throws(() => extractHelper('nic'), /json/);
});

test('upsertHelper replaces by id', () => {
  assert.deepEqual(upsertHelper([{ id: 'a', v: 1 }, { id: 'b' }], { id: 'a', v: 2 }), [{ id: 'b' }, { id: 'a', v: 2 }]);
});

import { autoReview } from '../prihlaska.js';

const issue = (h, ico = 'nevyplněno') => `- IČO: ${ico}\n\n\`\`\`\`json\n${JSON.stringify(h, null, 2)}\n\`\`\`\``;
const base = { id: 'p-new', name: 'Jan Novák', city: 'Mnichovice', lat: 49.936, lon: 14.709, phone: '777123456', services: ['pocitac'], visits: true };

test('autoReview approves a normal application', () => {
  assert.deepEqual(autoReview(issue(base), []), { helper: base, update: false });
});

test('autoReview reuses the id when the same person sends a correction', () => {
  const r = autoReview(issue({ ...base, note: 'nová' }), [{ ...base, id: 'p-old' }]);
  assert.equal(r.helper.id, 'p-old');
  assert.equal(r.update, true);
});

test('autoReview sends suspicious applications to manual review', () => {
  const cases = [
    [{ ...base, name: 'zkouska2' }, 'test'],
    [{ ...base, name: 'Test' }, 'test'],
    [{ ...base, lat: 52.5, lon: 13.4 }, 'ČR'],
    [{ ...base, web: 'https://x.cz' }, 'web'],
    [{ ...base, note: 'Pošlete zálohu a nainstalujte AnyDesk' }, 'předem'],
  ];
  for (const [h, word] of cases) assert.match(autoReview(issue(h), []).reason, new RegExp(word), h.name);
  assert.match(autoReview(issue(base), [{ ...base, id: 'x', name: 'Petr Jiný' }]).reason, /Petr Jiný/);
  assert.match(autoReview(issue(base, '`12345678` → bez štítku (IČO v ARES nenalezeno)'), []).reason, /IČO/);
  assert.match(autoReview('nic', []).reason, /json/);
});

test('autoReview keeps an informal note', () => {
  const note = 'Windows nemám rád, ale když snesete moje klení, pomůžu vám i s nimi.';
  assert.ok(autoReview(issue({ ...base, note }), []).helper);
});
