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
    out[label.trim()] = value === '_No response_' ? '' : value;
  }
  return out;
}

const checked = (value) =>
  value.split('\n').filter((l) => /^- \[x\]/i.test(l)).map((l) => l.replace(/^- \[x\]\s*/i, '').trim());

export function normalizePhone(s) {
  return s.replace(/[^\d+]/g, '');
}

export function parseIssueBody(body) {
  const s = sections(body);
  const get = (key, max = 200) => (s[FIELDS[key]] || '').slice(0, max) || undefined;
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
    note: get('note', 300),
    ico: get('ico')?.replace(/\s/g, ''),
    consent: checked(s[FIELDS.consent] || '').length > 0,
  };
}

export async function checkIco(ico, fetchFn = fetch) {
  if (!/^\d{8}$/.test(ico || '')) return { ok: false, reason: 'IČO nemá 8 číslic' };
  try {
    const res = await fetchFn(`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, reason: `IČO v ARES nenalezeno (HTTP ${res.status})` };
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
  if (ico.ok) h.icoVerified = true;
  return h;
}

function validate(p) {
  const errors = [];
  if (!p.consent) errors.push('Chybí souhlas se zveřejněním.');
  if (!p.name) errors.push('Chybí jméno.');
  if (!p.city) errors.push('Chybí město.');
  if (!p.phone && !p.email) errors.push('Vyplňte prosím telefon nebo e-mail, ať se vám lidé můžou ozvat.');
  if (p.web && !/^https?:\/\//.test(p.web)) errors.push('Web musí začínat https:// nebo http://.');
  if (!p.services.length) errors.push('Vyberte prosím aspoň jednu oblast, se kterou pomáháte.');
  return errors;
}

async function geocode(city) {
  const res = await fetch(geocodeQueryUrl(city), { headers: { 'User-Agent': USER_AGENT } });
  const found = res.ok ? await res.json() : [];
  if (!found.length) return null;
  return { lat: Number(Number(found[0].lat).toFixed(4)), lon: Number(Number(found[0].lon).toFixed(4)), label: found[0].display_name };
}

async function main() {
  const issueNumber = process.argv[2];
  const p = parseIssueBody(process.env.ISSUE_BODY || '');
  const errors = validate(p);
  const geo = errors.length ? null : await geocode(p.city);
  if (!errors.length && !geo) errors.push(`Město „${p.city}“ se nepodařilo najít na mapě. Upravte ho prosím (např. „Brno - Líšeň“ nebo PSČ).`);
  if (errors.length) {
    writeFileSync('error.md', `Díky za přihlášku! Ještě to nejde zpracovat:\n\n${errors.map((e) => `- ${e}`).join('\n')}\n\nUpravte prosím přihlášku (Edit) a zkusíme to znovu.`);
    process.exit(1);
  }
  const ico = p.ico ? await checkIco(p.ico) : { ok: false, reason: 'nevyplněno' };
  const helper = toHelper(issueNumber, p, geo, ico);

  const data = JSON.parse(readFileSync('data.json', 'utf8')).filter((h) => h.id !== helper.id);
  data.push(helper);
  writeFileSync('data.json', `${JSON.stringify(data, null, 2)}\n`);

  writeFileSync('pr-body.md', [
    `Nová přihláška z #${issueNumber}.`,
    '',
    '**Zkontroluj před schválením:**',
    `- Jméno: ${p.name}`,
    `- Místo na mapě: ${geo.label} (${geo.lat}, ${geo.lon})`,
    `- IČO: ${p.ico || '—'} → ${ico.ok ? `✔ ARES: ${ico.name}` : `bez odznaku (${ico.reason}${ico.name ? `, ${ico.name}` : ''})`}`,
    ico.ok ? '- Sedí název z ARES k jménu v přihlášce?' : '',
    '',
    '```json',
    JSON.stringify(helper, null, 2),
    '```',
    '',
    `Closes #${issueNumber}`,
  ].join('\n'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
