"""Security and data-preservation regressions against an isolated, real MongoDB.

Run with pytest backend/tests/test_security_regressions.py. MongoDB must be
available on 127.0.0.1:27017 (or TEST_MONGO_URL); no production data is used.
"""

import base64
import importlib.util
import os
import socket
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests
from fastapi.testclient import TestClient
from motor.motor_asyncio import AsyncIOMotorCollection
from pymongo import MongoClient
from pymongo.errors import OperationFailure


@pytest.fixture(scope="session")
def harness():
    database_name = f"catalogue_regression_{uuid.uuid4().hex}"
    mongo_url = os.environ.get("TEST_MONGO_URL", "mongodb://127.0.0.1:27017")
    settings = {
        "MONGO_URL": mongo_url,
        "DB_NAME": database_name,
        "JWT_SECRET": "regression-only-key-not-for-production-32-bytes",
        "TEMP_ADMIN_USERNAME": "admin",
        "TEMP_ADMIN_PASSWORD": "RegressionPass123",
        "CORS_ORIGINS": "http://testserver",
    }
    previous = {name: os.environ.get(name) for name in settings}
    os.environ.update(settings)
    try:
        path = Path(__file__).resolve().parents[1] / "server.py"
        spec = importlib.util.spec_from_file_location(f"security_server_{uuid.uuid4().hex}", path)
        server = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(server)
    finally:
        for name, value in previous.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
    sync = MongoClient(mongo_url, serverSelectionTimeoutMS=3000)
    sync.admin.command("ping")  # Missing infrastructure is a failure, never a skip.
    try:
        with TestClient(server.app) as client:
            yield SimpleNamespace(server=server, client=client, db=sync[database_name])
    finally:
        server.client.close()
        sync.drop_database(database_name)
        sync.close()


@pytest.fixture(autouse=True)
def clean_state(harness):
    harness.server.login_failures.clear()
    harness.db.admins.delete_many({})
    harness.db.admins.insert_one({
        "id": "test-admin", "username": "admin",
        "password_hash": harness.server.hash_password("RegressionPass123"),
        "token_version": 0,
    })
    harness.db.settings.delete_many({})
    harness.db.settings.insert_one({
        "id": "test-settings", "sort_mode": "alphabetical",
        "open_in_new_tab": True, "show_inactive_public": False,
    })
    harness.db.links.delete_many({})
    harness.db.links.insert_many([
        {
            "id": link_id, "title": title, "url": f"https://example.com/{link_id}",
            "logo_url": None, "logo_data": None, "clicks": index + 2,
            "is_active": True, "is_favorite": False, "custom_order": index,
            "created_at": "2026-01-01T00:00:00+00:00",
            "updated_at": "2026-01-01T00:00:00+00:00",
        }
        for index, (link_id, title) in enumerate((("first", "První"), ("second", "Druhý")))
    ])


@pytest.fixture
def auth(harness):
    response = harness.client.post("/api/auth/login", json={"username": "admin", "password": "RegressionPass123"})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def exported(harness, auth):
    response = harness.client.get("/api/admin/export", headers=auth)
    assert response.status_code == 200
    return response.json()


def test_password_only_change_revokes_existing_token(harness, auth):
    changed = harness.client.post("/api/auth/change-credentials", headers=auth, json={
        "current_password": "RegressionPass123", "new_username": "admin", "new_password": "NewPassword123",
    })
    assert changed.status_code == 200
    assert harness.client.get("/api/auth/me", headers=auth).status_code == 401
    new_auth = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert harness.client.get("/api/auth/me", headers=new_auth).status_code == 200
    old_login = harness.client.post("/api/auth/login", json={"username": "admin", "password": "RegressionPass123"})
    assert old_login.status_code == 401
    new_login = harness.client.post("/api/auth/login", json={"username": "admin", "password": "NewPassword123"})
    assert new_login.status_code == 200


def test_password_rejects_more_than_72_utf8_bytes(harness, auth):
    # 37 Czech letters fit the character limit but exceed bcrypt's byte limit.
    password = "ž" * 37
    login = harness.client.post("/api/auth/login", json={"username": "admin", "password": password})
    assert login.status_code == 422
    change = harness.client.post("/api/auth/change-credentials", headers=auth, json={
        "current_password": "RegressionPass123", "new_username": "admin", "new_password": password,
    })
    assert change.status_code == 422
    assert harness.client.get("/api/auth/me", headers=auth).status_code == 200


