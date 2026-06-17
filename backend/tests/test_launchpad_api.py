import json
import os
import uuid

import pytest
import requests


# Modules/features covered: public launchpad, auth, admin CRUD, settings, reorder, click stats, export/import, credential change.


def _read_frontend_env_backend_url() -> str | None:
    env_path = "/app/frontend/.env"
    if not os.path.exists(env_path):
        return None
    with open(env_path, "r", encoding="utf-8") as handle:
        for line in handle:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return None


BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env_backend_url()
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "HoustonLab10"


@pytest.fixture(scope="session")
def api_client():
    if not BASE_URL:
        pytest.skip("REACT_APP_BACKEND_URL not found; cannot run API tests")
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def admin_token(api_client):
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    if response.status_code != 200:
        pytest.skip(f"Admin login failed with status {response.status_code}: {response.text}")
    data = response.json()
    assert "access_token" in data
    return data["access_token"]


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def test_public_launchpad_loads_with_settings(api_client):
    response = api_client.get(f"{BASE_URL}/api/launchpad", timeout=20)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data.get("links"), list)
    assert data["settings"]["sort_mode"] in {"alphabetical", "clicks", "custom", "latest"}
    assert isinstance(data["settings"]["open_in_new_tab"], bool)


def test_admin_endpoints_block_unauthenticated(api_client):
    response = api_client.get(f"{BASE_URL}/api/admin/links", timeout=20)
    assert response.status_code == 401
    data = response.json()
    assert "detail" in data


def test_login_rejects_invalid_credentials(api_client):
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": "wrong-user", "password": "wrong-pass"},
        timeout=20,
    )
    assert response.status_code == 401
    assert "detail" in response.json()


def test_admin_dashboard_data_loads(api_client, auth_headers):
    links_response = api_client.get(f"{BASE_URL}/api/admin/links", headers=auth_headers, timeout=20)
    settings_response = api_client.get(f"{BASE_URL}/api/admin/settings", headers=auth_headers, timeout=20)

    assert links_response.status_code == 200
    assert settings_response.status_code == 200

    links = links_response.json()
    settings = settings_response.json()

    assert isinstance(links, list)
    assert isinstance(settings["open_in_new_tab"], bool)
    assert settings["sort_mode"] in {"alphabetical", "clicks", "custom", "latest"}


