# Katalogový rozcestník

Český rozcestník odkazů s vyhledáváním, místním řazením, oblíbenými položkami a administrací. FastAPI, React a MongoDB.

- [Spuštění, vývoj a aktualizace](DEPLOYMENT_SERVER.md)
- [Ověření změn a testy](docs/VERIFICATION.md)
- `docker compose up -d --build` sestaví celou aplikaci ze zdrojů.
- Před prvním spuštěním zkopírujte `.env.example` do `.env` a nastavte vlastní JWT klíč a heslo správce.
- Výchozí jméno správce je `admin`; heslo určuje `TEMP_ADMIN_PASSWORD`. Existující účty se při restartu nepřepisují.

Data MongoDB zůstávají v `catalogue-data/mongodb`. Nesdílejte přihlašovací údaje ani databázové soubory v Gitu.
