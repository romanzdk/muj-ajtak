# Můj ajťák — návrh (v1)

> Aktualizace 2026-11-23: přihlášky už nejdou přes GitHub issue, ale přes formulář → Cloudflare Worker → soukromé repo. Web se jmenuje Najdi ajťáka (najdiajtaka.cz). Aktuální stav je v README.md.

## Proč
Lidé (hlavně senioři), kteří potřebují pomoc s IT a nevědí, kde ji hledat, najdou ajťáka ve svém okolí a zavolají mu.

## Cíle
- Najít ajťáka podle polohy („Najít v mém okolí“) nebo podle města / PSČ.
- Seznam seřazený podle vzdálenosti + mapa.
- Filtr podle typu pomoci (počítač, telefon, internet/Wi-Fi, tiskárna, ostatní).
- Celá ČR.
- Ajťák se přidá přes GitHub formulář, nebo pošle e-mail a správce ho přidá ručně.

## Co v1 nedělá
- Žádné účty ani přihlašování na webu, žádná databáze.
- Žádné hodnocení, recenze, chat, ceny.

## Čemu se vyhnout
- Web nesmí být složitý pro seniora: žádná vyskakovací okna, malé písmo, nutnost registrace pro hledání.
- Na web se nesmí dostat podvodník bez kontroly (senioři jsou častým cílem „falešné IT podpory“) → každý záznam schvaluje člověk.

## Postup (zvolená varianta A)
- Hosting: GitHub Pages, jedna statická stránka (HTML + CSS + JS, bez build kroku).
- Mapa: Leaflet + dlaždice OpenStreetMap.
- Poloha: `navigator.geolocation`. Město/PSČ → souřadnice přes Nominatim (OpenStreetMap).
- Data: `data.json` v repozitáři (jméno, město, souřadnice města/části, telefon, e-mail, web, typy pomoci, poznámka, výjezd domů ano/ne).
- Přidání: GitHub issue formulář → GitHub Action z něj vytvoří pull request se změnou `data.json` (souřadnice doplní přes Nominatim) → správce PR schválí a sloučí → web se aktualizuje.
- Ruční přidání: na webu kontaktní e-mail „Nemáte GitHub? Napište nám.“ Správce doplní záznam do `data.json`.
- Odebrání: odkaz „Chci se odebrat / něco nesedí“ (e-mail nebo issue).
- Na každém záznamu odkaz „Nahlásit problém“.
- IČO (nepovinné): GitHub Action ho ověří v ARES (`https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}`). Když subjekt existuje a nezanikl, záznam dostane odznak „Ověřené IČO“ a do PR se vypíše název firmy pro kontrolu správcem. Odznak říká jen „firma s tímto IČO existuje“, ne že ji vlastní ten, kdo se přihlásil — to kontroluje správce.
- Repozitář: `romanzdk/muj-ajtak`, adresa `romanzdk.github.io/muj-ajtak`. Kontaktní e-mail: soukromý e-mail správce.
- Veřejně jen město / část města, nikdy přesná adresa.
- GDPR: souhlas se zveřejněním ve formuláři, krátká stránka o zpracování údajů.

## Zvažované varianty
- A) jen GitHub — zvoleno: nejjednodušší, zdarma, schvalování je vestavěné (pull request).
- B) GitHub + Cloudflare (D1, Turnstile, přihlášení e-mailem) — odloženo, až bude potřeba přidávání bez GitHubu ve velkém.

## Nechávám na stavitele
- Vzhled a texty (velké písmo, vysoký kontrast, seznam nad mapou).
- Pomalé načítání Nominatimu: max. 1 dotaz za sekundu, jen po kliknutí na „Hledat“.
