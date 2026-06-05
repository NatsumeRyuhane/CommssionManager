from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import LabelType, Rating, Visibility, VisibilityPreset, WebhookEvent


# ---------------------------------------------------------------- auth
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------------------------------------------------------------- lookups
class LabelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    type: LabelType


class CharacterOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class ArtistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    info_xml: str | None = None


class ArtistCreate(BaseModel):
    name: str
    info_xml: str | None = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_empty(cls, name: str) -> str:
        name = name.strip()
        if not name:
            raise ValueError("name must not be empty")
        return name


class ArtistUpdate(BaseModel):
    name: str | None = None
    info_xml: str | None = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_empty(cls, name: str | None) -> str | None:
        if name is None:
            return None
        name = name.strip()
        if not name:
            raise ValueError("name must not be empty")
        return name


# ---------------------------------------------------------------- files / nodes
class FileOut(BaseModel):
    id: int
    node_id: int
    format: str
    label: str | None = None
    is_image: bool
    width: int | None = None
    height: int | None = None
    focal_x: float | None = None
    focal_y: float | None = None
    visibility: Visibility | None = None
    effective_visibility: Visibility | None = None
    url: str
    is_cover: bool = False


class FileMove(BaseModel):
    node_id: int


class NodeOut(BaseModel):
    id: int
    name: str
    position: int | None = None
    started_at: datetime | None = None
    is_detached: bool
    visibility: Visibility | None = None
    effective_visibility: Visibility | None = None
    files: list[FileOut] = []


class NodeCreate(BaseModel):
    name: str


class NodeUpdate(BaseModel):
    name: str | None = None
    started_at: datetime | None = None

    @field_validator("name")
    @classmethod
    def name_must_not_be_empty(cls, name: str | None) -> str | None:
        if name is None:
            return None
        name = name.strip()
        if not name:
            raise ValueError("name must not be empty")
        return name


class NodeReorder(BaseModel):
    node_ids: list[int]


class CoverOut(BaseModel):
    file_id: int
    url: str
    width: int | None = None
    height: int | None = None
    focal_x: float | None = None
    focal_y: float | None = None


# ---------------------------------------------------------------- commission output
class CommissionListItem(BaseModel):
    id: int
    title: str
    rating: Rating | None = None
    completed_at: date | None = None
    visibility: Visibility | None = None
    effective_visibility: Visibility | None = None
    categories: list[str] = []
    tags: list[str] = []
    characters: list[str] = []
    artists: list[str] = []
    formats: list[str] = []
    current_stage: str | None = None
    cover: CoverOut | None = None


class CommissionDetail(CommissionListItem):
    description: str | None = None
    confirmed_at: datetime | None = None
    price_amount: Decimal | None = None
    price_currency: str | None = None
    nodes: list[NodeOut] = []
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------- commission input
class CommissionCreate(BaseModel):
    title: str
    description: str | None = None
    completed_at: date | None = None
    rating: Rating = Rating.general
    confirmed_at: datetime | None = None
    price_amount: Decimal | None = None
    price_currency: str | None = None
    visibility_override: Visibility | None = None
    category_names: list[str] = []
    tag_names: list[str] = []
    character_names: list[str] = []
    artist_names: list[str] = []
    node_names: list[str] = []


class CommissionUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    completed_at: date | None = None
    rating: Rating | None = None
    confirmed_at: datetime | None = None
    price_amount: Decimal | None = None
    price_currency: str | None = None
    cover_file_id: int | None = None
    visibility_override: Visibility | None = None
    category_names: list[str] | None = None
    tag_names: list[str] | None = None
    character_names: list[str] | None = None
    artist_names: list[str] | None = None


# ---------------------------------------------------------------- agent payload
class CopyJsonOut(BaseModel):
    # `date` field name would shadow the `date` type during annotation eval, so use an alias
    model_config = ConfigDict(populate_by_name=True)
    id: int
    title: str
    completed_date: date | None = Field(default=None, alias="date")
    confirmed_at: datetime | None = None
    category: str | None = None
    rating: Rating
    tags: list[str] = []
    characters: list[str] = []
    artists: list[str] = []
    current_stage: str | None = None
    files_endpoint: str
    public_images_endpoint: str


