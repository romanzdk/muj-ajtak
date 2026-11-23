import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, sortByDistance, filterByServices, formatDistance, geocodeQueryUrl, SERVICES } from '../lib.js';

const praha = { lat: 50.0755, lon: 14.4378 };
const brno = { lat: 49.1951, lon: 16.6068 };
const helpers = [
  { id: 'a', name: 'A', city: 'Brno', ...brno, services: ['pocitac'], visits: true },
  { id: 'b', name: 'B', city: 'Praha', ...praha, services: ['tiskarna', 'telefon'], visits: false },
  { id: 'c', name: 'C', city: 'Ostrava', lat: 49.8209, lon: 18.2625, services: ['internet'], visits: true },
];

test('distanceKm Praha–Brno is about 185 km', () => {
  assert.ok(Math.abs(distanceKm(praha, brno) - 185) <= 2);
});

test('sortByDistance keeps all helpers, nearest first, without mutating input', () => {
  const sorted = sortByDistance(helpers, praha);
  assert.deepEqual(sorted.map(h => h.id), ['b', 'a', 'c']);
  assert.equal(sorted.length, 3);
  assert.ok(sorted[2].distanceKm > 250);
  assert.equal(helpers[0].id, 'a');
  assert.equal(helpers[0].distanceKm, undefined);
});

test('filterByServices: empty = all, otherwise any match', () => {
  assert.equal(filterByServices(helpers, []).length, 3);
  assert.deepEqual(filterByServices(helpers, ['tiskarna']).map(h => h.id), ['b']);
  assert.deepEqual(filterByServices(helpers, ['tiskarna', 'internet']).map(h => h.id), ['b', 'c']);
});

test('formatDistance', () => {
  assert.equal(formatDistance(0.4), 'méně než 1 km');
  assert.equal(formatDistance(2.34), '2,3 km');
});

test('geocodeQueryUrl limits to CZ and encodes query', () => {
  const url = geocodeQueryUrl('Brno Líšeň');
  assert.ok(url.startsWith('https://nominatim.openstreetmap.org/search?'));
  assert.ok(url.includes('countrycodes=cz'));
  assert.ok(url.includes('q=Brno%20L%C3%AD%C5%A1e%C5%88'));
});

test('SERVICES has the five categories', () => {
  assert.deepEqual(Object.keys(SERVICES), ['pocitac', 'telefon', 'internet', 'tiskarna', 'ostatni']);
});

test('formatPhone groups digits for readability', async () => {
  const { formatPhone } = await import('../lib.js');
  assert.equal(formatPhone('+420777000002'), '+420 777 000 002');
  assert.equal(formatPhone('777123456'), '777 123 456');
  assert.equal(formatPhone('12345'), '12345');
});
