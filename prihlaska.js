import { SERVICES, geocodeQueryUrl } from './lib.js';

const USER_AGENT = 'najdi-ajtaka (https://github.com/romanzdk/najdi-ajtaka)';

// Drop control/invisible chars (newlines, bidi overrides) so a field can't fake extra lines.
const oneLine = (v, max) => String(v ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizePhone(s) {
  return s.replace(/[^\d+]/g, '').replace(/^00/, '+');
}

export function fromForm(raw) {
  const phone = oneLine(raw.phone, 40);
  return {
    name: oneLine(raw.name, 100),
    city: oneLine(raw.city, 100),
    phone: phone ? normalizePhone(phone) : '',
    email: oneLine(raw.email, 200),
    web: oneLine(raw.web, 200),
    services: Array.isArray(raw.services) ? raw.services.filter((s) => s in SERVICES) : [],
    visits: raw.visits === true,
    note: String(raw.note ?? '').replace(/[\p{Cf}]/gu, '').replace(/\r\n/g, '\n').trim().slice(0, 300),
    ico: oneLine(raw.ico, 20).replace(/\s/g, ''),
    consent: raw.consentPublish === true && raw.consentProcessing === true,
  };
}

const BLOCKED_NAME = /microsoft|apple|google|samsung|windows|banka|banky|spořitelna|sporitelna|policie|podpora|support|helpdesk|bezpečnost|bezpecnost|úřad|urad/i;

export function validate(p) {
  const errors = [];
  if (!p.consent) errors.push('Zaškrtněte prosím oba souhlasy dole.');
  if (!p.name) errors.push('Vyplňte prosím jméno.');
  if (!p.city) errors.push('Vyplňte prosím město.');
  if (!p.phone && !p.email) errors.push('Vyplňte prosím telefon nebo e-mail, ať se vám lidé můžou ozvat.');
  if (p.name && BLOCKED_NAME.test(p.name)) errors.push('Jméno: nepoužívejte prosím názvy firem, bank, úřadů ani slova jako „podpora“. Napište své jméno nebo název své firmy.');
  // 90x numbers are premium-rate lines; only regular CZ landline/mobile prefixes 2–7 are allowed.
  if (p.phone && !/^(\+420)?[2-7]\d{8}$/.test(p.phone)) errors.push('Telefon: napište prosím jedno české číslo, např. 777 123 456.');
  if (p.email && !/^[^\s@?&]+@[^\s@?&]+\.[a-z]{2,}$/i.test(p.email)) errors.push('E-mail: napište prosím jen e-mailovou adresu, např. jan@seznam.cz.');
  if (p.web && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(p.web)) errors.push('Web: napište celou adresu včetně https://');
  if (p.ico && !/^\d{8}$/.test(p.ico)) errors.push('IČO má 8 číslic.');
  if (!p.services.length) errors.push('Vyberte prosím aspoň jednu oblast, se kterou pomáháte.');
  return errors;
}

export async function checkIco(ico, fetchFn = fetch) {
  if (!/^\d{8}$/.test(ico || '')) return { ok: false, reason: 'IČO nemá 8 číslic' };
  try {
    const res = await fetchFn(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) return { ok: false, reason: 'IČO v ARES nenalezeno' };
    if (!res.ok) return { ok: false, reason: 'ARES nedostupný' };
    const data = await res.json();
    if (data.datumZaniku) return { ok: false, reason: `Subjekt zanikl ${data.datumZaniku}`, name: data.obchodniJmeno };
    return { ok: true, name: data.obchodniJmeno };
  } catch {
    return { ok: false, reason: 'ARES nedostupný' };
  }
}

const LEGAL_FORMS = /\b(s\.?\s?r\.?\s?o|spol|a\.?\s?s|v\.?\s?o\.?\s?s|k\.?\s?s|z\.?\s?s|o\.?\s?p\.?\s?s|se)\b\.?/g;
const simplify = (s) => (s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(LEGAL_FORMS, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

export function namesMatch(applicant, aresName) {
  const a = simplify(applicant);
  const b = simplify(aresName);
  return Boolean(a && b) && (a === b || a.includes(b) || b.includes(a));
}

export async function geocode(city, fetchFn = fetch) {
  const res = await fetchFn(geocodeQueryUrl(city), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const found = await res.json();
  if (!found.length) return null;
  return { lat: Number(Number(found[0].lat).toFixed(4)), lon: Number(Number(found[0].lon).toFixed(4)), label: found[0].display_name };
}

export function toHelper(id, p, geo, ico) {
  const h = { id, name: p.name, city: p.city, lat: geo.lat, lon: geo.lon };
  for (const k of ['phone', 'email', 'web']) if (p[k]) h[k] = p[k];
  h.services = p.services;
  h.visits = p.visits;
  if (p.note) h.note = p.note;
  if (ico.ok && namesMatch(p.name, ico.name)) {
    h.ico = p.ico;
    h.icoName = ico.name;
  }
  return h;
}

const inlineCode = (s) => `\`${String(s).replace(/[`\n]/g, "'")}\``;

export function buildIssueBody(p, geo, ico, helper) {
  const json = JSON.stringify(helper, null, 2);
  const longestRun = Math.max(0, ...(json.match(/`+/g) || []).map((r) => r.length));
  const fence = '`'.repeat(Math.max(4, longestRun + 1));
  const icoLine = !p.ico
    ? 'nevyplněno'
    : helper.ico
    ? `${inlineCode(p.ico)} → ✔ ARES: ${inlineCode(ico.name)} (jméno sedí, dostane štítek)`
    : ico.ok
    ? `${inlineCode(p.ico)} → ARES: ${inlineCode(ico.name)}, ale jméno nesedí → bez štítku`
    : `${inlineCode(p.ico)} → bez štítku (${ico.reason})`;
  return [
    '**Zkontroluj před schválením:**',
    `- Jméno: ${inlineCode(p.name)}`,
    `- Místo na mapě: ${inlineCode(geo.label)} (${geo.lat}, ${geo.lon})`,
    `- IČO: ${icoLine}`,
    '- Zavolej na uvedené číslo a ověř, že to je opravdu on/ona.',
    '',
    'Schválení: přidej štítek **schvaleno**. Údaje se dají před schválením opravit přímo v JSON níže (Edit).',
    'Zamítnutí: issue smaž (Delete issue).',
    '',
    `${fence}json`,
    json,
    fence,
  ].join('\n');
}

const cityError = (city) => `Město „${city}“ se nepodařilo najít na mapě. Zkuste ho napsat jinak (např. „Mnichovice“ nebo PSČ).`;

export async function processApplication(raw, { fetchFn = fetch, id } = {}) {
  const p = fromForm(raw);
  const errors = validate(p);
  if (errors.length) return { errors };
  let geo;
  try {
    geo = await geocode(p.city, fetchFn);
  } catch {
    return { errors: ['Mapová služba teď neodpovídá. Zkuste to prosím za chvíli znovu.'] };
  }
  if (!geo) return { errors: [cityError(p.city)] };
  const ico = p.ico ? await checkIco(p.ico, fetchFn) : { ok: false, reason: 'nevyplněno' };
  const helper = toHelper(id, p, geo, ico);
  return { helper, title: `Přihláška: ${p.name}`, body: buildIssueBody(p, geo, ico, helper) };
}

export function extractHelper(issueBody) {
  const m = issueBody.match(/^(`{3,})json\n([\s\S]*?)\n\1$/m);
  if (!m) throw new Error('V issue chybí blok ```json');
  const h = JSON.parse(m[2]);
  const ok = typeof h.id === 'string' && typeof h.name === 'string' && typeof h.city === 'string'
    && Number.isFinite(h.lat) && Number.isFinite(h.lon) && Array.isArray(h.services);
  if (!ok) throw new Error('JSON v issue nemá povinná pole (id, name, city, lat, lon, services)');
  const errors = validate({ ...h, phone: h.phone || '', email: h.email || '', web: h.web || '', ico: h.ico || '', consent: true });
  if (errors.length) throw new Error(errors.join(' '));
  return h;
}

export function upsertHelper(data, helper) {
  return [...data.filter((h) => h.id !== helper.id), helper];
}

const TEST_NAME = /\b(test\w*|zk[oO]u[sš]k\w*|pokus\w*|asdf|xxx)\b/i;
const RISKY_NOTE = /hesl|\bpin\b|předem|predem|záloh|zaloh|anydesk|teamviewer|rustdesk|vzdálen|vzdalen|kryptom|bitcoin|volejte ihned/i;
const IN_CZ = (h) => h.lat > 48.5 && h.lat < 51.1 && h.lon > 12 && h.lon < 18.9;

// Automatic approval: returns { helper } to publish, or { reason } for manual review.
export function autoReview(issueBody, data) {
  let helper;
  try {
    helper = extractHelper(issueBody);
  } catch (err) {
    return { reason: err.message };
  }
  if (TEST_NAME.test(helper.name)) return { reason: 'jméno vypadá jako test' };
  if (!IN_CZ(helper)) return { reason: 'místo na mapě není v ČR' };
  if (helper.web) return { reason: 'vyplněný web – zkontroluj ho ručně' };
  if (helper.note && RISKY_NOTE.test(helper.note)) return { reason: 'poznámka zmiňuje hesla, platbu předem nebo vzdálený přístup' };
  const icoLine = (issueBody.match(/^- IČO: (.*)$/m) || [])[1] || 'nevyplněno';
  if (icoLine !== 'nevyplněno' && !helper.ico) return { reason: `IČO nesedí ke jménu (${icoLine})` };
  const sameContact = data.filter((h) => (helper.phone && h.phone === helper.phone) || (helper.email && h.email === helper.email));
  const other = sameContact.find((h) => h.name !== helper.name);
  if (other) return { reason: `stejný telefon nebo e-mail už má ${other.name}` };
  if (sameContact.length) helper = { ...helper, id: sameContact[0].id };
  return { helper, update: sameContact.length > 0 };
}
