from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models import LabelType, Rating


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
    url: str
    is_cover: bool = False


class NodeOut(BaseModel):
    id: int
    name: str
    position: int | None = None
    started_at: datetime | None = None
    is_detached: bool
    files: list[FileOut] = []


class NodeCreate(BaseModel):
    name: str


class NodeUpdate(BaseModel):
    name: str


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
    rating: Rating
    completed_at: date | None = None
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
