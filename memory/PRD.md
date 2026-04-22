# PRD — Autoservis interní rozcestník

## Datum poslední aktualizace
- 2026-04-22

## Původní zadání
Vytvořit moderní, rychlý a velmi jednoduchý interní webový rozcestník pro autoservis. Aplikace má sloužit jako hlavní startovní stránka pro zaměstnance s velkými přehlednými kartami na externí katalogy a weby. Veřejná část má být extrémně jednoduchá, read-only a vhodná i pro netechnické uživatele. Administrace má být chráněná loginem a umožnit správu odkazů, log, URL, pořadí, aktivního stavu, statistik kliknutí, řazení, import/exportu a nastavení otevírání odkazů.

## Uživatelské volby
- Dočasný admin účet pro nejrychlejší start
- Placeholder branding v první verzi
- Výchozí otevírání v novém panelu, ale přepínatelné v adminu
- Placeholder startovní odkazy, pozdější úpravy přes admin UI
- Podpora loga přes upload i URL
- Ve finální úpravě odstranit horní header z veřejné stránky
- Veřejná stránka má začínat rovnou search barem
- Přidat viditelný a čistý sort control u search baru
- Admin login modal co nejjednodušší
- Automaticky zkusit načíst favicon/logo podle URL webu a ponechat ruční override
- Tuto verzi zachovat jako stable snapshot a připravit ji pro self-hosting na QNAP TS-233 přes Docker / Container Station

## Architektura a rozhodnutí
- Frontend: React + Tailwind + shadcn/ui komponenty
- Backend: FastAPI
- Databáze: MongoDB přes existující MONGO_URL
- Autentizace: JWT token pro admin režim
- Persistovaná data: Mongo kolekce pro admin účet, odkazy a nastavení
- Loga: vlastní upload ukládaný jako data URL do databáze, nebo externí logo URL; navíc server-side auto-discovery favicon/logo podle zadané URL
- Statistiky: jednoduché interní click count na každé položce
- Řazení: alphabetical / clicks / latest / custom
- Custom order: drag-and-drop v adminu
- Self-hosting varianta: single-service app container (FastAPI + statický frontend build) + MongoDB container
- QNAP optimalizace: ARM64 kompatibilita, minimální Python dependencies, omezená Mongo cache, persistentní bind mount pro Mongo data

## Persony
- Zaměstnanec autoservisu: otevře stránku a jedním klikem spustí požadovaný web
- Majitel / administrátor: spravuje odkazy, pořadí, loga, přihlášení a nastavení
- Lokální správce NAS: potřebuje jednoduchý a lehký deployment bez ztráty dat

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
- Stable snapshot vhodný pro dlouhodobý self-hosting na QNAP TS-233

## Co je implementováno
### 2026-04-22
- Hotová veřejná launchpad stránka bez horního headeru; první viditelný prvek je search bar
- Vedle search baru je minimalistický sort control: A–Z, nejnavštěvovanější, nejnovější, vlastní pořadí
- Velké karty s čistým vzhledem, placeholder fallbackem pro chybějící/rozbitá loga a otevíráním odkazů podle nastavení
- Nenápadné admin tlačítko dole vlevo
- Minimalistický admin login modal: bílé pozadí, Login, Password, jedno tlačítko
- Admin dashboard se statistikami, nastavením zobrazení, změnou loginu a správou všech položek
- Přidání / úprava / smazání položek
- Přepínání řazení a ukládání vlastního pořadí přes drag-and-drop
- Click tracking a zobrazení kliků v adminu
- Export/import JSON seznamu odkazů
- Automatické načtení favicon/logo podle URL webu + možnost použít vlastní URL loga nebo ruční upload
- Opravené backend flow pro reorder a export/import
- Ošetřené frontend error messages, aby nepadaly na validačních chybách API
- Seed vyčištěný zpět na 15 placeholder položek, alphabetical default, open-in-new-tab default zapnutý
- Připravený stable self-hosting snapshot pro QNAP TS-233:
  - `Dockerfile`
  - `docker-compose.yml`
  - `.dockerignore`
  - `frontend/.env.production`
  - `backend/wait_for_mongo.py`
  - `DEPLOYMENT_QNAP.md`
  - produkční frontend build v `frontend/build/`
- Backend umí v produkční variantě obsloužit statický frontend build ze stejného kontejneru
- Requirements byly zjednodušené na nezbytné minimum pro lehčí ARM64 deployment

## Prioritized backlog
### P0
- Žádné blokující funkce nezbývají

### P1
- Branding editor (název firmy / logo firmy) přímo v adminu
- Lepší validace externích logo URL před uložením
- Jemné lepší hlášky kolem automatického načítání loga
- Volitelně přidat HTTPS reverse proxy preset pro QNAP / lokální router

### P2
- Bulk import přes CSV/XLSX
- Více admin účtů / role
- Pokročilejší statistika používání v čase
- Volitelný backup/export scheduler pro NAS

## Next tasks list
- Uložit tento stable snapshot do GitHubu
- Nahradit placeholder odkazy skutečnými katalogy přes admin UI
- Změnit dočasné admin přihlášení na vlastní
- Na QNAPu namapovat `./qnap-data/mongodb` jako trvalé úložiště
- Volitelně doplnit HTTPS a vlastní doménu v lokální síti