def test_password_spaces_are_preserved(harness, auth):
    password = "  NewPassword123  "
    changed = harness.client.post("/api/auth/change-credentials", headers=auth, json={
        "current_password": "RegressionPass123", "new_username": "admin", "new_password": password,
    })
    assert changed.status_code == 200
    assert harness.client.post("/api/auth/login", json={"username": "admin", "password": password}).status_code == 200
    assert harness.client.post("/api/auth/login", json={"username": "admin", "password": password.strip()}).status_code == 401


def test_login_rate_limit_after_five_failed_attempts(harness):
    for _ in range(5):
        assert harness.client.post("/api/auth/login", json={"username": "unknown", "password": "incorrect"}).status_code == 401
    limited = harness.client.post("/api/auth/login", json={"username": "admin", "password": "RegressionPass123"})
    assert limited.status_code == 429
    assert int(limited.headers["retry-after"]) > 0


@pytest.mark.parametrize("payload", [
    {"title": "   ", "url": "https://example.com"},
    {"title": "A", "url": "javascript:alert(1)"},
    {"title": "A", "url": "https://user:password@example.com"},
    {"title": "A", "url": "https://example.com/path with spaces"},
    {"title": "A", "url": "https://example.com", "is_active": "false"},
])
def test_invalid_create_inputs_preserve_catalogue(harness, auth, payload):
    before = exported(harness, auth)
    response = harness.client.post("/api/admin/links", headers=auth, json=payload)
    assert response.status_code == 422
    assert exported(harness, auth) == before


@pytest.mark.parametrize("payload", [{"title": None}, {"title": "  "}, {"url": None}, {"is_active": None}])
def test_invalid_updates_preserve_link(harness, auth, payload):
    before = exported(harness, auth)
    assert harness.client.put("/api/admin/links/first", headers=auth, json=payload).status_code == 422
    assert exported(harness, auth) == before


@pytest.mark.parametrize("payload", [
    {}, {"links": []},
    {"links": [{"title": "A", "url": "https://example.com", "created_at": "not-a-date"}]},
    {"links": [{"id": "same", "title": "A", "url": "https://example.com"}, {"id": "same", "title": "B", "url": "https://example.org"}]},
    {"settings": {"sort_mode": "invalid", "open_in_new_tab": True}, "links": [{"title": "A", "url": "https://example.com"}]},
])
def test_invalid_import_preserves_links_and_settings(harness, auth, payload):
    before = exported(harness, auth)
    response = harness.client.post("/api/admin/import", headers=auth, json=payload)
    assert response.status_code == 422
    assert exported(harness, auth) == before


def test_import_merges_ids_and_keeps_unmentioned_links(harness, auth):
    before = exported(harness, auth)
    response = harness.client.post("/api/admin/import", headers=auth, json={"links": [
        {**before["links"][0], "title": "Přejmenovaný"},
        {"id": "third", "title": "Nový", "url": "https://example.org"},
    ]})
    assert response.status_code == 200
    assert response.json()["count"] == 2
    after = exported(harness, auth)
    by_id = {link["id"]: link for link in after["links"]}
    assert set(by_id) == {"first", "second", "third"}
    assert by_id["first"]["title"] == "Přejmenovaný"
    assert by_id["second"] == before["links"][1]


@pytest.mark.parametrize("method", ["insert_many", "rename"])
def test_failed_import_staging_keeps_original_data(harness, auth, monkeypatch, method):
    before = exported(harness, auth)
    original = getattr(AsyncIOMotorCollection, method)

    async def fail_stage(self, *args, **kwargs):
        if self.name.startswith("links_import_"):
            raise OperationFailure("Injected staging failure")
        return await original(self, *args, **kwargs)

    monkeypatch.setattr(AsyncIOMotorCollection, method, fail_stage)
    response = harness.client.post("/api/admin/import", headers=auth, json={
        "settings": {"sort_mode": "latest", "open_in_new_tab": False},
        "links": [{"id": "third", "title": "Nový", "url": "https://example.org"}],
    })
    assert response.status_code == 503
    assert exported(harness, auth) == before
    assert not any(name.startswith("links_import_") for name in harness.db.list_collection_names())


def test_committed_import_does_not_attempt_failing_staging_cleanup(harness, auth, monkeypatch):
    cleanup_calls = []

    async def unavailable_cleanup(self, *args, **kwargs):
        cleanup_calls.append(self.name)
        raise OperationFailure("Injected cleanup failure")

    monkeypatch.setattr(AsyncIOMotorCollection, "drop", unavailable_cleanup)
    response = harness.client.post("/api/admin/import", headers=auth, json={
        "links": [{"id": "third", "title": "Nový", "url": "https://example.org"}],
    })
    assert response.status_code == 200
    assert response.json() == {"success": True, "count": 1, "total": 3}
    assert set(harness.db.links.distinct("id")) == {"first", "second", "third"}
    assert cleanup_calls == []
    assert not any(name.startswith("links_import_") for name in harness.db.list_collection_names())


