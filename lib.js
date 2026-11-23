export const SERVICES = {
  pocitac: 'Počítač',
  telefon: 'Telefon a tablet',
  internet: 'Internet a Wi-Fi',
  tiskarna: 'Tiskárna',
  ostatni: 'Ostatní',
};

const rad = (deg) => (deg * Math.PI) / 180;

export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function sortByDistance(helpers, origin) {
  return helpers
    .map((h) => ({ ...h, distanceKm: distanceKm(origin, h) }))
    .sort((x, y) => x.distanceKm - y.distanceKm);
}

export function filterByServices(helpers, services) {
  if (!services.length) return helpers;
  return helpers.filter((h) => h.services.some((s) => services.includes(s)));
}

export function formatDistance(km) {
  if (km < 1) return 'méně než 1 km';
  return `${km.toFixed(1).replace('.', ',')} km`;
}

export function geocodeQueryUrl(q) {
  return `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=cz&limit=1&q=${encodeURIComponent(q)}`;
}
