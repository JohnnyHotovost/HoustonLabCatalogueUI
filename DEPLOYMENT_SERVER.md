# Deployment návod — Linux server / Proxmox VM / Docker host

Tento projekt je připravený jako **stable build** pro běžný serverový provoz.

## Doporučená architektura
- **1× app container** — FastAPI backend + zbuilděný React frontend v jednom kontejneru
- **1× MongoDB container** — persistentní data

Tím zůstává nasazení jednoduché a zároveň produkčně použitelné.

## Persistentní data
Persistentní data jsou uložená zde:

- **Mongo volume / bind mount:** `./catalogue-data/mongodb:/data/db`

Tato složka obsahuje vše důležité:
- admin login a admin nastavení
- uložené odkazy
- loga uložená v databázi
- click statistiky
- pořadí, aktivní/neaktivní stav a oblíbené položky

## Environment proměnné
Použij tyto proměnné v app kontejneru:

- `PORT` — port uvnitř kontejneru, default `8080`
- `MONGO_URL` — např. `mongodb://mongo:27017`
- `DB_NAME` — např. `catalogue_portal`
- `CORS_ORIGINS` — pro single-service může zůstat `*`
- `JWT_SECRET` — dlouhý vlastní tajný řetězec
- `TEMP_ADMIN_USERNAME` — první admin login pro prázdnou databázi
- `TEMP_ADMIN_PASSWORD` — první admin heslo pro prázdnou databázi

Poznámka: `TEMP_ADMIN_USERNAME` a `TEMP_ADMIN_PASSWORD` se použijí jen při **prvním startu s prázdnou databází**. Jakmile admin účet existuje, změny dělej přes UI.

## Výchozí admin login
- Login: `admin`
- Password: `HoustonLab10`

Po prvním přihlášení můžeš údaje změnit v administraci v sekci **Změna přihlášení**.

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

- `http://SERVER-IP:8080`

## Docker Compose
Použij přiložený `docker-compose.yml`.

Porty:
- **8080** — aplikace
- **27017** — MongoDB se zvenku mapovat nemusí

## Proxmox / VM / Linux server — doporučený postup
1. Nahraj projekt na server, například do `/opt/catalogue-portal/`
2. Ověř, že v projektu existuje:
   - `Dockerfile`
   - `docker-compose.yml`
   - `frontend/build/`
3. Spusť:
   ```bash
   docker compose up -d --build
   ```
4. Otevři v prohlížeči:
   - `http://IP-SERVERU:8080`

## Update bez ztráty dat
1. Zálohuj složku s projektem a hlavně `catalogue-data/mongodb`
2. Nahraj novou verzi projektu
3. Pokud se měnil frontend, znovu vytvoř `frontend/build`
4. Spusť:
   ```bash
   docker compose up -d --build
   ```

Dokud zachováš `catalogue-data/mongodb`, data zůstanou zachovaná.

## Restart bez ztráty dat
```bash
docker compose restart
```

nebo

```bash
docker compose down
docker compose up -d
```

Restart ani stop/start data nesmažou, pokud nesmažeš `catalogue-data/mongodb`.

## Backup persistentních dat
Stačí zálohovat složku:

- `catalogue-data/mongodb`

To je hlavní serverová složka, kterou je potřeba uchovat.

## Stable snapshot / GitHub
Tato verze je připravená jako referenční stabilní stav.

Doporučený postup:
1. Ulož tuto verzi do GitHubu jako stable snapshot
2. Teprve potom dělej další úpravy nebo nový release