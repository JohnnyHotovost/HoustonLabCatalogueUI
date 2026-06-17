# Katalogový rozcestník

Tato větev je připravená jako **stable snapshot** aktuální funkční verze aplikace.

## Co je v repozitáři připravené
- produkční `Dockerfile`
- `docker-compose.yml` pro běžný Linux server / Proxmox VM / Docker host
- single-service app container (FastAPI + statický frontend build) + MongoDB container
- dokumentace pro lokální běh a server deployment v `DEPLOYMENT_SERVER.md`

## Rychlé odkazy
- Deployment návod: `DEPLOYMENT_SERVER.md`
- Přístupové údaje pro test / první start: `/app/memory/test_credentials.md`
- Produktové rozhodnutí a backlog: `/app/memory/PRD.md`
