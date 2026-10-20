# Ověření změn

Ověřeno 20. října 2026 v cloudovém prostředí. Frontend: Node 24 / Yarn 1.22.22; Docker build: Node 22 / Python 3.11; lokální backend: Python 3.12, MongoDB 7.

| Kontrola | Výsledek |
| --- | --- |
| Frontend `CI=true yarn build` | Produkční build prošel |
| Frontend `CI=true yarn test --watchAll=false --runInBand` | 3 sady, 9 testů prošlo |
| `pytest backend/tests/test_security_regressions.py` | 43 testů prošlo, žádný přeskočený; izolovaná skutečná MongoDB |
| API `pytest backend/tests/test_launchpad_api.py` | 10 testů prošlo, žádný přeskočený |
| Playwright, Chromium, 1440 × 900 a 390 × 844 | 12 testů prošlo; reálné přihlášení, formuláře, CRUD, export/import, PNG upload, hledání, lokální řazení, chyby a reduced motion |
| Docker build a Compose | Build ze zdrojů, kontrola zdraví, HTML/JS, autentizace a uživatel bez root oprávnění ověřeny |
| První přihlášení a restart | Vlastní nastavené heslo funguje; dřívější univerzální heslo ne; změna bootstrap hesla při restartu nepřepisuje účet |

Browser testy používají skutečné API pro CRUD/import. Záměrné výpadky, rozbité logo a zpožděné statistiky jsou řízené přes Playwright route, aby šlo spolehlivě ověřit chybové stavy. Kontrola šířek a dotyku je emulace Chromia, nikoli fyzický telefon.

## Reprodukce

```bash
python -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
# Vyžaduje skutečnou MongoDB na localhost:27017, nebo TEST_MONGO_URL.
.venv/bin/pytest backend/tests/test_security_regressions.py -q
cd frontend
yarn install --frozen-lockfile
yarn build
CI=true yarn test --watchAll=false --runInBand
cd ../e2e
npm ci
# Chromium musí být instalovaný; CHROMIUM_PATH určuje cestu.
E2E_BASE_URL=http://127.0.0.1:8081 E2E_ADMIN_USERNAME=admin E2E_ADMIN_PASSWORD='heslo-testovaciho-uctu' npm test
```

Pro browser testy nejprve spusťte build frontend + backend proti oddělené testovací databázi. Starší API sada očekává účet definovaný v testovacím souboru; její `REACT_APP_BACKEND_URL` musí mířit na tuto instanci. Testy mění data, přihlašovací údaje a nastavení. Nepoužívat v produkci.

## Vzhled

Použita dovednost [emil-design-eng](https://github.com/emilkowalski/skills/tree/main/skills/emil-design-eng). Vyhledávání zůstává první funkcí, české texty a administrace zůstávají zachované.

| Before | After | Why |
| --- | --- | --- |
| Kaskádové animace všech karet | Okamžitě dostupné karty | Často používaný rozcestník nečeká na dekoraci |
| `transition-all`, pohyb při každém hoveru | Krátké přechody konkrétních vlastností; hover jen pro myš | Předvídatelná odezva i při dotykovém ovládání |
| Externí fonty, editor a analytické skripty | Lokální aplikace se systémovým písmem | Méně síťových závislostí a skriptů u přihlášení |
| Výrazné stíny a velké mezery | Jemné hranice, kompaktní mřížka, zelený akcent | Snazší každodenní orientace |
| Neoznačené hledání a malé cíle | Popisek, viditelný focus, ovládání klávesnicí a cíle 44 px | Přístupnější hledání, dialogy a řazení |

## Hranice ověření

- Automatické hledání log z internetu v tomto cloudu nemá funkční externí DNS. Síťové chyby jsou ošetřené; ochrany SSRF, pinning IP, TLS identita, limity a přesměrování mají regresní testy. Nahrání PNG a náhradní logo byly ověřeny v prohlížeči. Úspěšné vyhledání na živém veřejném webu zůstává neověřené.
- Import přepíná kolekci odkazů atomicky, ale nastavení a odkazy nejsou jednou transakcí. Běží jeden worker; více workerů vyžaduje databázovou koordinaci.
- Nasazení na produkční server a jeho HTTPS reverzní proxy nebylo provedeno.

## Zachování dat při změně vzhledu na Proxmoxu

Ověřeno 21. října 2026 na oddělených Docker kontejnerech. Opakovatelné ověření:

```bash
python scripts/test-update-preservation.py --image catalogue-app:stable
```

Test vytvoří vlastní MongoDB a náhodné testovací přihlášení, upraví weby, loga, nastavení, pořadí a statistiky a změní jméno i heslo účtu. Následně vymění pouze aplikaci za **jiný image s odlišným HTML titulem**. Kontroluje úplnou shodu všech tří kolekcí a indexů, veřejné API i admin export a přihlášení novými údaji. Ověřuje také, že se kontejner MongoDB nezměnil. Potom provede skutečný `mongodump` a `mongorestore` do druhé databáze a porovná celý obsah. Test prošel a své dočasné kontejnery, volumes, síť i image uklidil.

Skript `scripts/update-app.sh --no-build` byl navíc spuštěný proti testovacímu Compose stacku: vytvořil ověřený archiv všech dat a vyměnil jen aplikaci. Test se záměrně vadným image ověřil návrat k předchozímu funkčnímu image; databázový kontejner zůstal stejný. Cesta `MONGO_DATA_DIR` zachovává zpětně kompatibilní výchozí mount.

Skutečný Proxmox server nebyl připojen; nastavení jeho disků a záloh musí správce ověřit při nasazení.
