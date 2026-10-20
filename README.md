# Katalogový rozcestník

Český rozcestník odkazů s vyhledáváním, místním řazením, oblíbenými položkami a administrací. FastAPI, React a MongoDB.

- [Spuštění, vývoj a aktualizace](DEPLOYMENT_SERVER.md)
- [Ověření změn a testy](docs/VERIFICATION.md)
- `docker compose up -d --build` sestaví celou aplikaci ze zdrojů.
- Před prvním spuštěním zkopírujte `.env.example` do `.env` a nastavte vlastní JWT klíč a heslo správce.
- Výchozí jméno správce je `admin`; heslo určuje `TEMP_ADMIN_PASSWORD`. Existující účty se při restartu nepřepisují.

Data MongoDB zůstávají v `catalogue-data/mongodb`. Nesdílejte přihlašovací údaje ani databázové soubory v Gitu.

Vzhled lze měnit a nasazovat samostatně se zachováním účtů, webů, log a nastavení. Pro Proxmox doporučujeme pevné `MONGO_DATA_DIR` mimo zdrojový kód a `./scripts/update-app.sh`, který vytvoří úplnou zálohu a vymění jen aplikaci. Podrobnosti a přesun existujících dat jsou v deployment návodu.
