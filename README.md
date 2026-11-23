# Můj ajťák

Jednoduchý web, kde lidé (hlavně senioři) najdou ajťáka ve svém okolí: seznam seřazený podle vzdálenosti, mapa a hledání podle polohy nebo města / PSČ.

Web: https://romanzdk.github.io/muj-ajtak/

## Jak to funguje

- Statická stránka na GitHub Pages, bez serveru a databáze. Seznam ajťáků je v `data.json`.
- Mapa: Leaflet + OpenStreetMap. Hledání města: Nominatim.
- Ajťák se přihlásí přes formulář (issue „Přidat se jako ajťák“). Workflow `.github/workflows/pridat-se.yml` z něj udělá PR, který upraví `data.json`.
  - Vyplněné IČO se ověří v ARES. Když firma existuje a nezanikla, záznam dostane odznak „Ověřené IČO“.
  - Když v přihlášce něco chybí, workflow napíše do issue, co opravit. Po úpravě issue se spustí znovu.

## Schválení přihlášky

1. Otevři PR „Přidat ajťáka z #…“.
2. Zkontroluj jméno, místo na mapě a u IČO, jestli název z ARES sedí ke jménu v přihlášce.
3. Merge → issue se zavře a web se do minuty aktualizuje.

Když má PR konflikt (dva PR naráz): Actions → „Přihláška → PR“ → Run workflow → číslo issue. PR se vytvoří znovu z aktuálního `main`.

## Ruční přidání (bez GitHubu)

Doplň záznam do `data.json` (souřadnice města najdeš třeba na mapy.com, zaokrouhli na 4 desetinná místa):

```json
{ "id": "rucne-1", "name": "Jan Novák", "city": "Brno - Líšeň", "lat": 49.2148, "lon": 16.6995,
  "phone": "+420777123456", "services": ["pocitac", "telefon"], "visits": true }
```

Typy pomoci: `pocitac`, `telefon`, `internet`, `tiskarna`, `ostatni`. Nepovinné: `email`, `web`, `note`, `icoVerified`.

## Vývoj

```sh
npm test                 # node --test tests/
python3 -m http.server   # pak http://localhost:8000
```
