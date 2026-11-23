import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SERVICES, geocodeQueryUrl } from '../lib.js';

const FIELDS = {
  name: 'Jméno nebo název firmy',
  city: 'Město nebo část města',
  phone: 'Telefon',
  email: 'E-mail',
  web: 'Web',
  services: 'S čím pomáháte',
  visits: 'Přijedete i domů?',
  note: 'Krátká poznámka',
  ico: 'IČO (nepovinné)',
  consent: 'Souhlas',
};
const USER_AGENT = 'muj-ajtak (https://github.com/romanzdk/muj-ajtak)';

function sections(body) {
  const out = {};
  for (const part of body.replace(/\r\n/g, '\n').split(/^### /m).slice(1)) {
    const [label, ...rest] = part.split('\n');
    const value = rest.join('\n').trim();
    // First match wins: a later "### Web" typed inside the note must not override the real field.
    if (!(label.trim() in out)) out[label.trim()] = value === '_No response_' ? '' : value;
  }
  return out;
}

const checked = (value) =>
  value.split('\n').filter((l) => /^- \[x\]/i.test(l)).map((l) => l.replace(/^- \[x\]\s*/i, '').trim());

export function normalizePhone(s) {
  return s.replace(/[^\d+]/g, '').replace(/^00/, '+');
}

export function parseIssueBody(body) {
  const s = sections(body);
  // Single-line fields: drop control/invisible chars (newlines, bidi overrides) so they can't fake extra lines.
  const oneLine = (v) => v.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
  const get = (key, max = 200) => oneLine(s[FIELDS[key]] || '').slice(0, max) || undefined;
  const labelToKey = Object.fromEntries(Object.entries(SERVICES).map(([k, v]) => [v, k]));
  const phone = get('phone');
  return {
    name: get('name', 100),
    city: get('city', 100),
    phone: phone ? normalizePhone(phone) : undefined,
    email: get('email'),
    web: get('web'),
    services: checked(s[FIELDS.services] || '').map((l) => labelToKey[l]).filter(Boolean),
    visits: (s[FIELDS.visits] || '').trim() === 'Ano',
    note: (s[FIELDS.note] || '').replace(/[\p{Cf}]/gu, '').trim().slice(0, 300) || undefined,
    ico: get('ico')?.replace(/\s/g, ''),
    consent: checked(s[FIELDS.consent] || '').length > 0 && !/^- \[ \]/m.test(s[FIELDS.consent] || ''),
  };
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

export function toHelper(issueNumber, p, geo, ico) {
  const h = { id: `gh-${issueNumber}`, name: p.name, city: p.city, lat: geo.lat, lon: geo.lon };
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

const LEGAL_FORMS = /\b(s\.?\s?r\.?\s?o|spol|a\.?\s?s|v\.?\s?o\.?\s?s|k\.?\s?s|z\.?\s?s|o\.?\s?p\.?\s?s|se)\b\.?/g;
const simplify = (s) => (s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  .replace(LEGAL_FORMS, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

export function namesMatch(applicant, aresName) {
  const a = simplify(applicant);
  const b = simplify(aresName);
  return Boolean(a && b) && (a === b || a.includes(b) || b.includes(a));
}

const BLOCKED_NAME = /microsoft|apple|google|samsung|windows|banka|banky|spořitelna|sporitelna|policie|podpora|support|helpdesk|bezpečnost|bezpecnost|úřad|urad/i;

export function validate(p) {
  const errors = [];
  if (!p.consent) errors.push('Chybí souhlas se zveřejněním.');
  if (!p.name) errors.push('Chybí jméno.');
  if (!p.city) errors.push('Chybí město.');
  if (!p.phone && !p.email) errors.push('Vyplňte prosím telefon nebo e-mail, ať se vám lidé můžou ozvat.');
  if (p.name && BLOCKED_NAME.test(p.name)) errors.push('Jméno: nepoužívejte prosím názvy firem, bank, úřadů ani slova jako „podpora“. Napište své jméno nebo název své firmy.');
  // 90x numbers are premium-rate lines; only regular CZ landline/mobile prefixes 2–7 are allowed.
  if (p.phone && !/^(\+420)?[2-7]\d{8}$/.test(p.phone)) errors.push('Telefon: napište prosím jedno české číslo, např. 777 123 456.');
  if (p.email && !/^[^\s@?&]+@[^\s@?&]+\.[a-z]{2,}$/i.test(p.email)) errors.push('E-mail: napište prosím jen e-mailovou adresu, např. jan@seznam.cz.');
  if (p.web && !/^https?:\/\//i.test(p.web)) errors.push('Web musí začínat https:// nebo http://.');
  if (!p.services.length) errors.push('Vyberte prosím aspoň jednu oblast, se kterou pomáháte.');
  return errors;
}

async function geocode(city) {
  const res = await fetch(geocodeQueryUrl(city), {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
  const found = await res.json();
  if (!found.length) return null;
  return { lat: Number(Number(found[0].lat).toFixed(4)), lon: Number(Number(found[0].lon).toFixed(4)), label: found[0].display_name };
}

const inlineCode = (s) => `\`${String(s).replace(/`/g, "'")}\``;

export function buildPrBody(issueNumber, p, geo, ico, helper) {
  const json = JSON.stringify(helper, null, 2);
  const longestRun = Math.max(0, ...(json.match(/`+/g) || []).map((r) => r.length));
  const fence = '`'.repeat(Math.max(4, longestRun + 1));
  const icoLine = helper.ico
    ? `✔ ARES: ${inlineCode(ico.name)} (jméno sedí, dostane štítek)`
    : ico.ok
    ? `ARES: ${inlineCode(ico.name)}, ale jméno nesedí → bez štítku`
    : `bez odznaku (${ico.reason}${ico.name ? `, ${inlineCode(ico.name)}` : ''})`;
  return [
    `Nová přihláška z #${issueNumber}.`,
    '',
    '**Zkontroluj před schválením:**',
    `- Jméno: ${inlineCode(p.name)}`,
    `- Místo na mapě: ${inlineCode(geo.label)} (${geo.lat}, ${geo.lon})`,
    `- IČO: ${p.ico ? inlineCode(p.ico) : '—'} → ${icoLine}`,
    '- Zavolej na uvedené číslo a ověř, že to je opravdu on/ona.',
    '- Těsně před merge zkontroluj ještě jednou diff (autor může issue mezitím upravit).',
    '',
    `${fence}json`,
    json,
    fence,
    '',
    `Closes #${issueNumber}`,
  ].join('\n');
}

const fail = (errors) => {
  writeFileSync('error.md', `Díky za přihlášku! Ještě to nejde zpracovat:\n\n${errors.map((e) => `- ${e}`).join('\n')}\n\nUpravte prosím přihlášku (Edit) a zkusíme to znovu.`);
  process.exit(1);
};

async function main() {
  const issueNumber = process.argv[2];
  const p = parseIssueBody(process.env.ISSUE_BODY || '');
  const errors = validate(p);
  if (errors.length) fail(errors);
  let geo;
  try {
    geo = await geocode(p.city);
  } catch {
    fail(['Mapová služba teď neodpovídá. Zkuste prosím přihlášku za chvíli znovu uložit (Edit → Update).']);
  }
  if (!geo) errors.push(`Město ${inlineCode(p.city.replace(/@/g, ''))} se nepodařilo najít na mapě. Upravte ho prosím (např. „Brno - Líšeň“ nebo PSČ).`);
  if (errors.length) fail(errors);
  const ico = p.ico ? await checkIco(p.ico) : { ok: false, reason: 'nevyplněno' };
  const helper = toHelper(issueNumber, p, geo, ico);

  const data = JSON.parse(readFileSync('data.json', 'utf8')).filter((h) => h.id !== helper.id);
  data.push(helper);
  writeFileSync('data.json', `${JSON.stringify(data, null, 2)}\n`);

  writeFileSync('pr-body.md', buildPrBody(issueNumber, p, geo, ico, helper));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
