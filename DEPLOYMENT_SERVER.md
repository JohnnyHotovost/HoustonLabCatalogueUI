# Spuštění katalogového rozcestníku

Aplikace běží jako FastAPI se statickým React frontendem a samostatnou MongoDB 7. Docker sestaví frontend ze zdrojů; předchozí ruční build není potřeba. Vyžaduje Docker Engine a Docker Compose v2.

## První spuštění

```bash
cp .env.example .env
python -c 'import secrets; print(secrets.token_urlsafe(48))'
```

Do `.env` vložte vygenerovaný náhodný řetězec jako `JWT_SECRET` a nastavte vlastní `TEMP_ADMIN_PASSWORD` (nejméně 8 znaků). Hodnoty nezapisujte do Gitu. Výchozí přihlašovací jméno je `admin`, heslo je **vámi zadaná hodnota**. Žádné univerzální produkční heslo není nastavené. Compose při chybějícím hesle nebo klíči spuštění odmítne.

```bash
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:8080/api/launchpad
```

Prohlížečem otevřete port `8080` serveru. Aplikace se ve výchozím nastavení váže jen na `127.0.0.1`. Pro vzdálený přístup použijte HTTPS reverzní proxy. Pro vědomé zpřístupnění na síti nastavte `APP_BIND_ADDRESS=0.0.0.0`; `APP_PORT` mění hostitelský port. MongoDB nemá veřejný port. `CORS_ORIGINS` nastavte na skutečný origin prohlížeče, pokud frontend běží odděleně.

`TEMP_ADMIN_USERNAME` a `TEMP_ADMIN_PASSWORD` vytvářejí účet jen v prázdné databázi. U existující databáze se přihlašovací údaje přebírají z uloženého účtu. Změna `.env` existující heslo nezmění; použijte formulář změny přihlášení v administraci. Pokud jste používali dříve dokumentované výchozí heslo, změňte ho v administraci. Změna `JWT_SECRET` zneplatní vydané přihlašovací tokeny.

Kontejner aplikace běží bez oprávnění roota a čeká na připravenou databázi. Compose i image obsahují kontrolu zdraví. Aplikace záměrně běží v jednom workeru; nezvyšujte jejich počet bez úpravy koordinace importu a ochrany přihlášení.

## Proxmox: změny vzhledu bez ztráty nastavení

V Linux VM na Proxmoxu běží dvě oddělené služby: `app` (vyměnitelný frontend a backend) a `mongo` (trvalá data). Nový vzhled se připraví ve `frontend/` a nasadí novým image aplikace. Databáze zůstává stejná.

| Co se uchovává | Kde |
| --- | --- |
| Weby, jejich pořadí, aktivní stav a oblíbené položky | MongoDB |
| Správcovské účty a hesla | MongoDB; hesla jako hash |
| Nahraná loga, nastavení zobrazení a statistiky | MongoDB |
| JWT klíč a konfigurace připojení | Původní `.env` / soubor předaný přes `--env-file` |
| Osobní pořadí návštěvníka a přihlášení | Jeho prohlížeč, pod stejnou doménou, portem a HTTP/HTTPS |

Výchozí cesta MongoDB je stále `./catalogue-data/mongodb`, takže aktualizace stávající instalace nic nepřesouvá. Pro **novou instalaci** doporučujeme pevnou cestu mimo složku s kódem:

```dotenv
MONGO_DATA_DIR=/srv/houstonlab/data/mongodb
```

Nastavte ji v `.env` ještě před prvním spuštěním. Všechny budoucí verze musí používat stejnou cestu, databázi `catalogue_portal` a původní konfiguraci. Samotná změna cesty na prázdnou složku by zobrazila novou prázdnou instalaci, ačkoli původní data zůstala jinde.

### Běžná aktualizace vzhledu

Ve stejném checkoutu aktualizujte vybranou větev a spusťte:

```bash
git pull --ff-only
./scripts/update-app.sh
```

Skript vyžaduje Bash, Python 3, gzip a Docker Compose s podporou `--wait`. Nejprve sestaví nový image za běhu původní aplikace. Poté krátce zastaví jen `app`, vytvoří úplný `mongodump` včetně účtů, ověří archiv a spustí nový `app`. Kontejner MongoDB se nevyměňuje. Při chybě nové aplikace zkusí obnovit předchozí image; trvalá data zůstávají na místě. Tato aktualizace vzhledu neprovádí migrace databáze a automatický návrat image není náhradou obnovy databáze po budoucí nekompatibilní migraci.

Zálohy jsou ve výchozím nastavení v `catalogue-data/backups/`. Pro zálohy mimo checkout a konfiguraci na stálém místě lze použít:

```bash
CATALOGUE_BACKUP_DIR=/srv/houstonlab/backups ./scripts/update-app.sh \
  --env-file /srv/houstonlab/config/catalogue.env
```

