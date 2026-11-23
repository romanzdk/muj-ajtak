import { SERVICES, sortByDistance, filterByServices, formatDistance, formatPhone, geocodeQueryUrl } from './lib.js';
import { openMail } from './mail.js';

const $ = (sel) => document.querySelector(sel);
const statusEl = $('#status');
const resultsEl = $('#results');

const map = L.map('map', { dragging: !L.Browser.mobile, tap: false }).setView([49.8, 15.5], 7);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; přispěvatelé <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

let all = [];
let origin = null;
let userMarker = null;
const markers = new Map();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function selectedServices() {
  return [...document.querySelectorAll('input[name="service"]:checked')].map((i) => i.value);
}

function currentList() {
  const filtered = filterByServices(all, selectedServices());
  return origin ? sortByDistance(filtered, origin) : [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'cs'));
}

function renderItem(h) {
  const li = el('li');
  li.tabIndex = 0;
  li.append(el('p', 'name', h.name));
  const place = h.distanceKm !== undefined ? `${formatDistance(h.distanceKm)} · ${h.city}` : h.city;
  li.append(el('p', 'place', place));
  if (h.icoVerified) li.append(el('p', 'badge', '✔ Ověřené IČO'));
  li.append(el('p', null, h.services.map((s) => SERVICES[s]).filter(Boolean).join(', ')));
  if (h.visits) li.append(el('p', null, '🏠 Přijede i k vám domů'));
  if (h.note) li.append(el('p', null, h.note));
  if (h.phone) {
    const a = el('a', 'phone', `📞 ${formatPhone(h.phone)}`);
    a.href = `tel:${h.phone}`;
    li.append(a);
  }
  if (h.email) {
    const p = el('p');
    const a = el('a', null, `✉️ ${h.email}`);
    a.href = `mailto:${h.email}`;
    p.append(a);
    li.append(p);
  }
  if (h.web && /^https?:\/\//i.test(h.web)) {
    const p = el('p');
    const a = el('a', null, `🌐 ${h.web}`);
    a.href = h.web;
    a.rel = 'noopener nofollow';
    a.target = '_blank';
    p.append(a);
    li.append(p);
  }
  const report = el('button', 'linkish report', 'Nahlásit problém');
  report.type = 'button';
  report.addEventListener('click', (e) => {
    e.stopPropagation();
    openMail(`Nahlášení: ${h.name}`);
  });
  li.append(report);

  const focus = () => {
    const m = markers.get(h.id);
    if (!m) return;
    map.setView(m.getLatLng(), 13);
    m.openPopup();
  };
  li.addEventListener('click', (e) => { if (!e.target.closest('a')) focus(); });
  li.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === li) focus(); });
  return li;
}

function render() {
  const list = currentList();
  resultsEl.replaceChildren(...list.map(renderItem));
  if (!list.length && all.length) resultsEl.append(el('li', null, 'Pro vybranou pomoc zatím nikoho nemáme. Zkuste zrušit výběr výše.'));
  for (const [id, m] of markers) {
    const visible = list.some((h) => h.id === id);
    if (visible && !map.hasLayer(m)) m.addTo(map);
    if (!visible && map.hasLayer(m)) m.remove();
  }
}

function popupContent(h) {
  const div = el('div');
  div.append(el('strong', null, h.name), el('br'), document.createTextNode(h.city));
  if (h.phone) {
    div.append(el('br'));
    const a = el('a', null, formatPhone(h.phone));
    a.href = `tel:${h.phone}`;
    div.append(a);
  }
  return div;
}

function setOrigin(lat, lon, label) {
  origin = { lat, lon };
  if (userMarker) userMarker.remove();
  userMarker = L.circleMarker([lat, lon], { radius: 10, color: '#d93025', fillOpacity: 0.8 })
    .addTo(map)
    .bindPopup(el('span', null, label));
  map.setView([lat, lon], 11);
  render();
  const nearest = currentList()[0];
  statusEl.textContent = nearest
    ? `Nejbližší ajťák je ${formatDistance(nearest.distanceKm)} od ${label === 'Vy jste zde' ? 'vás' : `místa „${label}“`}. Seznam je seřazený od nejbližšího.`
    : 'Pro vybranou pomoc zatím nikoho nemáme. Zkuste zrušit výběr výše.';
}

$('#btn-locate').addEventListener('click', () => {
  const fail = () => {
    statusEl.textContent = 'Polohu se nepodařilo zjistit. Napište prosím své město nebo PSČ do pole níže.';
    $('#place-input').focus();
  };
  if (!navigator.geolocation) return fail();
  statusEl.textContent = 'Zjišťuji vaši polohu…';
  // Firefox calls neither callback when the prompt is dismissed with "Not now".
  const guard = setTimeout(fail, 20000);
  navigator.geolocation.getCurrentPosition(
    (pos) => { clearTimeout(guard); setOrigin(pos.coords.latitude, pos.coords.longitude, 'Vy jste zde'); },
    () => { clearTimeout(guard); fail(); },
    { timeout: 15000, maximumAge: 600000 },
  );
});

$('#place-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#place-input').value.trim();
  if (!q) {
    statusEl.textContent = 'Napište prosím město nebo PSČ.';
    return;
  }
  const btn = e.submitter || $('#place-form button');
  btn.disabled = true;
  statusEl.textContent = 'Hledám…';
  try {
    const res = await fetch(geocodeQueryUrl(q));
    const found = res.ok ? await res.json() : [];
    if (!found.length) {
      statusEl.textContent = 'Místo jsme nenašli, zkuste jiné město nebo PSČ.';
      return;
    }
    setOrigin(Number(found[0].lat), Number(found[0].lon), q);
  } catch {
    statusEl.textContent = 'Hledání teď nefunguje. Zkuste to prosím za chvíli, nebo použijte tlačítko „Najít v mém okolí“.';
  } finally {
    btn.disabled = false;
  }
});

$('#services').addEventListener('change', render);

try {
  all = await (await fetch('data.json')).json();
} catch {
  statusEl.textContent = 'Seznam se nepodařilo načíst. Zkuste prosím obnovit stránku.';
}
for (const h of all) {
  markers.set(h.id, L.marker([h.lat, h.lon]).bindPopup(() => popupContent(h)));
}
render();
if (markers.size) map.fitBounds(L.featureGroup([...markers.values()]).getBounds().pad(0.2));
