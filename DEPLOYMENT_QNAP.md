# Deployment návod — QNAP TS-233 / Container Station

Tento projekt je připravený jako **stable build** pro lehký self-hosting.

## Doporučená architektura
- **1× app container** — FastAPI backend + zbuilděný React frontend v jednom kontejneru
- **1× MongoDB container** — persistentní data

To je pro QNAP TS-233 jednodušší a lehčí než samostatný frontend + backend.

## ARM64 / aarch64 kompatibilita
- `python:3.11-slim` je multi-arch a funguje na ARM64
- `mongo:7.0` podporuje ARM64
- v `docker-compose.yml` je explicitně `platform: linux/arm64`
- Mongo je omezené na menší cache (`--wiredTigerCacheSizeGB 0.25`) kvůli TS-233

## Persistentní data
Persistentní data jsou uložená zde:

- **Mongo volume / bind mount:** `./qnap-data/mongodb:/data/db`

Tohle je klíčová složka, která musí zůstat zachovaná pro:
- admin login a admin nastavení
- uložené položky / odkazy
- loga uložená v databázi
- click statistiky
- pořadí, aktivní/neaktivní stav, oblíbené položky

## Environment proměnné
Použij tyto proměnné v app kontejneru:

- `PORT` — port uvnitř kontejneru, default `8080`
- `MONGO_URL` — např. `mongodb://mongo:27017`
- `DB_NAME` — např. `autoservis_launchpad`
- `CORS_ORIGINS` — pro single-service může zůstat `*`
- `JWT_SECRET` — dlouhý vlastní tajný řetězec
- `TEMP_ADMIN_USERNAME` — první admin login pro prázdnou databázi
- `TEMP_ADMIN_PASSWORD` — první admin heslo pro prázdnou databázi

Poznámka: `TEMP_ADMIN_USERNAME` a `TEMP_ADMIN_PASSWORD` se použijí jen při **prvním startu s prázdnou databází**. Jakmile admin účet existuje, další změny dělej přes UI.

## Kde změnit admin login
Po prvním přihlášení otevři administraci a použij sekci:

- **Změna přihlášení**

Tam změníš login i heslo bez zásahu do databáze nebo Dockeru.

## Lokální spuštění bez Dockeru
### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8080
```

### Frontend vývoj
```bash
cd frontend
yarn install
yarn start
```

### Frontend produkční build
```bash
cd frontend
yarn install
yarn build
```

## Docker build a spuštění
Před Docker buildem musí být frontend build připravený:

```bash
cd frontend
yarn install
yarn build
cd ..
```

Pak spusť:

```bash
docker compose up -d --build
```

App bude dostupná na:

- `http://IP-NAS:8080`

## QNAP Container Station — přesný postup
### Varianta A: přes docker-compose.yml
1. Nahraj celý projekt na NAS, například do sdílené složky `Container/autoservis-launchpad/`
2. Ověř, že v projektu existuje:
   - `Dockerfile`
   - `docker-compose.yml`
   - `frontend/build/`
3. V Container Station otevři projekt nebo terminal
4. Spusť:
   ```bash
   docker compose up -d --build
   ```
5. Otevři v prohlížeči:
   - `http://IP-QNAP:8080`

### Varianta B: přes GUI Container Station
1. Vytvoř nový projekt z `docker-compose.yml`
2. Namapuj port:
   - host `8080` → container `8080`
3. Zkontroluj bind mount:
   - `./qnap-data/mongodb` → `/data/db`
4. Ulož a spusť projekt

## Porty
- **8080** — web aplikace (frontend + backend v jednom)
- **27017** — MongoDB se zvenku mapovat nemusí

## Update bez ztráty dat
1. Zálohuj složku s projektem a hlavně `qnap-data/mongodb`
2. Nahraj novou verzi projektu
3. Pokud se měnil frontend, znovu vytvoř `frontend/build`
4. Spusť:
   ```bash
   docker compose up -d --build
   ```

Dokud zachováš `qnap-data/mongodb`, data zůstanou zachovaná.

## Restart bez ztráty dat
```bash
docker compose restart
```

nebo

```bash
docker compose down
docker compose up -d
```

Restart ani stop/start data nesmažou, pokud nesmažeš `qnap-data/mongodb`.

## Stable snapshot / GitHub
Tato verze je připravená jako referenční stabilní stav.

Doporučený postup:
1. Ulož tuto verzi do GitHubu jako stable snapshot
2. Teprve potom dělej další úpravy nebo další release větev

## Poznámka k výkonu TS-233
- Tento setup je zjednodušený pro nízké prostředky
- frontend a backend jsou sloučené do jednoho app kontejneru
- Mongo má omezenou cache kvůli menší RAM
- nepoužívají se žádné zbytečné produkční služby navíc