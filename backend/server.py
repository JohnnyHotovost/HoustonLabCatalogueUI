import asyncio
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, ConfigDict, Field, field_validator
from starlette.middleware.cors import CORSMiddleware


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
database_name = os.environ["DB_NAME"]
jwt_secret = os.environ["JWT_SECRET"]
temp_admin_username = os.environ["TEMP_ADMIN_USERNAME"]
temp_admin_password = os.environ["TEMP_ADMIN_PASSWORD"]

client = AsyncIOMotorClient(mongo_url)
db = client[database_name]

app = FastAPI(title="Autoservis Launchpad API")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)
password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
request_headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_http_url(value: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError("URL je povinná")
    if "://" not in cleaned:
        cleaned = f"https://{cleaned}"
    parsed = urlparse(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("URL musí začínat http:// nebo https://")
    return cleaned


def parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value)


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_context.verify(password, password_hash)


def create_access_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
    }
    return jwt.encode(payload, jwt_secret, algorithm="HS256")


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=4, max_length=128)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class AdminPasswordChangeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str = Field(min_length=4, max_length=128)
    new_username: str = Field(min_length=3, max_length=64)
    new_password: str = Field(min_length=8, max_length=128)


class LinkPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=80)
    url: str
    logo_url: Optional[str] = None
    logo_data: Optional[str] = None
    is_active: bool = True
    is_favorite: bool = False

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        return normalize_http_url(value)

    @field_validator("logo_url")
    @classmethod
    def validate_logo_url(cls, value: Optional[str]) -> Optional[str]:
        if value in (None, ""):
            return None
        return normalize_http_url(value)


class LinkUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(default=None, min_length=1, max_length=80)
    url: Optional[str] = None
    logo_url: Optional[str] = None
    logo_data: Optional[str] = None
    is_active: Optional[bool] = None
    is_favorite: Optional[bool] = None

    @field_validator("url")
    @classmethod
    def validate_optional_url(cls, value: Optional[str]) -> Optional[str]:
        if value in (None, ""):
            return value
        return normalize_http_url(value)

    @field_validator("logo_url")
    @classmethod
    def validate_optional_logo_url(cls, value: Optional[str]) -> Optional[str]:
        if value in (None, ""):
            return None
        return normalize_http_url(value)


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


class SettingsUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sort_mode: str
    open_in_new_tab: bool
    show_inactive_public: bool = False

    @field_validator("sort_mode")
    @classmethod
    def validate_sort_mode(cls, value: str) -> str:
        if value not in {"alphabetical", "clicks", "custom", "latest"}:
            raise ValueError("Neplatný způsob řazení")
        return value


class ReorderPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    link_ids: list[str] = Field(min_length=1)


class ImportLinkPayload(LinkPayload):
    id: Optional[str] = None
    clicks: int = 0
    custom_order: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ImportPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    settings: Optional[dict] = None
    links: list[ImportLinkPayload] = Field(default_factory=list)


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
        payload = jwt.decode(credentials.credentials, jwt_secret, algorithms=["HS256"])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neplatný token") from exc

    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neplatný token")

    admin = await db.admins.find_one({"username": username}, {"_id": 0})
    if not admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin nebyl nalezen")
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
        ordered = sorted(links, key=lambda item: (item["custom_order"], item["title"].lower()))
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


def absolute_logo_url(base_url: str, candidate: Optional[str]) -> Optional[str]:
    if not candidate:
        return None
    return urljoin(base_url, candidate.strip())


def is_likely_image_url(url: str) -> bool:
    lowered = url.lower()
    return any(lowered.endswith(ext) for ext in (".ico", ".png", ".jpg", ".jpeg", ".svg", ".webp"))


def extract_logo_candidates(page_url: str, html: str) -> list[tuple[str, str]]:
    patterns = [
        (r'<link[^>]+rel=["\'][^"\']*(?:icon|apple-touch-icon)[^"\']*["\'][^>]+href=["\']([^"\']+)["\']', "icon"),
        (r'<meta[^>]+(?:property|name)=["\'](?:og:image|twitter:image)["\'][^>]+content=["\']([^"\']+)["\']', "meta-image"),
    ]
    candidates: list[tuple[str, str]] = []

    for pattern, source in patterns:
        matches = re.findall(pattern, html, flags=re.IGNORECASE)
        for match in matches:
            absolute = absolute_logo_url(page_url, match)
            if absolute:
                candidates.append((absolute, source))

    parsed = urlparse(page_url)
    favicon_base = f"{parsed.scheme}://{parsed.netloc}"
    candidates.extend(
        [
            (f"{favicon_base}/favicon.ico", "fallback-favicon"),
            (f"{favicon_base}/apple-touch-icon.png", "fallback-apple-touch-icon"),
        ]
    )

    deduplicated: list[tuple[str, str]] = []
    seen = set()
    for candidate, source in candidates:
        if candidate not in seen:
            seen.add(candidate)
            deduplicated.append((candidate, source))
    return deduplicated


