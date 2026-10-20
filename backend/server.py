import asyncio
import base64
import binascii
import ipaddress
import socket
import time
from collections import defaultdict, deque
from contextlib import contextmanager
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

import bcrypt
import requests
import urllib3
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from pymongo.errors import PyMongoError


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")
frontend_build_dir = ROOT_DIR.parent / "frontend" / "build"
frontend_static_dir = frontend_build_dir / "static"

mongo_url = os.environ["MONGO_URL"]
database_name = os.environ["DB_NAME"]
jwt_secret = os.environ["JWT_SECRET"]
temp_admin_username = os.environ["TEMP_ADMIN_USERNAME"]
temp_admin_password = os.environ["TEMP_ADMIN_PASSWORD"]
if len(jwt_secret.encode("utf-8")) < 32:
    raise ValueError("JWT_SECRET musí mít nejméně 32 bajtů; vytvořte vlastní náhodný klíč")

client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
db = client[database_name]

app = FastAPI(title="Catalogue Portal API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)
mutation_lock = asyncio.Lock()
login_failures: dict[str, deque] = defaultdict(deque)
MAX_LOGO_BYTES = 1024 * 1024
MAX_LINKS = 5000
request_headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_http_url(value: str) -> str:
    cleaned = value.strip()
    if not cleaned or len(cleaned) > 2048 or any(char.isspace() or ord(char) < 32 for char in cleaned):
        raise ValueError("URL je povinná a nesmí obsahovat mezery")
    if "://" not in cleaned:
        cleaned = f"https://{cleaned}"
    try:
        parsed = urlparse(cleaned)
        if (parsed.scheme not in {"http", "https"} or not parsed.hostname
                or parsed.username or parsed.password or parsed.port == 0
                or "\\" in cleaned):
            raise ValueError
        hostname = parsed.hostname.encode("idna").decode("ascii")
        try:
            ipaddress.ip_address(hostname)
        except ValueError:
            if len(hostname) > 253 or not all(re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label) for label in hostname.rstrip(".").split(".")):
                raise ValueError
    except (ValueError, UnicodeError) as exc:
        raise ValueError("URL musí být platná http:// nebo https:// adresa bez přihlašovacích údajů") from exc
    return cleaned


def parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


def validate_password(value: str) -> str:
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Heslo smí mít nejvýše 72 bajtů v UTF-8")
    return value


def hash_password(password: str) -> str:
    return bcrypt.hashpw(validate_password(password).encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(validate_password(password).encode(), password_hash.encode())
    except (ValueError, TypeError):
        return False


# Compare a dummy hash too, so nonexistent usernames do not skip expensive verification.
DUMMY_PASSWORD_HASH = hash_password(uuid.uuid4().hex)


def create_access_token(username: str, token_version: int = 0) -> str:
    payload = {
        "sub": username,
        "ver": token_version,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
    }
    return jwt.encode(payload, jwt_secret, algorithm="HS256")


class StrictPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LoginRequest(StrictPayload):
    @field_validator("username", mode="before")
    @classmethod
    def trimmed_username(cls, value):
        return value.strip() if isinstance(value, str) else value

    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=4, max_length=72)

    @field_validator("password")
    @classmethod
    def password_bytes(cls, value: str) -> str:
        return validate_password(value)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class AdminPasswordChangeRequest(StrictPayload):
    @field_validator("new_username", mode="before")
    @classmethod
    def trimmed_username(cls, value):
        return value.strip() if isinstance(value, str) else value

    current_password: str = Field(min_length=4, max_length=72)
    new_username: str = Field(min_length=3, max_length=64)
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator("current_password", "new_password")
    @classmethod
    def password_bytes(cls, value: str) -> str:
        return validate_password(value)