Soubor `catalogue.env` si předem bezpečně připravte z původní `.env` (oprávnění `600`). Nezveřejňujte jej v Gitu. Pokud image připravujete samostatně, použijte `./scripts/update-app.sh --no-build`; ostatní argumenty jsou globální přepínače Compose.

**Při výměně vzhledu nepřepisujte `.env`, neměňte cestu MongoDB a nemažte datovou složku.** `TEMP_ADMIN_PASSWORD` se při existujícím účtu znovu nepoužije. JSON export z administrace obsahuje odkazy a nastavení, nikoli účty, proto sám nestačí jako úplná záloha.

### Přesun dat existující instalace na pevnou cestu

Pouhé doplnění `MONGO_DATA_DIR` data nepřesune. Při potřebě změnit umístění:

1. Vytvořte a ověřte úplnou zálohu, uchovejte `.env` a poznamenejte původní cestu.
2. Zastavte aplikaci i MongoDB pomocí `docker compose down`.
3. Zkopírujte celou původní složku `catalogue-data/mongodb` do dosud neexistující cílové složky, se zachováním oprávnění a vlastníka (`cp -a`). Nekopírujte živé databázové soubory.
4. Nastavte `MONGO_DATA_DIR` na novou absolutní cestu. Ostatní konfiguraci ponechte.
5. Spusťte `docker compose up -d --no-build`, ověřte přihlášení, všechny weby, loga a nastavení. Původní kopii uchovejte do ověření zálohy a nové instalace.

### Zálohy v Proxmoxu

Plná záloha VM musí zahrnovat disk s MongoDB i konfiguraci. U LXC nebo externího bind mountu ověřte, že je příslušný mount skutečně součástí Proxmox záloh; nemusí být zahrnut automaticky. Pro obnovu databáze použijte `mongorestore --archive --gzip` proti zastavené aplikaci a správnému cíli. Obnova s `--drop` přepíše kolekce, proto ji nejprve vyzkoušejte na oddělené databázi. Zálohy databáze obsahují citlivá data a mají být přístupné pouze správci.

## Vývoj bez Dockeru

Použijte Node.js 22, Yarn 1.22.22 a Python 3.11 nebo 3.12. MongoDB musí být spuštěná samostatně.

```bash
python -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
cd frontend
yarn install --frozen-lockfile
yarn build
cd ../backend
```

Nastavte `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `TEMP_ADMIN_USERNAME`, `TEMP_ADMIN_PASSWORD` a `CORS_ORIGINS` v prostředí nebo `backend/.env`, potom spusťte:

```bash
../.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8080
```

Hot reload frontendu spustíte z `frontend/` pomocí `REACT_APP_BACKEND_URL=http://127.0.0.1:8080 yarn start`. Produkční build používá stejný origin `/api`.

API testy mění data: spouštějte je pouze proti oddělené testovací databázi. Starší integrační sada používá testovací přihlášení uvedené v jejím souboru; v produkci je nenastavujte.

## Build za HTTPS proxy

Docker nepřebírá síťová nastavení hostitelského procesu automaticky. Při firemní proxy předejte standardní `HTTP_PROXY`, `HTTPS_PROXY` a `NO_PROXY` přes `docker build --build-arg` stejného jména. Pokud proxy používá vlastní důvěryhodnou CA, image podporuje dočasný BuildKit secret:

```bash
docker build --build-arg HTTP_PROXY --build-arg HTTPS_PROXY --build-arg NO_PROXY \
  --secret id=build_ca,src=/cesta/k/duveryhodne-ca.pem \
  -t catalogue-app:stable .
docker compose up -d --no-build
```

CA se používá pouze při instalaci balíčků a nekopíruje se do výsledného image. Ověřování TLS a integrity balíčků zůstává zapnuté. Pokud Docker nedokáže přeložit název proxy, opravte jeho DNS nebo předejte ověřené mapování `--add-host`; nepoužívejte vypnutí TLS kontroly.

## Import a načítání log

Import nejprve validuje celý soubor a slučuje odkazy podle `id`. Odkazy, které v souboru chybí, zůstávají zachované; počty kliknutí se nesnižují. Položka bez `id` se považuje za novou. Před importem je stále vhodné vytvořit export. Odkazy se připravují v pomocné kolekci a přepnou atomickým přejmenováním. Nastavení a odkazy nejsou společnou databázovou transakcí: při tvrdém ukončení procesu mezi zápisy se může jejich verze lišit. Běžná chyba zápisu obnoví původní nastavení.

Automatické hledání loga povoluje pouze veřejné cíle, kontroluje přesměrování a omezuje velikost i dobu stahování. Vyžaduje funkční DNS a HTTPS konektivitu serveru. V prostředí s egress proxy může být spojení na ověřenou IP odmítnuté; aplikace v tom případě zobrazí chybu a umožní zadat URL nebo nahrát logo ručně. Nahrávání podporuje rastrová loga a ICO do 1 MB, nikoli SVG.

## Testy

Viz [ověření a příkazy testů](docs/VERIFICATION.md). Integrační a prohlížečové testy spouštějte pouze proti testovací databázi.
