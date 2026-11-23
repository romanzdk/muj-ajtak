# Můj ajťák

Jednoduchý web, kde lidé (hlavně senioři) najdou ajťáka ve svém okolí: seznam seřazený podle vzdálenosti, mapa a hledání podle polohy nebo města / PSČ.

Web: https://romanzdk.github.io/muj-ajtak/

## Jak to funguje

- Statická stránka na GitHub Pages. Seznam ajťáků je v `data.json`.
- Mapa: Leaflet + OpenStreetMap. Hledání města: Nominatim.
- Přihláška: formulář `pridat-se.html` → Cloudflare Worker (`worker/index.js`, adresa `https://muj-ajtak.romanzdk.workers.dev/prihlaska`).
  - Worker zkontroluje údaje (`prihlaska.js`), ochranu proti robotům (Turnstile), najde město na mapě a ověří IČO v ARES.
  - Pak založí **soukromé** issue v `romanzdk/muj-ajtak-prihlasky`.
- Schválení: v soukromém repu přidej issue štítek `schvaleno`. Workflow tam ajťáka přidá do `data.json` tady a web se do pár minut aktualizuje. Postup je v README soukromého repa.

## Ruční přidání nebo odebrání

Uprav `data.json` (souřadnice města najdeš třeba na mapy.com, zaokrouhli na 4 desetinná místa):

```json
{ "id": "rucne-1", "name": "Jan Novák", "city": "Mnichovice", "lat": 49.936, "lon": 14.709,
  "phone": "777123456", "services": ["pocitac", "telefon"], "visits": true }
```

Typy pomoci: `pocitac`, `telefon`, `internet`, `tiskarna`, `ostatni`. Nepovinné: `email`, `web`, `note`, `ico` + `icoName`.

## Worker

```sh
npx wrangler deploy                       # nasazení
npx wrangler secret put GITHUB_TOKEN      # token: jen muj-ajtak-prihlasky, Issues: write
npx wrangler secret put TURNSTILE_SECRET  # z Cloudflare → Turnstile
```

## Vývoj

```sh
npm test                 # node --test tests/
python3 -m http.server   # pak http://localhost:8000
```
