# PRD — Katalogový rozcestník

## Datum poslední aktualizace
- 2026-06-17

## Produktový cíl
Vytvořit moderní, rychlý a velmi jednoduchý interní katalogový rozcestník. Aplikace slouží jako hlavní startovní stránka pro zaměstnance s velkými přehlednými kartami na externí katalogy a weby. Veřejná část má být extrémně jednoduchá, read-only a vhodná i pro netechnické uživatele. Administrace má být chráněná loginem a umožnit správu odkazů, log, URL, pořadí, aktivního stavu, statistik kliknutí, řazení, import/exportu a nastavení otevírání odkazů.

## Uživatelské volby
- Dočasný admin účet pro nejrychlejší start
- Placeholder branding v první verzi
- Výchozí otevírání v novém panelu, ale přepínatelné v adminu
- Placeholder startovní odkazy, pozdější úpravy přes admin UI
- Podpora loga přes upload i URL
- Veřejná stránka začíná rovnou search barem
- Viditelný a čistý sort control u search baru
- Admin login modal co nejjednodušší
- Automaticky zkusit načíst favicon/logo podle URL webu a ponechat ruční override
- Název v UI: `Katalogový rozcestník`
- Stable snapshot připravený pro self-hosting na běžném Linux serveru / Proxmox VM / Docker hostu
- Vlastní řazení má fungovat i bez přihlášení, ale jen lokálně v localStorage

## Architektura a rozhodnutí
- Frontend: React + Tailwind + shadcn/ui komponenty
- Backend: FastAPI
- Databáze: MongoDB
- Autentizace: JWT token pro admin režim
- Persistovaná data: Mongo kolekce pro admin účet, odkazy a nastavení
- Loga: vlastní upload ukládaný jako data URL do databáze, nebo externí logo URL; navíc server-side auto-discovery favicon/logo podle zadané URL
- Statistiky: jednoduché interní click count na každé položce
- Řazení: alphabetical / clicks / latest / custom
- Custom order:
  - admin = globální DB pořadí
  - nepřihlášený uživatel = lokální pořadí v `localStorage` pod klíčem `catalogue-local-custom-order`
- Lock/unlock režim chrání proti náhodnému přesouvání; pořadí se ukládá až po znovuzamčení
- Self-hosting varianta: single-service app container (FastAPI + statický frontend build) + MongoDB container

## Persony
- Běžný uživatel: otevře stránku a jedním klikem spustí požadovaný katalog nebo web
- Administrátor: spravuje odkazy, pořadí, loga, přihlášení a nastavení
- Správce serveru: potřebuje jednoduchý a stabilní deployment bez ztráty dat

## Core requirements
- Veřejný grid velkých karet pouze s logem a názvem
- Realtime search
- Přehledné řazení bez zbytečného UI balastu
- Skrytý / nenápadný vstup do adminu
- Chráněný admin login
- CRUD položek v adminu
- Aktivní/neaktivní stav, oblíbené položky, click stats
- Persistentní data a rozumná validace URL/formulářů
- Import/export seznamu odkazů
- Možnost změnit admin přihlášení uvnitř administrace
- Stable snapshot vhodný pro dlouhodobý self-hosting na běžném serveru
- Lokální custom order bez user účtů a bez zápisu do DB

## Co je implementováno
### 2026-06-17
- Hotová veřejná launchpad stránka bez horního headeru; první viditelný prvek je search bar
- Vedle search baru je minimalistický sort control: A–Z, nejnavštěvovanější, nejnovější, vlastní pořadí
- Velké karty s čistým vzhledem, placeholder fallbackem pro chybějící/rozbitá loga a otevíráním odkazů podle nastavení
- Nenápadné admin tlačítko dole vlevo
- Minimalistický admin login modal: bílé pozadí, Login, Password, jedno tlačítko
- Opravený close button login modalu s korektním paddingem uvnitř boxu; UI testováno na desktopu i menší šířce
- Admin dashboard se statistikami, nastavením zobrazení, změnou loginu a správou všech položek
- Přidání / úprava / smazání položek
- Přepínání řazení a ukládání vlastního pořadí přes drag-and-drop
- Na veřejné stránce je pro custom sort dostupný lock režim:
  - admin ukládá nové pořadí globálně do DB
  - nepřihlášený uživatel ukládá nové pořadí lokálně do `localStorage`
- Přidán minimalistický reset lokálního custom order zpět na globální výchozí pořadí
- Click tracking a zobrazení kliků v adminu
- Export/import JSON seznamu odkazů
- Automatické načtení favicon/logo podle URL webu + možnost použít vlastní URL loga nebo ruční upload
- Opravené backend flow pro reorder a export/import
- Ošetřené frontend error messages, aby nepadaly na validačních chybách API
- Stable seed vrácen na 15 neutrálních placeholder položek, alphabetical default, open-in-new-tab default zapnutý
- Připravený stable self-hosting snapshot pro běžný server:
  - `Dockerfile`
  - `docker-compose.yml`
  - `.dockerignore`
  - `frontend/.env.production`
  - `backend/wait_for_mongo.py`
  - `DEPLOYMENT_SERVER.md`
  - produkční frontend build v `frontend/build/`
- Backend umí v produkční variantě obsloužit statický frontend build ze stejného kontejneru
- Requirements byly zjednodušené na nezbytné minimum pro lehčí a stabilnější deployment
- Výchozí seed admin pro prázdnou databázi: `admin / HoustonLab10`

## Prioritized backlog
### P0
- Žádné blokující funkce nezbývají

### P1
- Branding editor (název firmy / logo firmy) přímo v adminu
- Lepší validace externích logo URL před uložením
- Jemné lepší hlášky kolem automatického načítání loga
- Volitelně přidat HTTPS reverse proxy preset pro domácí server

### P2
- Bulk import přes CSV/XLSX
- Více admin účtů / role
- Pokročilejší statistika používání v čase
- Volitelný backup/export scheduler

## Next tasks list
- Uložit tento stable snapshot do GitHubu
- Nahradit placeholder odkazy skutečnými katalogy přes admin UI
- Změnit dočasné admin přihlášení na vlastní po prvním loginu
- Na serveru namapovat `./catalogue-data/mongodb` jako trvalé úložiště
- Volitelně doplnit HTTPS a vlastní doménu v lokální síti
