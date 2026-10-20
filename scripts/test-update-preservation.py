#!/usr/bin/env python3
"""Prove that replacing a visual-only app image preserves the complete catalogue.

Requires Docker and an already built app image. Uses disposable Docker resources,
random credentials, and Python's standard library. No existing instance is touched.

    python scripts/test-update-preservation.py --image catalogue-app:stable
"""

import argparse
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid


PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
COLLECTIONS = ("admins", "links", "settings")


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def docker(*arguments, stdin=None, stdout=subprocess.PIPE, timeout=120):
    result = subprocess.run(
        ["docker", *arguments], stdin=stdin, stdout=stdout,
        stderr=subprocess.PIPE, timeout=timeout, check=False,
    )
    if result.returncode:
        # Commands never contain passwords or JWTs. Do not dump configuration,
        # request bodies, command output, or credentials when a check fails.
        operation = " ".join(arguments[:2])
        raise RuntimeError(f"Docker {operation} failed (exit {result.returncode})")
    return result.stdout.decode().strip() if result.stdout is not None else ""


def wait_mongo(container, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            value = docker("exec", container, "mongosh", "--quiet", "--eval", "db.adminCommand({ping:1}).ok", timeout=10)
            if value == "1":
                return
        except (RuntimeError, subprocess.TimeoutExpired):
            pass
        time.sleep(1)
    raise RuntimeError("Disposable MongoDB did not become ready")


def database_snapshot(container, database):
    # Include hashes, account token version, binary logo payloads, all record
    # metadata and indexes, while keeping the captured snapshot out of logs.
    javascript = (
        "const d=db.getSiblingDB(" + json.dumps(database) + ");"
        "print(JSON.stringify(Object.fromEntries("
        + json.dumps(COLLECTIONS)
        + ".map(n=>[n,{records:d[n].find({}).sort({_id:1}).toArray(),"
        "indexes:d[n].getIndexes().sort((a,b)=>a.name.localeCompare(b.name))}]))));"
    )
    return json.loads(docker("exec", container, "mongosh", "--quiet", "--eval", javascript))


def run_test(args):
    check(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/@-]*", args.image), "Invalid app image reference")
    check(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/@-]*", args.mongo_image), "Invalid MongoDB image reference")
    docker("image", "inspect", args.image, "--format", "{{.Id}}")
    suffix = uuid.uuid4().hex[:12]
    prefix = f"catalogue-preservation-{suffix}"
    network, mongo = prefix + "-net", prefix + "-mongo"
    restore_mongo, app = prefix + "-restore", prefix + "-app"
    updated_image = prefix + ":visual-update"
    database = "catalogue_preservation"
    containers, volumes, networks, images = [], [], [], []
    client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    base_url = ""

    def api(method, path, payload=None, token=None, expected=200, raw=False):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        request = urllib.request.Request(
            base_url + path, method=method, headers=headers,
            data=json.dumps(payload).encode() if payload is not None else None,
        )
        try:
            with client.open(request, timeout=8) as response:
                status, content = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, content = error.code, error.read()
        check(status == expected, f"{method} {path}: expected HTTP {expected}, got {status}")
        return content.decode() if raw else json.loads(content)

    def start_app(image, env_file):
        nonlocal base_url
        docker(
            "run", "-d", "--name", app, "--network", network,
            "--publish", "127.0.0.1::8080", "--env-file", str(env_file), image,
        )
        containers.append(app)
        address = docker("port", app, "8080/tcp")
        base_url = "http://" + address
        deadline = time.monotonic() + args.timeout
        while time.monotonic() < deadline:
            try:
                if api("GET", "/api/health").get("status") == "ok":
                    return
            except (RuntimeError, OSError, urllib.error.URLError, json.JSONDecodeError):
                pass
            time.sleep(1)
        raise RuntimeError("Disposable application did not become ready")

    try:
        with tempfile.TemporaryDirectory(prefix="catalogue-preservation-") as temporary:
            directory = Path(temporary)
            bootstrap_password, saved_password = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
            saved_username = "spravce_" + suffix
            jwt_secret = secrets.token_urlsafe(48)
            env_file = directory / "app.env"
            env_file.write_text("\n".join([
                "MONGO_URL=mongodb://mongo:27017", "DB_NAME=" + database,
                "JWT_SECRET=" + jwt_secret, "TEMP_ADMIN_USERNAME=admin",
                "TEMP_ADMIN_PASSWORD=" + bootstrap_password, "CORS_ORIGINS=http://localhost",
            ]) + "\n")
            env_file.chmod(0o600)
            docker("network", "create", network)
            networks.append(network)
            for volume in (prefix + "-data", prefix + "-restore-data"):
                docker("volume", "create", volume)
                volumes.append(volume)
            docker(
                "run", "-d", "--name", mongo, "--network", network, "--network-alias", "mongo",
                "--volume", volumes[0] + ":/data/db", args.mongo_image,
            )
            containers.append(mongo)
            wait_mongo(mongo, args.timeout)
            mongo_identity = docker("inspect", mongo, "--format", "{{.Id}}")
            start_app(args.image, env_file)
            original_html = api("GET", "/", raw=True)
            token = api("POST", "/api/auth/login", {"username": "admin", "password": bootstrap_password})["access_token"]
            logo_link = api("POST", "/api/admin/links", {
                "title": "Vlastní katalog s logem", "url": "https://example.org/katalog",
                "logo_data": PNG, "is_active": True, "is_favorite": True,
            }, token)
            hidden_link = api("POST", "/api/admin/links", {
                "title": "Skrytý dodavatel", "url": "https://example.org/dodavatel",
                "logo_url": "https://example.org/logo.png", "is_active": False, "is_favorite": False,
            }, token)
            api("PUT", "/api/admin/settings", {
                "sort_mode": "custom", "open_in_new_tab": False, "show_inactive_public": True,
            }, token)
            links = api("GET", "/api/admin/links", token=token)
            api("PUT", "/api/admin/links/reorder/items", {"link_ids": [link["id"] for link in reversed(links)]}, token)
            for _ in range(3):
                api("POST", f"/api/links/{logo_link['id']}/click")
            api("POST", f"/api/links/{hidden_link['id']}/click")
            token = api("POST", "/api/auth/change-credentials", {
                "current_password": bootstrap_password, "new_username": saved_username, "new_password": saved_password,
            }, token)["access_token"]
            before_export = api("GET", "/api/admin/export", token=token)
            before_public = api("GET", "/api/launchpad")
            before_database = database_snapshot(mongo, database)
            print("Prepared account, websites, uploaded/URL logos, settings, shared order and click statistics.", flush=True)

            # The only changed app file is static HTML. This is a genuinely
            # different image, rather than merely restarting the same container.
            build_context = directory / "visual-build"
            build_context.mkdir()
            marker = "Proxmox visual update " + suffix
            check("<title>" in original_html, "App HTML has no title to update")
            changed_html = re.sub(r"<title>.*?</title>", "<title>" + marker + "</title>", original_html, count=1, flags=re.DOTALL)
            (build_context / "index.html").write_text(changed_html)
            (build_context / "Dockerfile").write_text(
                "FROM " + args.image + "\nCOPY --chown=catalogue:catalogue index.html /app/frontend/build/index.html\n"
            )
            docker("build", "--pull=false", "--tag", updated_image, str(build_context))
            images.append(updated_image)
            check(
                docker("image", "inspect", updated_image, "--format", "{{.Id}}")
                != docker("image", "inspect", args.image, "--format", "{{.Id}}"),
                "Visual update did not produce a different app image",
            )

            docker("stop", app)
            archive = directory / "catalogue.archive.gz"
            with archive.open("wb") as output:
                os.chmod(archive, 0o600)
                docker("exec", mongo, "mongodump", "--db", database, "--archive", "--gzip", stdout=output)
            check(archive.stat().st_size > 0, "Database backup is empty")
            docker("rm", app)
            containers.remove(app)
            start_app(updated_image, env_file)
            check(marker in api("GET", "/", raw=True), "Replacement HTML title marker is missing")
            check(docker("inspect", mongo, "--format", "{{.Id}}") == mongo_identity, "Mongo container was replaced")
            token = api("POST", "/api/auth/login", {"username": saved_username, "password": saved_password})["access_token"]
            api("POST", "/api/auth/login", {"username": "admin", "password": bootstrap_password}, expected=401)
            check(api("GET", "/api/admin/export", token=token) == before_export, "Catalogue export changed during visual update")
            check(api("GET", "/api/launchpad") == before_public, "Public links or settings changed during visual update")
            check(database_snapshot(mongo, database) == before_database, "Stored account, catalogue metadata or indexes changed")
            print("PASS: distinct visual image replaced only the app; complete data and changed login survived.", flush=True)

            docker(
                "run", "-d", "--name", restore_mongo, "--network", network,
                "--volume", volumes[1] + ":/data/db", args.mongo_image,
            )
            containers.append(restore_mongo)
            wait_mongo(restore_mongo, args.timeout)
            with archive.open("rb") as backup:
                docker("exec", "-i", restore_mongo, "mongorestore", "--archive", "--gzip", "--drop", "--stopOnError", stdin=backup)
            check(database_snapshot(restore_mongo, database) == before_database, "Database restore did not preserve every account, setting, link and index")
            print("PASS: mongodump/mongorestore restored all three collections and indexes to a separate MongoDB.", flush=True)
    finally:
        for container in reversed(containers):
            subprocess.run(["docker", "rm", "-f", container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        for volume in reversed(volumes):
            subprocess.run(["docker", "volume", "rm", volume], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        for network_name in reversed(networks):
            subprocess.run(["docker", "network", "rm", network_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        for image in reversed(images):
            subprocess.run(["docker", "image", "rm", image], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", default="catalogue-app:stable", help="Existing locally built app image")
    parser.add_argument("--mongo-image", default="mongo:7.0", help="MongoDB image used only for disposable test data")
    parser.add_argument("--timeout", type=int, default=90, help="Service readiness timeout in seconds")
    args = parser.parse_args()
    try:
        run_test(args)
    except (RuntimeError, subprocess.TimeoutExpired, OSError, ValueError) as error:
        print("FAIL: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