def test_failed_staging_cleanup_does_not_mask_import_failure(harness, auth, monkeypatch):
    before = exported(harness, auth)

    async def unavailable_rename(self, *args, **kwargs):
        raise OperationFailure("Injected rename failure")

    async def unavailable_cleanup(self, *args, **kwargs):
        raise OperationFailure("Injected cleanup failure")

    monkeypatch.setattr(AsyncIOMotorCollection, "rename", unavailable_rename)
    monkeypatch.setattr(AsyncIOMotorCollection, "drop", unavailable_cleanup)
    try:
        response = harness.client.post("/api/admin/import", headers=auth, json={
            "links": [{"id": "third", "title": "Nový", "url": "https://example.org"}],
        })
        assert response.status_code == 503
        assert "Původní odkazy zůstaly zachované" in response.json()["detail"]
        assert exported(harness, auth) == before
    finally:
        for name in harness.db.list_collection_names():
            if name.startswith("links_import_"):
                harness.db.drop_collection(name)


@pytest.mark.parametrize("logo", [
    "data:image/svg+xml;base64," + base64.b64encode(b"<svg onload='alert(1)'/>").decode(),
    "data:image/png;base64," + base64.b64encode(b"not a png").decode(),
    "data:image/png;base64,invalid***",
])
def test_unsafe_or_mislabeled_logo_data_rejected(harness, auth, logo):
    response = harness.client.post("/api/admin/links", headers=auth, json={
        "title": "Logo", "url": "https://example.com", "logo_data": logo,
    })
    assert response.status_code == 422


def public_dns(*_args, **_kwargs):
    return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("93.184.216.34", 443))]


@pytest.mark.parametrize("address", ["127.0.0.1", "10.0.0.1", "169.254.169.254", "::1", "192.168.1.1"])
def test_logo_discovery_never_requests_private_destination(harness, auth, monkeypatch, address):
    monkeypatch.setattr(harness.server.socket, "getaddrinfo", lambda *_a, **_k: [
        (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, 443))
    ])
    calls = []
    monkeypatch.setattr(harness.server, "open_pinned_logo", lambda *args, **kwargs: calls.append(args))
    response = harness.client.post("/api/admin/discover-logo", headers=auth, json={"url": "https://private.example"})
    assert response.status_code == 422
    assert calls == []


class FakeResponse:
    def __init__(self, status=200, headers=None, body=b""):
        self.status_code = status
        self.headers = headers or {"content-type": "text/html"}
        self.body = body
        self.closed = False
        self.raw = self
        self.offset = 0

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.closed = True

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(str(self.status_code))

    def read1(self, size, **_kwargs):
        chunk = self.body[self.offset:self.offset + size]
        self.offset += len(chunk)
        return chunk

    def iter_content(self, size):
        for start in range(0, len(self.body), size):
            yield self.body[start:start + size]


def test_logo_private_redirect_is_not_followed(harness, auth, monkeypatch):
    def dns(host, *_args, **_kwargs):
        address = "127.0.0.1" if host == "127.0.0.1" else "93.184.216.34"
        return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, 443))]

    monkeypatch.setattr(harness.server.socket, "getaddrinfo", dns)
    calls = []
    redirect = FakeResponse(302, {"location": "https://127.0.0.1/admin"})

    def get(url, address):
        assert address == "93.184.216.34"
        calls.append(url)
        return redirect

    monkeypatch.setattr(harness.server, "open_pinned_logo", get)
    response = harness.client.post("/api/admin/discover-logo", headers=auth, json={"url": "https://public.example"})
    assert response.status_code == 422
    assert calls == ["https://public.example"]
    assert redirect.closed


def test_logo_fetch_limits_response_size_and_closes_connection(harness, monkeypatch):
    monkeypatch.setattr(harness.server.socket, "getaddrinfo", public_dns)
    oversized = FakeResponse(body=b"x" * 65536)
    monkeypatch.setattr(harness.server, "open_pinned_logo", lambda *_a, **_k: oversized)
    with pytest.raises(requests.RequestException, match="velká"):
        harness.server.fetch_logo_resource("https://public.example", 1024)
    assert oversized.closed


def test_logo_discovery_does_not_fabricate_success_on_network_failure(harness, auth, monkeypatch):
    monkeypatch.setattr(harness.server.socket, "getaddrinfo", public_dns)

    def unavailable(*_args, **_kwargs):
        raise requests.ConnectionError("network unavailable")

    monkeypatch.setattr(harness.server, "open_pinned_logo", unavailable)
    response = harness.client.post("/api/admin/discover-logo", headers=auth, json={"url": "https://public.example"})
    assert response.status_code == 502
    assert "found" not in response.json()


