import { SERVICES, sortByDistance, filterByServices, formatDistance, formatPhone, geocodeQueryUrl, initials } from './lib.js';
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

const ICONS = {
  pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z M12 7a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
  mail: 'M3 6h18v12H3z M3 7l9 6 9-6',
  web: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M3 12h18 M12 3c3 3.5 3 14.5 0 18 M12 3c-3 3.5-3 14.5 0 18',
};

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

function linkButton(className, href, iconName, text) {
  const a = el('a', `btn ${className}`);
  a.href = href;
  a.append(icon(iconName), document.createTextNode(text));
  return a;
}

let activeId = null;

function focusHelper(id) {
  activeId = id;
  for (const c of resultsEl.querySelectorAll('.card')) c.classList.toggle('active', c.dataset.id === id);
  const m = markers.get(id);
  if (!m) return;
  map.setView(m.getLatLng(), 13);
  m.openPopup();
}

function renderItem(h) {
  const li = el('li', 'card');
  li.tabIndex = 0;
  li.dataset.id = h.id;
  if (h.id === activeId) li.classList.add('active');

  const head = el('div', 'card-head');
  const avatar = el('div', 'avatar', initials(h.name));
  avatar.setAttribute('aria-hidden', 'true');
  const who = el('div', 'who');
  who.append(el('p', 'name', h.name));
  const place = el('p', 'place');
  place.append(icon('pin'), document.createTextNode(h.city));
  who.append(place);
  head.append(avatar, who);
  if (h.distanceKm !== undefined) head.append(el('span', 'dist', formatDistance(h.distanceKm)));
  li.append(head);

  const tags = el('ul', 'tags');
  if (h.ico && h.icoName) {
    const t = el('li', 'tag ok', `IČO ${h.ico} v registru ARES`);
    t.title = `${h.icoName} – IČO existuje v obchodním registru. Neznamená to doporučení ani ověření kvality.`;
    tags.append(t);
  }
  if (h.visits) tags.append(el('li', 'tag ok', 'Přijede i k vám domů'));
  for (const s of h.services) if (SERVICES[s]) tags.append(el('li', 'tag', SERVICES[s]));
  li.append(tags);

  if (h.note) li.append(el('p', 'note', h.note));

  const actions = el('div', 'actions');
  if (h.phone) actions.append(linkButton('btn-call', `tel:${h.phone}`, 'phone', `Zavolat ${formatPhone(h.phone)}`));
  if (h.email) actions.append(linkButton('btn-outline', `mailto:${h.email}`, 'mail', h.email));
  if (h.web && /^https?:\/\//i.test(h.web)) {
    const a = linkButton('btn-outline', h.web, 'web', h.web.replace(/^https?:\/\//i, '').replace(/\/$/, ''));
    a.rel = 'noopener nofollow';
    a.target = '_blank';
    actions.append(a);
  }
  li.append(actions);

  const report = el('button', 'linkish report', 'Nahlásit problém');
  report.type = 'button';
  report.addEventListener('click', (e) => {
    e.stopPropagation();
    openMail(`Nahlášení: ${h.name}`);
  });
  li.append(report);

  li.addEventListener('click', (e) => { if (!e.target.closest('a, button')) focusHelper(h.id); });
  li.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === li) focusHelper(h.id); });
  return li;
}

function render() {
  const list = currentList();
  resultsEl.replaceChildren(...list.map(renderItem));
  $('#count').textContent = all.length ? String(list.length) : '';
  if (!list.length && all.length) resultsEl.append(el('li', 'empty', 'Pro vybranou pomoc zatím nikoho nemáme. Zkuste zrušit výběr nahoře. Služba je nová a ajťáci přibývají.'));
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

function pinIcon(h) {
  const div = el('div', 'pin');
  div.append(el('b', null, initials(h.name)));
  return L.divIcon({ html: div, className: '', iconSize: [40, 40], iconAnchor: [20, 40], popupAnchor: [0, -38] });
}

function setOrigin(lat, lon, label) {
  origin = { lat, lon };
  if (userMarker) userMarker.remove();
  const me = L.divIcon({ html: el('div', 'me'), className: '', iconSize: [22, 22], iconAnchor: [11, 11] });
  userMarker = L.marker([lat, lon], { icon: me, keyboard: false })
    .addTo(map)
    .bindPopup(el('span', null, label));
  map.setView([lat, lon], 11);
  render();
  const nearest = currentList()[0];
  statusEl.textContent = nearest
    ? `Nejbližší ajťák je ${formatDistance(nearest.distanceKm)} od ${label === 'Vy jste zde' ? 'vás' : `místa „${label}“`}. Seznam je seřazený od nejbližšího.`
    : 'Pro vybranou pomoc zatím nikoho nemáme. Zkuste zrušit výběr výše.';
  // On phones the results sit below the search box; bring them into view so nobody misses them.
  if (matchMedia('(max-width: 959px)').matches) statusEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const m = L.marker([h.lat, h.lon], { icon: pinIcon(h), title: h.name }).bindPopup(() => popupContent(h));
  m.on('click', () => {
    focusHelper(h.id);
    resultsEl.querySelector(`[data-id="${CSS.escape(h.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  markers.set(h.id, m);
}
render();
if (markers.size) map.fitBounds(L.featureGroup([...markers.values()]).getBounds().pad(0.2));
