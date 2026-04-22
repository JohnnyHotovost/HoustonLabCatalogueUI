import os
import time

from pymongo import MongoClient


mongo_url = os.environ["MONGO_URL"]
database_name = os.environ["DB_NAME"]


def main() -> None:
    deadline = time.time() + 60
    while time.time() < deadline:
        try:
            client = MongoClient(mongo_url, serverSelectionTimeoutMS=2000)
            client[database_name].command("ping")
            client.close()
            print("MongoDB is ready")
            return
        except Exception:
            time.sleep(2)
    raise SystemExit("MongoDB did not become ready in time")


if __name__ == "__main__":
    main()