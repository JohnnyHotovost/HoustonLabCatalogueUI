# Autoservis interní rozcestník

Tato větev je připravená jako **stable snapshot** aktuální funkční verze aplikace.

## Co je v repozitáři připravené
- produkční `Dockerfile`
- `docker-compose.yml` pro lehký self-hosting na ARM64 / QNAP TS-233
- single-service app container (FastAPI + statický frontend build) + MongoDB container
- dokumentace pro lokální běh a QNAP Container Station v `DEPLOYMENT_QNAP.md`

## Rychlé odkazy
- Deployment návod: `DEPLOYMENT_QNAP.md`
- Přístupové údaje pro test / první start: `/app/memory/test_credentials.md`
- Produktové rozhodnutí a backlog: `/app/memory/PRD.md`