def discover_site_logo(url: str) -> dict:
    page_response = requests.get(url, headers=request_headers, timeout=8)
    page_response.raise_for_status()
    html = page_response.text[:100000]

    for candidate_url, source in extract_logo_candidates(url, html):
        try:
            image_response = requests.get(candidate_url, headers=request_headers, timeout=6, stream=True)
            content_type = image_response.headers.get("content-type", "")
            if image_response.ok and (content_type.startswith("image/") or is_likely_image_url(candidate_url)):
                return {"found": True, "logo_url": candidate_url, "source": source}
        except requests.RequestException:
            continue

    return {"found": False, "logo_url": None, "source": None}


async def seed_links_if_empty() -> None:
    if await db.links.count_documents({}):
        return

    sample_links = [
        ("Auto Kelly", "https://www.autokelly.cz"),
        ("ELIT", "https://www.elit.cz"),
        ("Inter Cars", "https://cz.intercars.eu"),
        ("Aukro díly", "https://aukro.cz"),
        ("Heureka", "https://www.heureka.cz"),
        ("Google Mapy", "https://maps.google.com"),
        ("DMS Servis", "https://example.com/dms-servis"),
        ("Pneuservis katalog", "https://example.com/pneuservis"),
        ("Diagnostika", "https://example.com/diagnostika"),
        ("Ceník práce", "https://example.com/cenik-prace"),
        ("Dodavatel olejů", "https://example.com/oleje"),
        ("Fleet portál", "https://example.com/fleet"),
        ("Škoda katalog", "https://example.com/skoda"),
        ("VW katalog", "https://example.com/vw"),
        ("Interní návody", "https://example.com/navody"),
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
    await get_settings()

    if not await db.admins.count_documents({}):
        await db.admins.insert_one(
            {
                "id": str(uuid.uuid4()),
                "username": temp_admin_username,
                "password_hash": hash_password(temp_admin_password),
                "created_at": now_iso(),
                "updated_at": now_iso(),
            }
        )
        logger.info("Temporary admin account created: %s", temp_admin_username)

    await seed_links_if_empty()


@api_router.get("/")
async def root():
    return {"message": "Autoservis launchpad API běží"}


@api_router.get("/launchpad", response_model=LaunchpadResponse)
async def get_launchpad():
    settings = await get_settings()
    filters = {} if settings["show_inactive_public"] else {"is_active": True}
    links = await db.links.find(filters, {"_id": 0}).to_list(500)
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
async def login(payload: LoginRequest):
    admin = await db.admins.find_one({"username": payload.username}, {"_id": 0})
    if not admin or not verify_password(payload.password, admin["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Neplatné přihlašovací údaje")

    return {"access_token": create_access_token(admin["username"]), "username": admin["username"]}


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

    await db.admins.update_one(
        {"id": admin["id"]},
        {"$set": {"username": new_username, "password_hash": hash_password(payload.new_password), "updated_at": now_iso()}},
    )
    return {
        "message": "Přihlašovací údaje byly změněny",
        "username": new_username,
        "access_token": create_access_token(new_username),
    }


@api_router.post("/admin/discover-logo")
async def discover_logo(payload: LogoDiscoveryRequest, _: dict = Depends(get_admin_from_token)):
    try:
        return await asyncio.to_thread(discover_site_logo, payload.url)
    except requests.RequestException:
        parsed = urlparse(payload.url)
        fallback_url = f"{parsed.scheme}://{parsed.netloc}/favicon.ico"
        return {"found": True, "logo_url": fallback_url, "source": "fallback-favicon"}


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
    links = await db.links.find({}, {"_id": 0}).to_list(500)
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
    links = await db.links.find({}, {"_id": 0}).to_list(500)
    return {"settings": settings, "links": sorted(links, key=lambda item: item["custom_order"])}


@api_router.post("/admin/import")
async def import_links(payload: ImportPayload, _: dict = Depends(get_admin_from_token)):
    settings = await get_settings()
    imported_settings_source = payload.settings or settings
    imported_settings = SettingsUpdatePayload(
        sort_mode=imported_settings_source.get("sort_mode", settings["sort_mode"]),
        open_in_new_tab=imported_settings_source.get("open_in_new_tab", settings["open_in_new_tab"]),
        show_inactive_public=imported_settings_source.get("show_inactive_public", settings["show_inactive_public"]),
    )
    await db.settings.update_one(
        {"id": settings["id"]},
        {"$set": {**imported_settings.model_dump(), "id": settings["id"]}},
    )

    await db.links.delete_many({})
    documents = []
    for index, link in enumerate(payload.links):
        link_dict = clean_link_payload(link.model_dump())
        documents.append(
            {
                "id": link_dict.get("id") or str(uuid.uuid4()),
                "title": link_dict["title"],
                "url": link_dict["url"],
                "logo_url": link_dict.get("logo_url"),
                "logo_data": link_dict.get("logo_data"),
                "clicks": link_dict.get("clicks", 0),
                "is_active": link_dict.get("is_active", True),
                "is_favorite": link_dict.get("is_favorite", False),
                "custom_order": link_dict.get("custom_order", index),
                "created_at": link_dict.get("created_at") or now_iso(),
                "updated_at": link_dict.get("updated_at") or now_iso(),
            }
        )

    if documents:
        await db.links.insert_many([document.copy() for document in documents])
    return {"success": True, "count": len(documents)}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ["CORS_ORIGINS"].split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    await ensure_seed_data()


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()