def test_logo_candidates_support_reversed_html_attribute_order(harness):
    candidates = harness.server.extract_logo_candidates("https://example.com/catalogue", '<link href="/brand.png" rel="icon">')
    assert candidates[0] == ("https://example.com/brand.png", "icon")


def test_oversized_api_request_returns_413(harness, auth):
    response = harness.client.post("/api/admin/import", headers={**auth, "Content-Type": "application/json"}, content=b" " * (10 * 1024 * 1024 + 1))
    assert response.status_code == 413
    assert harness.db.links.count_documents({}) == 2


def test_partial_import_preserves_omitted_metadata_and_click_counts(harness, auth):
    harness.db.links.update_one({"id": "first"}, {"$set": {
        "clicks": 42, "is_favorite": True,
        "logo_url": "https://example.com/brand.png", "custom_order": 7,
    }})
    response = harness.client.post("/api/admin/import", headers=auth, json={"links": [
        {"id": "first", "title": "Upravený", "url": "https://example.com/new", "clicks": 1},
    ]})
    assert response.status_code == 200
    changed = harness.db.links.find_one({"id": "first"}, {"_id": 0})
    assert changed["title"] == "Upravený"
    assert changed["clicks"] == 42
    assert changed["is_favorite"] is True
    assert changed["logo_url"] == "https://example.com/brand.png"
    assert changed["custom_order"] == 7
    assert changed["created_at"] == "2026-01-01T00:00:00+00:00"
    assert harness.db.links.count_documents({}) == 2


def test_signed_token_without_expiry_is_rejected(harness):
    token = harness.server.jwt.encode({"sub": "admin", "ver": 0}, harness.server.jwt_secret, algorithm="HS256")
    response = harness.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


def test_logo_dns_result_is_pinned_with_original_host_and_tls_identity(harness, monkeypatch):
    dns_calls = []
    captured = {}

    def changing_dns(*args, **kwargs):
        dns_calls.append(args[0])
        address = "93.184.216.34" if len(dns_calls) == 1 else "127.0.0.1"
        return [(socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, 443))]

    class FakeSession:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            captured["session_closed"] = True

        def mount(self, prefix, adapter):
            captured["prefix"] = prefix
            captured["adapter"] = adapter

        def get(self, url, **kwargs):
            captured["url"] = url
            captured["options"] = kwargs
            return FakeResponse(body=b"<html></html>")

    monkeypatch.setattr(harness.server.socket, "getaddrinfo", changing_dns)
    monkeypatch.setattr(harness.server.requests, "Session", FakeSession)
    result = harness.server.fetch_logo_resource("https://public.example/brand?q=1", 1024)
    assert result[0] == "https://public.example/brand?q=1"
    assert dns_calls == ["public.example"]
    assert captured["url"] == "https://93.184.216.34/brand?q=1"
    assert captured["options"]["headers"]["Host"] == "public.example"
    assert captured["options"]["allow_redirects"] is False
    assert captured["options"].get("verify", True) is True
    tls_options = captured["adapter"].poolmanager.connection_pool_kw
    assert tls_options["assert_hostname"] == "public.example"
    assert tls_options["server_hostname"] == "public.example"
    proxy = captured["adapter"].proxy_manager_for("http://proxy.example:8080")
    assert proxy.connection_pool_kw["assert_hostname"] == "public.example"
    assert proxy.connection_pool_kw["server_hostname"] == "public.example"
    assert captured["session_closed"]


def test_logo_stream_obeys_shared_wall_clock_deadline(harness, monkeypatch):
    now = [0]
    monkeypatch.setattr(harness.server, "time", SimpleNamespace(monotonic=lambda: now[0]))
    monkeypatch.setattr(harness.server.socket, "getaddrinfo", public_dns)
    slow_response = FakeResponse(body=b"x")

    def slow_read(_size, **_kwargs):
        now[0] = 3
        return b"x"

    slow_response.read1 = slow_read
    monkeypatch.setattr(harness.server, "open_pinned_logo", lambda *_a, **_k: slow_response)
    with pytest.raises(requests.Timeout):
        harness.server.fetch_logo_resource("https://public.example", 1024, deadline=2)
    assert slow_response.closed


@pytest.mark.parametrize("payload", [["title"], "title", 7])
def test_update_rejects_non_object_json_without_server_error(harness, auth, payload):
    before = exported(harness, auth)
    response = harness.client.put("/api/admin/links/first", headers=auth, json=payload)
    assert response.status_code == 422
    assert exported(harness, auth) == before