def validate_logo_data(value: Optional[str]) -> Optional[str]:
    if value in (None, ""):
        return None
    match = re.fullmatch(r"data:image/(png|jpeg|gif|webp|x-icon|vnd.microsoft.icon);base64,([A-Za-z0-9+/=]+)", value)
    if not match or len(value) > MAX_LOGO_BYTES * 4 // 3 + 100:
        raise ValueError("Logo musí být PNG, JPEG, GIF, WebP nebo ICO do 1 MB")
    try:
        decoded = base64.b64decode(match[2], validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Neplatný obsah loga") from exc
    mime = match[1]
    valid = {
        "png": decoded.startswith(b"\x89PNG\r\n\x1a\n"),
        "jpeg": decoded.startswith(b"\xff\xd8\xff"),
        "gif": decoded.startswith((b"GIF87a", b"GIF89a")),
        "webp": decoded.startswith(b"RIFF") and decoded[8:12] == b"WEBP",
        "x-icon": decoded.startswith(b"\x00\x00\x01\x00"),
        "vnd.microsoft.icon": decoded.startswith(b"\x00\x00\x01\x00"),
    }[mime]
    if not valid or len(decoded) > MAX_LOGO_BYTES:
        raise ValueError("Obsah souboru neodpovídá formátu loga")
    return value


class LinkPayload(StrictPayload):
    @field_validator("title", mode="before")
    @classmethod
    def trimmed_title(cls, value):
        return value.strip() if isinstance(value, str) else value

    title: str = Field(min_length=1, max_length=80)
    url: str
    logo_url: Optional[str] = None
    logo_data: Optional[str] = None
    is_active: bool = Field(default=True, strict=True)
    is_favorite: bool = Field(default=False, strict=True)

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return normalize_http_url(value)

    @field_validator("logo_url")
    @classmethod
    def validate_logo_url(cls, value: Optional[str]) -> Optional[str]:
        return normalize_http_url(value) if value else None

    @field_validator("logo_data")
    @classmethod
    def logo_content(cls, value: Optional[str]) -> Optional[str]:
        return validate_logo_data(value)


class LinkUpdatePayload(LinkPayload):
    title: Optional[str] = Field(default=None, min_length=1, max_length=80)
    url: Optional[str] = None
    is_active: Optional[bool] = Field(default=None, strict=True)
    is_favorite: Optional[bool] = Field(default=None, strict=True)

    @model_validator(mode="before")
    @classmethod
    def reject_null_fields(cls, values):
        if not isinstance(values, dict):
            return values
        for name in ("title", "url", "is_active", "is_favorite"):
            if name in values and values[name] is None:
                raise ValueError(f"Pole {name} nesmí být null")
        return values


class LaunchpadLink(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    title: str
    url: str
    logo_url: Optional[str] = None
    logo_data: Optional[str] = None
    clicks: int
    is_active: bool
    is_favorite: bool
    custom_order: int
    created_at: str
    updated_at: str


class LaunchpadSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    sort_mode: str
    open_in_new_tab: bool
    show_inactive_public: bool


class LaunchpadResponse(BaseModel):
    links: list[LaunchpadLink]
    settings: LaunchpadSettings


class SettingsUpdatePayload(StrictPayload):

    sort_mode: str
    open_in_new_tab: bool = Field(strict=True)
    show_inactive_public: bool = Field(default=False, strict=True)

    @field_validator("sort_mode")
    @classmethod
    def validate_sort_mode(cls, value: str) -> str:
        if value not in {"alphabetical", "clicks", "custom", "latest"}:
            raise ValueError("Neplatný způsob řazení")
        return value


class ReorderPayload(StrictPayload):
    link_ids: list[str] = Field(min_length=1, max_length=MAX_LINKS)

    @field_validator("link_ids")
    @classmethod
    def distinct_ids(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value) or any(not item.strip() for item in value):
            raise ValueError("Seznam obsahuje duplicitní nebo prázdné ID")
        return value


class ImportLinkPayload(LinkPayload):
    id: Optional[str] = Field(default=None, min_length=1, max_length=128)
    clicks: int = Field(default=0, ge=0, strict=True)
    custom_order: Optional[int] = Field(default=None, ge=0, strict=True)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    @field_validator("created_at", "updated_at")
    @classmethod
    def valid_timestamp(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        try:
            return parse_datetime(value).isoformat()
        except ValueError as exc:
            raise ValueError("Neplatné datum") from exc


class ImportSettingsPayload(SettingsUpdatePayload):
    id: Optional[str] = None


class ImportPayload(StrictPayload):
    settings: Optional[ImportSettingsPayload] = None
    links: list[ImportLinkPayload] = Field(min_length=1, max_length=MAX_LINKS)

    @field_validator("links")
    @classmethod
    def distinct_ids(cls, value: list[ImportLinkPayload]) -> list[ImportLinkPayload]:
        ids = [item.id for item in value if item.id is not None]
        if len(ids) != len(set(ids)):
            raise ValueError("Import obsahuje duplicitní ID")
        return value


class LogoDiscoveryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return normalize_http_url(value)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def get_admin_from_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Přihlášení vypršelo")

    try:
        payload = jwt.decode(credentials.credentials, jwt_secret, algorithms=["HS256"], options={"require_exp": True, "require_sub": True})
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neplatný token") from exc

    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neplatný token")

    admin = await db.admins.find_one({"username": username}, {"_id": 0})
    if not admin or payload.get("ver") != admin.get("token_version", 0):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Přihlášení vypršelo")
    return admin


async def get_settings() -> dict:
    settings_doc = await db.settings.find_one({}, {"_id": 0})
    if settings_doc:
        return settings_doc

    settings_doc = {
        "id": str(uuid.uuid4()),
        "sort_mode": "alphabetical",
        "open_in_new_tab": True,
        "show_inactive_public": False,
    }
    await db.settings.insert_one(settings_doc.copy())
    return settings_doc


def sort_links(links: list[dict], sort_mode: str) -> list[dict]:
    if sort_mode == "clicks":
        ordered = sorted(links, key=lambda item: (-item["clicks"], item["title"].lower()))
    elif sort_mode == "custom":
        return sorted(links, key=lambda item: (item["custom_order"], item["title"].lower()))
    elif sort_mode == "latest":
        ordered = sorted(links, key=lambda item: parse_datetime(item["created_at"]), reverse=True)
    else:
        ordered = sorted(links, key=lambda item: item["title"].lower())

    favorites = [item for item in ordered if item.get("is_favorite")]
    regular = [item for item in ordered if not item.get("is_favorite")]
    return favorites + regular


def clean_link_payload(payload: dict) -> dict:
    cleaned = {**payload}
    if "title" in cleaned and cleaned["title"] is not None:
        cleaned["title"] = cleaned["title"].strip()
    if cleaned.get("logo_url") == "":
        cleaned["logo_url"] = None
    if cleaned.get("logo_data") == "":
        cleaned["logo_data"] = None
    return cleaned


class UnsafeLogoURL(ValueError):
    pass


def resolve_public_logo_destination(value: str) -> tuple[str, str]:
    """Discovery must never request local, private or special-purpose addresses."""
    try:
        value = normalize_http_url(value)
        parsed = urlparse(value)
        if parsed.port not in (None, 80, 443):
            raise ValueError
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(item[4][0]).is_global for item in addresses):
            raise ValueError
    except (ValueError, OSError) as exc:
        raise UnsafeLogoURL("Logo lze hledat jen na veřejně dostupné webové adrese") from exc
    return value, addresses[0][4][0]


def validate_public_logo_url(value: str) -> str:
    return resolve_public_logo_destination(value)[0]


@contextmanager
def open_pinned_logo(url: str, address: str):
    """Pin validated DNS while preserving Host, SNI, certificate checks and proxies."""
    parsed = urlparse(url)
    hostname = parsed.hostname.encode("idna").decode("ascii")
    host = f"[{address}]" if ":" in address else address
    target = parsed._replace(netloc=host + (f":{parsed.port}" if parsed.port else "")).geturl()

    class HostnameAdapter(requests.adapters.HTTPAdapter):
        def init_poolmanager(self, *args, **kwargs):
            if parsed.scheme == "https":
                kwargs.update(assert_hostname=hostname, server_hostname=hostname)
            return super().init_poolmanager(*args, **kwargs)

        def proxy_manager_for(self, proxy, **kwargs):
            if parsed.scheme == "https":
                kwargs.update(assert_hostname=hostname, server_hostname=hostname)
            return super().proxy_manager_for(proxy, **kwargs)

    with requests.Session() as session:
        session.mount(f"{parsed.scheme}://", HostnameAdapter())
        try:
            with session.get(target, headers={**request_headers, "Host": parsed.netloc}, timeout=(3, 3), stream=True, allow_redirects=False) as response:
                yield response
        except urllib3.exceptions.HTTPError as exc:
            raise requests.RequestException("Logo se nepodařilo stáhnout") from exc


def fetch_logo_resource(url: str, max_bytes: int, deadline: Optional[float] = None) -> tuple[str, str, bytes]:
    deadline = deadline or time.monotonic() + 8
    for _ in range(4):
        if time.monotonic() >= deadline:
            raise requests.Timeout("Vyhledání loga trvalo příliš dlouho")
        url, address = resolve_public_logo_destination(url)
        with open_pinned_logo(url, address) as response:
            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("location")
                if not location:
                    raise requests.RequestException("Přesměrování nemá cílovou adresu")
                target = urljoin(url, location)
                if urlparse(url).scheme == "https" and urlparse(target).scheme == "http":
                    raise UnsafeLogoURL("Nezabezpečené přesměrování loga")
                url = target
                continue
            response.raise_for_status()
            content_type = response.headers.get("content-type", "").split(";", 1)[0].lower()
            body = bytearray()
            while True:
                if time.monotonic() >= deadline:
                    raise requests.Timeout("Vyhledání loga trvalo příliš dlouho")
                # read1 returns available bytes, so slow streaming cannot defer
                # the wall-clock check until a full large chunk has arrived.
                chunk = response.raw.read1(16384, decode_content=True)
                if not chunk:
                    break
                body.extend(chunk)
                if len(body) > max_bytes:
                    raise requests.RequestException("Odpověď pro logo je příliš velká")
            return url, content_type, bytes(body)
    raise requests.RequestException("Příliš mnoho přesměrování")


def extract_logo_candidates(page_url: str, html: str) -> list[tuple[str, str]]:
    class LogoParser(HTMLParser):
        def __init__(self):
            super().__init__()
            self.candidates = []

        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            candidate = None
            source = None
            if tag == "link" and any("icon" in token for token in (attrs.get("rel") or "").lower().split()):
                candidate, source = attrs.get("href"), "icon"
            if tag == "meta" and (attrs.get("property") or attrs.get("name") or "").lower() in {"og:image", "twitter:image"}:
                candidate, source = attrs.get("content"), "meta-image"
            if candidate:
                self.candidates.append((urljoin(page_url, candidate.strip()), source))

    parser = LogoParser()
    parser.feed(html)
    parsed = urlparse(page_url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    candidates = parser.candidates + [(f"{base}/favicon.ico", "fallback-favicon"), (f"{base}/apple-touch-icon.png", "fallback-apple-touch-icon")]
    return list(dict.fromkeys(candidates))[:10]


def discover_site_logo(url: str) -> dict:
    deadline = time.monotonic() + 12
    page_url, content_type, body = fetch_logo_resource(url, 256 * 1024, deadline)
    if content_type not in {"text/html", "application/xhtml+xml"}:
        return {"found": False, "logo_url": None, "source": None}
    for candidate_url, source in extract_logo_candidates(page_url, body.decode("utf-8", errors="replace")):
        if time.monotonic() >= deadline:
            break
        try:
            final_url, image_type, image_body = fetch_logo_resource(candidate_url, MAX_LOGO_BYTES, deadline)
            if image_type in {"image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"} and image_body:
                return {"found": True, "logo_url": final_url, "source": source}
        except (requests.RequestException, UnsafeLogoURL):
            continue
    return {"found": False, "logo_url": None, "source": None}


async def seed_links_if_empty() -> None:
    if await db.links.count_documents({}):
        return

    sample_links = [
        ("Katalog 01", "https://example.com/katalog-01"),
        ("Katalog 02", "https://example.com/katalog-02"),
        ("Dodavatelský portál", "https://example.com/dodavatelsky-portal"),
        ("Dokumentace", "https://example.com/dokumentace"),
        ("Ceníky", "https://example.com/ceniky"),
        ("Objednávky", "https://example.com/objednavky"),
        ("Znalostní báze", "https://example.com/znalostni-baze"),
        ("Reference", "https://example.com/reference"),
        ("Fleet portál", "https://example.com/fleet-portal"),
        ("Reporting", "https://example.com/reporting"),
        ("Portál partnerů", "https://example.com/partneri"),
        ("Asset knihovna", "https://example.com/assets"),
        ("Status panel", "https://example.com/status"),
        ("Interní návody", "https://example.com/navody"),
        ("Knowledge Hub", "https://example.com/knowledge-hub"),
    ]

    documents = []
    for index, (title, url) in enumerate(sample_links):
        timestamp = now_iso()
        documents.append(
            {
                "id": str(uuid.uuid4()),
                "title": title,
                "url": url,
                "logo_url": None,
                "logo_data": None,
                "clicks": 0,
                "is_active": True,
                "is_favorite": index < 3,
                "custom_order": index,
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        )

    await db.links.insert_many([document.copy() for document in documents])


async def ensure_seed_data() -> None:
    await db.links.create_index("id", unique=True)
    await get_settings()

    first_start = not await db.admins.count_documents({})
    if first_start:
        if not 3 <= len(temp_admin_username.strip()) <= 64 or temp_admin_username != temp_admin_username.strip():
            raise ValueError("TEMP_ADMIN_USERNAME musí mít 3 až 64 znaků bez mezer na okrajích")
        if len(temp_admin_password) < 8:
            raise ValueError("TEMP_ADMIN_PASSWORD musí mít alespoň 8 znaků")
        validate_password(temp_admin_password)
        await db.admins.insert_one(
            {
                "id": str(uuid.uuid4()),
                "username": temp_admin_username,
                "password_hash": hash_password(temp_admin_password),
                "token_version": 0,
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
        )
        logger.info("Temporary admin account created: %s", temp_admin_username)

    if first_start:
        await seed_links_if_empty()


@api_router.get("/")
async def root():
    return {"message": "Catalogue portal API běží"}


@api_router.get("/health")
async def health():
    await db.command("ping")
    return {"status": "ok"}


@api_router.get("/launchpad", response_model=LaunchpadResponse)
async def get_launchpad():
    settings = await get_settings()
    filters = {} if settings["show_inactive_public"] else {"is_active": True}
    links = await db.links.find(filters, {"_id": 0}).to_list(None)
    return {"links": sort_links(links, settings["sort_mode"]), "settings": settings}


@api_router.post("/links/{link_id}/click")
async def track_click(link_id: str):
    result = await db.links.update_one(
        {"id": link_id},
        {"$inc": {"clicks": 1}, "$set": {"updated_at": now_iso()}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Odkaz nebyl nalezen")
    return {"success": True}


@api_router.post("/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request):
    address = request.client.host if request.client else "unknown"
    now = time.monotonic()
    # Bound memory even when many distinct clients send failed requests.
    for key in list(login_failures):
        if not login_failures[key] or now - login_failures[key][-1] >= 900:
            login_failures.pop(key, None)
    attempts = login_failures[address]
    while attempts and now - attempts[0] >= 900:
        attempts.popleft()
    if len(attempts) >= 5:
        raise HTTPException(status_code=429, detail="Příliš mnoho pokusů. Zkuste to za 15 minut.", headers={"Retry-After": "900"})
    attempts.append(now)
    admin = await db.admins.find_one({"username": payload.username}, {"_id": 0})
    valid = await asyncio.to_thread(verify_password, payload.password, admin["password_hash"] if admin else DUMMY_PASSWORD_HASH)
    if not admin or not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neplatné přihlašovací údaje")
    login_failures.pop(address, None)
    return {"access_token": create_access_token(admin["username"], admin.get("token_version", 0)), "username": admin["username"]}


@api_router.get("/auth/me")
async def auth_me(admin: dict = Depends(get_admin_from_token)):
    return {"username": admin["username"]}


@api_router.post("/auth/change-credentials")
async def change_credentials(payload: AdminPasswordChangeRequest, admin: dict = Depends(get_admin_from_token)):
    if not verify_password(payload.current_password, admin["password_hash"]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Aktuální heslo nesouhlasí")

    new_username = payload.new_username.strip()
    existing = await db.admins.find_one({"username": new_username}, {"_id": 0})
    if existing and existing["id"] != admin["id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Toto jméno už existuje")

    token_version = admin.get("token_version", 0) + 1
    await db.admins.update_one(
        {"id": admin["id"]},
        {"$set": {"username": new_username, "password_hash": hash_password(payload.new_password), "token_version": token_version, "updated_at": now_iso()}},
    )
    return {
        "message": "Přihlašovací údaje byly změněny",
        "username": new_username,
        "access_token": create_access_token(new_username, token_version),
    }


@api_router.post("/admin/discover-logo")
async def discover_logo(payload: LogoDiscoveryRequest, _: dict = Depends(get_admin_from_token)):
    try:
        return await asyncio.to_thread(discover_site_logo, payload.url)
    except UnsafeLogoURL as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Web se nepodařilo načíst. Zadejte logo ručně.") from exc


@api_router.get("/admin/settings", response_model=LaunchpadSettings)
async def get_admin_settings(_: dict = Depends(get_admin_from_token)):
    return await get_settings()


@api_router.put("/admin/settings", response_model=LaunchpadSettings)
async def update_admin_settings(payload: SettingsUpdatePayload, _: dict = Depends(get_admin_from_token)):
    settings = await get_settings()
    updated = {**settings, **payload.model_dump(), "id": settings["id"]}
    await db.settings.update_one({"id": settings["id"]}, {"$set": updated})
    return updated


@api_router.get("/admin/links", response_model=list[LaunchpadLink])
async def get_admin_links(_: dict = Depends(get_admin_from_token)):
    settings = await get_settings()
    links = await db.links.find({}, {"_id": 0}).to_list(None)
    return sort_links(links, settings["sort_mode"])


@api_router.post("/admin/links", response_model=LaunchpadLink)
async def create_link(payload: LinkPayload, _: dict = Depends(get_admin_from_token)):
    cleaned = clean_link_payload(payload.model_dump())
    timestamp = now_iso()
    document = {
        "id": str(uuid.uuid4()),
        **cleaned,
        "clicks": 0,
        "custom_order": await db.links.count_documents({}),
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    await db.links.insert_one(document.copy())
    return document


@api_router.put("/admin/links/reorder/items")
async def reorder_links(payload: ReorderPayload, _: dict = Depends(get_admin_from_token)):
    existing_ids = {item["id"] for item in await db.links.find({}, {"id": 1}).to_list(None)}
    if any(link_id not in existing_ids for link_id in payload.link_ids):
        raise HTTPException(status_code=404, detail="Některý odkaz nebyl nalezen")
    for index, link_id in enumerate(payload.link_ids):
        await db.links.update_one({"id": link_id}, {"$set": {"custom_order": index, "updated_at": now_iso()}})
    return {"success": True}


@api_router.put("/admin/links/{link_id}", response_model=LaunchpadLink)
async def update_link(link_id: str, payload: LinkUpdatePayload, _: dict = Depends(get_admin_from_token)):
    existing = await db.links.find_one({"id": link_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Odkaz nebyl nalezen")

    updated = {**existing, **clean_link_payload(payload.model_dump(exclude_unset=True)), "updated_at": now_iso()}
    await db.links.update_one({"id": link_id}, {"$set": updated})
    return updated


@api_router.delete("/admin/links/{link_id}")
async def delete_link(link_id: str, _: dict = Depends(get_admin_from_token)):
    result = await db.links.delete_one({"id": link_id})
    if not result.deleted_count:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Odkaz nebyl nalezen")
    return {"success": True}


@api_router.get("/admin/export")
async def export_links(_: dict = Depends(get_admin_from_token)):
    settings = await get_settings()
    links = await db.links.find({}, {"_id": 0}).to_list(None)
    return {"settings": settings, "links": sorted(links, key=lambda item: item["custom_order"])}


@api_router.post("/admin/import")
async def import_links(payload: ImportPayload, _: dict = Depends(get_admin_from_token)):
    # Stage a complete merged catalogue first. Failed validation or insertion never
    # touches the live collection. Atomic rename works with standalone MongoDB too.
    settings = await get_settings()
    current = await db.links.find({}, {"_id": 0}).to_list(None)
    merged = {item["id"]: item for item in current}
    for index, link in enumerate(payload.links):
        link_id = link.id or str(uuid.uuid4())
        previous = merged.get(link_id, {})
        data = clean_link_payload(link.model_dump(exclude={"id"}, exclude_unset=bool(previous)))
        if previous:
            data["clicks"] = max(previous.get("clicks", 0), data.get("clicks", 0))
        timestamp = now_iso()
        merged[link_id] = {
            **previous, **data, "id": link_id,
            "custom_order": data.get("custom_order") if data.get("custom_order") is not None else previous.get("custom_order", len(current) + index),
            "created_at": data.get("created_at") or previous.get("created_at") or timestamp,
            "updated_at": data.get("updated_at") or timestamp,
        }
    if len(merged) > MAX_LINKS:
        raise HTTPException(status_code=422, detail="Katalog smí obsahovat nejvýše 5000 položek")
    stage = db[f"links_import_{uuid.uuid4().hex}"]
    settings_changed = False
    committed = False
    try:
        await stage.insert_many([item.copy() for item in merged.values()])
        await stage.create_index("id", unique=True)
        if payload.settings:
            await db.settings.update_one({"id": settings["id"]}, {"$set": payload.settings.model_dump(exclude={"id"})})
            settings_changed = True
        await stage.rename("links", dropTarget=True)
        committed = True
    except PyMongoError as exc:
        if settings_changed:
            await db.settings.replace_one({"id": settings["id"]}, settings)
        raise HTTPException(status_code=503, detail="Import se nepodařilo uložit. Původní odkazy zůstaly zachované.") from exc
    finally:
        # Rename consumed the staging collection. Cleanup is only necessary
        # before commit and must never hide the original import outcome.
        if not committed:
            try:
                await stage.drop()
            except PyMongoError:
                logger.warning("Failed to remove an uncommitted import staging collection")
    return {"success": True, "count": len(payload.links), "total": len(merged)}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ["CORS_ORIGINS"].split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def protect_requests(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH"}:
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 10 * 1024 * 1024:
                return JSONResponse(status_code=413, content={"detail": "Požadavek je příliš velký (maximum 10 MB)."})
        request._body = bytes(body)
    # Serialize catalogue writes so imports cannot lose concurrent clicks or edits.
    # Deployment uses a single Uvicorn worker; do not add multiple workers without
    # replacing this lock with a distributed lock or MongoDB transactions.
    if request.url.path.startswith("/api/") and request.method in {"POST", "PUT", "DELETE"}:
        if request.url.path not in {"/api/auth/login", "/api/admin/discover-logo"}:
            async with mutation_lock:
                response = await call_next(request)
        else:
            response = await call_next(request)
    else:
        response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.url.path.startswith("/api/auth/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    # Never echo passwords, tokens or large uploaded image data in error responses.
    messages = {
        "missing": "Pole je povinné", "string_too_short": "Hodnota je příliš krátká",
        "string_too_long": "Hodnota je příliš dlouhá", "string_type": "Pole musí obsahovat text",
        "bool_type": "Pole musí být ano/ne", "int_type": "Pole musí být celé číslo",
        "greater_than_equal": "Číselná hodnota je příliš nízká", "json_invalid": "Neplatný JSON",
        "too_short": "Seznam nesmí být prázdný", "too_long": "Seznam obsahuje příliš mnoho položek",
        "extra_forbidden": "Neznámé pole", "model_attributes_type": "Neplatná struktura dat",
        "list_type": "Pole musí být seznam",
    }
    details = []
    for error in exc.errors():
        message = error["msg"].removeprefix("Value error, ") if error["type"] == "value_error" else messages.get(error["type"], "Neplatná hodnota")
        details.append({"loc": error["loc"], "msg": message, "type": error["type"]})
    return JSONResponse(status_code=422, content={"detail": details})


@app.exception_handler(PyMongoError)
async def database_error_handler(request: Request, exc: PyMongoError):
    logger.error("Database operation failed: %s", type(exc).__name__)
    return JSONResponse(status_code=503, content={"detail": "Databáze je dočasně nedostupná. Zkuste to znovu."})


@app.on_event("startup")
async def startup_event():
    await ensure_seed_data()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


if frontend_static_dir.exists():
    app.mount("/static", StaticFiles(directory=frontend_static_dir), name="frontend-static")


if frontend_build_dir.exists():
    @app.get("/", include_in_schema=False)
    async def serve_frontend_index():
        return FileResponse(frontend_build_dir / "index.html")


    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend_app(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint nebyl nalezen")
        requested_path = (frontend_build_dir / full_path).resolve()
        if frontend_build_dir.resolve() not in requested_path.parents:
            raise HTTPException(status_code=404, detail="Soubor nebyl nalezen")
        if requested_path.exists() and requested_path.is_file():
            return FileResponse(requested_path)
        return FileResponse(frontend_build_dir / "index.html")