# ---------------------------------------------------------------- api keys
class ApiKeyCreate(BaseModel):
    name: str
    scopes: list[str] = ["read"]


class ApiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    prefix: str
    scopes: str
    created_at: datetime
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None


class ApiKeyCreated(ApiKeyOut):
    full_key: str


# ---------------------------------------------------------------- settings / visibility
class VisibilityFieldDefaults(BaseModel):
    title: bool
    description: bool
    labels: bool
    rating: bool
    characters: bool
    artists: bool
    completed_at: bool
    confirmed_at: bool
    price: bool


class VisibilityFieldDefaultsPatch(BaseModel):
    title: bool | None = None
    description: bool | None = None
    labels: bool | None = None
    rating: bool | None = None
    characters: bool | None = None
    artists: bool | None = None
    completed_at: bool | None = None
    confirmed_at: bool | None = None
    price: bool | None = None


class VisibilityStageDefaultIn(BaseModel):
    stage_name: str
    visibility: Visibility
    position: int = 0
    note: str | None = None


class VisibilityStageDefaultOut(VisibilityStageDefaultIn):
    id: int


class VisibilitySettingsOut(BaseModel):
    preset: VisibilityPreset
    default_commission_visibility: Visibility
    default_stage_visibility: Visibility
    fields: VisibilityFieldDefaults
    stage_defaults: list[VisibilityStageDefaultOut]
    updated_at: datetime | None = None


class VisibilitySettingsUpdate(BaseModel):
    preset: VisibilityPreset | None = None
    default_commission_visibility: Visibility | None = None
    default_stage_visibility: Visibility | None = None
    fields: VisibilityFieldDefaultsPatch | None = None
    stage_defaults: list[VisibilityStageDefaultIn] | None = None


class SiteSettingsOut(BaseModel):
    site_title: str
    updated_at: datetime | None = None


class SiteSettingsUpdate(BaseModel):
    site_title: str | None = Field(default=None, max_length=120)

    @field_validator("site_title")
    @classmethod
    def site_title_must_not_be_empty(cls, title: str | None) -> str | None:
        if title is None:
            return None
        title = title.strip()
        if not title:
            raise ValueError("site_title must not be empty")
        return title


class VisibilityFieldState(BaseModel):
    field: str
    public: bool | None = None
    effective_public: bool


class FileVisibilityState(BaseModel):
    id: int
    label: str | None = None
    format: str
    is_image: bool
    visibility: Visibility | None = None
    effective_visibility: Visibility


class NodeVisibilityState(BaseModel):
    id: int
    name: str
    is_detached: bool
    visibility: Visibility | None = None
    effective_visibility: Visibility
    files: list[FileVisibilityState]


class CommissionVisibilityOut(BaseModel):
    commission_id: int
    visibility: Visibility | None = None
    effective_visibility: Visibility
    fields: list[VisibilityFieldState]
    nodes: list[NodeVisibilityState]


class CommissionVisibilityUpdate(BaseModel):
    visibility: Visibility | None = None
    fields: VisibilityFieldDefaultsPatch | None = None
    nodes: dict[int, Visibility | None] | None = None
    files: dict[int, Visibility | None] | None = None


class StorageSettingsOut(BaseModel):
    backend: str
    local_root: str | None = None
    configurable_via: str = "environment"


class WebhookCreate(BaseModel):
    url: str
    events: list[WebhookEvent]
    is_enabled: bool = True

    @field_validator("events")
    @classmethod
    def events_must_not_be_empty(cls, events: list[WebhookEvent]) -> list[WebhookEvent]:
        if not events:
            raise ValueError("at least one webhook event is required")
        return events


class WebhookUpdate(BaseModel):
    url: str | None = None
    events: list[WebhookEvent] | None = None
    is_enabled: bool | None = None

    @field_validator("events")
    @classmethod
    def events_must_not_be_empty(cls, events: list[WebhookEvent] | None) -> list[WebhookEvent] | None:
        if events == []:
            raise ValueError("at least one webhook event is required")
        return events


class WebhookOut(BaseModel):
    id: int
    url: str
    events: list[WebhookEvent]
    is_enabled: bool
    status: str
    created_at: datetime
    updated_at: datetime
    last_delivery_at: datetime | None = None
    last_status_code: int | None = None
    last_error: str | None = None