def test_create_update_delete_link_flow(api_client, auth_headers):
    unique = uuid.uuid4().hex[:8]
    title = f"TEST_AUTOSERVIS_{unique}"
    create_payload = {
        "title": title,
        "url": "example.org",
        "logo_url": "",
        "logo_data": "",
        "is_active": True,
        "is_favorite": False,
    }
    create_response = api_client.post(
        f"{BASE_URL}/api/admin/links",
        headers=auth_headers,
        json=create_payload,
        timeout=20,
    )
    assert create_response.status_code == 200
    created = create_response.json()
    assert created["title"] == title
    assert created["url"] == "https://example.org"
    assert isinstance(created["id"], str)

    link_id = created["id"]
    try:
        links_response = api_client.get(f"{BASE_URL}/api/admin/links", headers=auth_headers, timeout=20)
        assert links_response.status_code == 200
        fetched = next((item for item in links_response.json() if item["id"] == link_id), None)
        assert fetched is not None
        assert fetched["title"] == title

        update_response = api_client.put(
            f"{BASE_URL}/api/admin/links/{link_id}",
            headers=auth_headers,
            json={"title": f"{title}_UPDATED", "is_favorite": True},
            timeout=20,
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["title"] == f"{title}_UPDATED"
        assert updated["is_favorite"] is True

        links_response_2 = api_client.get(f"{BASE_URL}/api/admin/links", headers=auth_headers, timeout=20)
        persisted = next((item for item in links_response_2.json() if item["id"] == link_id), None)
        assert persisted is not None
        assert persisted["title"] == f"{title}_UPDATED"
        assert persisted["is_favorite"] is True
    finally:
        delete_response = api_client.delete(
            f"{BASE_URL}/api/admin/links/{link_id}",
            headers=auth_headers,
            timeout=20,
        )
        assert delete_response.status_code == 200
        post_delete_links = api_client.get(f"{BASE_URL}/api/admin/links", headers=auth_headers, timeout=20).json()
        assert next((item for item in post_delete_links if item["id"] == link_id), None) is None


def test_click_tracking_updates_count(api_client, auth_headers):
    links_response = api_client.get(f"{BASE_URL}/api/admin/links", headers=auth_headers, timeout=20)
    assert links_response.status_code == 200
    links = links_response.json()
    assert len(links) > 0
    target = links[0]
    initial_clicks = target["clicks"]

    click_response = api_client.post(f"{BASE_URL}/api/links/{target['id']}/click", timeout=20)
    assert click_response.status_code == 200
    assert click_response.json().get("success") is True

    links_after = api_client.get(f"{BASE_URL}/api/admin/links", headers=auth_headers, timeout=20).json()
    updated = next((item for item in links_after if item["id"] == target["id"]), None)
    assert updated is not None
    assert updated["clicks"] == initial_clicks + 1


def test_settings_update_and_restore(api_client, auth_headers):
    current_response = api_client.get(f"{BASE_URL}/api/admin/settings", headers=auth_headers, timeout=20)
    assert current_response.status_code == 200
    current = current_response.json()

    toggled = {
        "sort_mode": "latest" if current["sort_mode"] != "latest" else "alphabetical",
        "open_in_new_tab": (not current["open_in_new_tab"]),
        "show_inactive_public": (not current["show_inactive_public"]),
    }

    try:
        update_response = api_client.put(
            f"{BASE_URL}/api/admin/settings",
            headers=auth_headers,
            json=toggled,
            timeout=20,
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["sort_mode"] == toggled["sort_mode"]
        assert updated["open_in_new_tab"] == toggled["open_in_new_tab"]
        assert updated["show_inactive_public"] == toggled["show_inactive_public"]
    finally:
        restore_response = api_client.put(
            f"{BASE_URL}/api/admin/settings",
            headers=auth_headers,
            json={
                "sort_mode": current["sort_mode"],
                "open_in_new_tab": current["open_in_new_tab"],
                "show_inactive_public": current["show_inactive_public"],
            },
            timeout=20,
        )
        assert restore_response.status_code == 200


def test_reorder_updates_custom_order(api_client, auth_headers):
    links_response = api_client.get(f"{BASE_URL}/api/admin/links", headers=auth_headers, timeout=20)
    assert links_response.status_code == 200
    links = links_response.json()
    assert len(links) >= 2
    first_two_ids = [links[0]["id"], links[1]["id"]]

    reorder_response = api_client.put(
        f"{BASE_URL}/api/admin/links/reorder/items",
        headers=auth_headers,
        json={"link_ids": list(reversed(first_two_ids))},
        timeout=20,
    )
    assert reorder_response.status_code == 200
    assert reorder_response.json().get("success") is True

    links_after = api_client.get(f"{BASE_URL}/api/admin/links", headers=auth_headers, timeout=20).json()
    id_to_order = {item["id"]: item["custom_order"] for item in links_after if item["id"] in first_two_ids}
    assert id_to_order[first_two_ids[1]] == 0
    assert id_to_order[first_two_ids[0]] == 1


def test_export_and_import_roundtrip(api_client, auth_headers):
    export_response = api_client.get(f"{BASE_URL}/api/admin/export", headers=auth_headers, timeout=30)
    assert export_response.status_code == 200
    exported = export_response.json()
    assert "settings" in exported
    assert isinstance(exported.get("links"), list)

    import_response = api_client.post(
        f"{BASE_URL}/api/admin/import",
        headers=auth_headers,
        data=json.dumps(exported),
        timeout=30,
    )
    assert import_response.status_code == 200
    imported_data = import_response.json()
    assert imported_data.get("success") is True
    assert imported_data.get("count") == len(exported["links"])


def test_change_credentials_then_revert(api_client, auth_headers):
    suffix = uuid.uuid4().hex[:6]
    new_username = f"admin_{suffix}"
    new_password = f"ServisTest_{suffix}123"

    change_response = api_client.post(
        f"{BASE_URL}/api/auth/change-credentials",
        headers=auth_headers,
        json={
            "current_password": ADMIN_PASSWORD,
            "new_username": new_username,
            "new_password": new_password,
        },
        timeout=20,
    )
    assert change_response.status_code == 200
    change_data = change_response.json()
    assert change_data["username"] == new_username
    assert "access_token" in change_data

    new_login_response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"username": new_username, "password": new_password},
        timeout=20,
    )
    assert new_login_response.status_code == 200
    new_token = new_login_response.json()["access_token"]
    new_headers = {"Authorization": f"Bearer {new_token}"}

    revert_response = api_client.post(
        f"{BASE_URL}/api/auth/change-credentials",
        headers=new_headers,
        json={
            "current_password": new_password,
            "new_username": ADMIN_USERNAME,
            "new_password": ADMIN_PASSWORD,
        },
        timeout=20,
    )
    assert revert_response.status_code == 200
    assert revert_response.json()["username"] == ADMIN_USERNAME
