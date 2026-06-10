from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


# ---------------------------------------------------------------- enums
class LabelType(str, enum.Enum):
    category = "category"
    tag = "tag"
    rating = "rating"


class Rating(str, enum.Enum):
    general = "general"
    mature = "mature"
    adult = "adult"


class StorageBackend(str, enum.Enum):
    local = "local"
    s3 = "s3"
    gcs = "gcs"


class Visibility(str, enum.Enum):
    public = "public"
    private = "private"


class VisibilityPreset(str, enum.Enum):
    public_by_default = "public_by_default"
    private_by_default = "private_by_default"
    custom = "custom"


class WebhookEvent(str, enum.Enum):
    commission_created = "commission.created"
    commission_updated = "commission.updated"
    commission_delivered = "commission.delivered"


# ---------------------------------------------------------------- lookups
class Label(Base):
    __tablename__ = "labels"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    type: Mapped[LabelType] = mapped_column(Enum(LabelType, name="label_type"), nullable=False)
    __table_args__ = (Index("uq_labels_name_lower", func.lower(name), unique=True),)

    aliases: Mapped[list["LabelAlias"]] = relationship(
        back_populates="label", cascade="all, delete-orphan", order_by="LabelAlias.alias_lower"
    )


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    settings_xml: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (Index("uq_characters_name_lower", func.lower(name), unique=True),)

    aliases: Mapped[list["CharacterAlias"]] = relationship(
        back_populates="character",
        cascade="all, delete-orphan",
        order_by="CharacterAlias.alias_lower",
    )
    page: Mapped[CharacterPage | None] = relationship(
        back_populates="character",
        cascade="all, delete-orphan",
        uselist=False,
    )

    @property
    def has_page(self) -> bool:
        return self.page is not None


class Artist(Base):
    __tablename__ = "artists"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    info_xml: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (Index("uq_artists_name_lower", func.lower(name), unique=True),)

    aliases: Mapped[list["ArtistAlias"]] = relationship(
        back_populates="artist", cascade="all, delete-orphan", order_by="ArtistAlias.alias_lower"
    )


# Aliases: case-insensitive secondary names that resolve to the same parent row.
# `alias_lower` is the lowercased form, uniqueness is enforced on that column.
class LabelAlias(Base):
    __tablename__ = "label_aliases"

    id: Mapped[int] = mapped_column(primary_key=True)
    label_id: Mapped[int] = mapped_column(
        ForeignKey("labels.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alias: Mapped[str] = mapped_column(String, nullable=False)
    alias_lower: Mapped[str] = mapped_column(String, nullable=False, unique=True)

    label: Mapped[Label] = relationship(back_populates="aliases")


class CharacterAlias(Base):
    __tablename__ = "character_aliases"

    id: Mapped[int] = mapped_column(primary_key=True)
    character_id: Mapped[int] = mapped_column(
        ForeignKey("characters.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alias: Mapped[str] = mapped_column(String, nullable=False)
    alias_lower: Mapped[str] = mapped_column(String, nullable=False, unique=True)

    character: Mapped[Character] = relationship(back_populates="aliases")


class ArtistAlias(Base):
    __tablename__ = "artist_aliases"

    id: Mapped[int] = mapped_column(primary_key=True)
    artist_id: Mapped[int] = mapped_column(
        ForeignKey("artists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alias: Mapped[str] = mapped_column(String, nullable=False)
    alias_lower: Mapped[str] = mapped_column(String, nullable=False, unique=True)

    artist: Mapped[Artist] = relationship(back_populates="aliases")


# ---------------------------------------------------------------- storage
class StorageObject(Base):
    __tablename__ = "storage_objects"
    __table_args__ = (UniqueConstraint("backend", "bucket", "key", name="uq_storage_locator"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    backend: Mapped[StorageBackend] = mapped_column(
        Enum(StorageBackend, name="storage_backend"), nullable=False
    )
    bucket: Mapped[str | None] = mapped_column(String)
    key: Mapped[str] = mapped_column(String, nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    checksum: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------- settings
class AppSettings(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    site_title: Mapped[str] = mapped_column(
        String(120), nullable=False, default="Commissions"
    )
    visibility_preset: Mapped[VisibilityPreset] = mapped_column(
        Enum(VisibilityPreset, name="visibility_preset"),
        nullable=False,
        default=VisibilityPreset.public_by_default,
    )
    default_commission_visibility: Mapped[Visibility] = mapped_column(
        Enum(Visibility, name="visibility"),
        nullable=False,
        default=Visibility.public,
    )
    default_stage_visibility: Mapped[Visibility] = mapped_column(
        Enum(Visibility, name="visibility"),
        nullable=False,
        default=Visibility.private,
    )
    title_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    description_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    labels_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rating_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    characters_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    artists_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    completed_at_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    confirmed_at_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    price_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class VisibilityStageDefault(Base):
    __tablename__ = "visibility_stage_defaults"

    id: Mapped[int] = mapped_column(primary_key=True)
    stage_name: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    visibility: Mapped[Visibility] = mapped_column(
        Enum(Visibility, name="visibility"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    note: Mapped[str | None] = mapped_column(String)


class WebhookEndpoint(Base):
    __tablename__ = "webhook_endpoints"

    id: Mapped[int] = mapped_column(primary_key=True)
    url: Mapped[str] = mapped_column(String, nullable=False)
    events: Mapped[str] = mapped_column(String, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_status_code: Mapped[int | None] = mapped_column(Integer)
    last_error: Mapped[str | None] = mapped_column(Text)


# ---------------------------------------------------------------- commission
class Commission(Base):
    __tablename__ = "commissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    meta: Mapped[CommissionMetadata] = relationship(
        back_populates="commission", uselist=False, cascade="all, delete-orphan"
    )
    nodes: Mapped[list[CommissionNode]] = relationship(
        back_populates="commission", cascade="all, delete-orphan"
    )
    labels: Mapped[list[Label]] = relationship(secondary="commission_labels")
    characters: Mapped[list[Character]] = relationship(secondary="commission_characters")
    artists: Mapped[list[Artist]] = relationship(secondary="commission_artists")


class CommissionMetadata(Base):
    __tablename__ = "commission_metadata"

    id: Mapped[int] = mapped_column(primary_key=True)
    commission_id: Mapped[int] = mapped_column(
        ForeignKey("commissions.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[date | None] = mapped_column(Date)
    rating: Mapped[Rating] = mapped_column(
        Enum(Rating, name="rating"), nullable=False, default=Rating.general
    )
    cover_file_id: Mapped[int | None] = mapped_column(
        ForeignKey("commission_files.id", use_alter=True, name="fk_meta_cover_file")
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    price_amount: Mapped[float | None] = mapped_column(Numeric(12, 2))
    price_currency: Mapped[str | None] = mapped_column(String(3))
    visibility_override: Mapped[Visibility | None] = mapped_column(
        Enum(Visibility, name="visibility")
    )
    title_public_override: Mapped[bool | None] = mapped_column(Boolean)
    description_public_override: Mapped[bool | None] = mapped_column(Boolean)
    labels_public_override: Mapped[bool | None] = mapped_column(Boolean)
    rating_public_override: Mapped[bool | None] = mapped_column(Boolean)
    characters_public_override: Mapped[bool | None] = mapped_column(Boolean)
    artists_public_override: Mapped[bool | None] = mapped_column(Boolean)
    completed_at_public_override: Mapped[bool | None] = mapped_column(Boolean)
    confirmed_at_public_override: Mapped[bool | None] = mapped_column(Boolean)
    price_public_override: Mapped[bool | None] = mapped_column(Boolean)

    commission: Mapped[Commission] = relationship(back_populates="meta")
    cover_file: Mapped[CommissionFile | None] = relationship(foreign_keys=[cover_file_id])


class CommissionNode(Base):
    __tablename__ = "commission_nodes"
    __table_args__ = (
        UniqueConstraint("commission_id", "position", name="uq_node_position"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    commission_id: Mapped[int] = mapped_column(
        ForeignKey("commissions.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    position: Mapped[int | None] = mapped_column(Integer)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_detached: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    visibility_override: Mapped[Visibility | None] = mapped_column(
        Enum(Visibility, name="visibility")
    )

    commission: Mapped[Commission] = relationship(back_populates="nodes")
    files: Mapped[list[CommissionFile]] = relationship(
        back_populates="node",
        cascade="all, delete-orphan",
        foreign_keys="CommissionFile.node_id",
        order_by="CommissionFile.position",
    )


class CommissionFile(Base):
    __tablename__ = "commission_files"
    __table_args__ = (
        UniqueConstraint("node_id", "position", name="uq_commission_files_node_position"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    node_id: Mapped[int] = mapped_column(
        ForeignKey("commission_nodes.id", ondelete="CASCADE"), nullable=False
    )
    storage_object_id: Mapped[int] = mapped_column(
        ForeignKey("storage_objects.id"), nullable=False
    )
    format: Mapped[str] = mapped_column(String, nullable=False)
    label: Mapped[str | None] = mapped_column(String)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    is_image: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    focal_x: Mapped[float | None] = mapped_column(Float)
    focal_y: Mapped[float | None] = mapped_column(Float)
    focal_zoom: Mapped[float | None] = mapped_column(Float)
    visibility_override: Mapped[Visibility | None] = mapped_column(
        Enum(Visibility, name="visibility")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    node: Mapped[CommissionNode] = relationship(back_populates="files", foreign_keys=[node_id])
    storage_object: Mapped[StorageObject] = relationship()


# ---------------------------------------------------------------- junctions
class CommissionLabel(Base):
    __tablename__ = "commission_labels"

    commission_id: Mapped[int] = mapped_column(
        ForeignKey("commissions.id", ondelete="CASCADE"), primary_key=True
    )
    label_id: Mapped[int] = mapped_column(
        ForeignKey("labels.id", ondelete="CASCADE"), primary_key=True
    )


class CommissionCharacter(Base):
    __tablename__ = "commission_characters"

    commission_id: Mapped[int] = mapped_column(
        ForeignKey("commissions.id", ondelete="CASCADE"), primary_key=True
    )
    character_id: Mapped[int] = mapped_column(
        ForeignKey("characters.id", ondelete="CASCADE"), primary_key=True
    )


class CommissionArtist(Base):
    __tablename__ = "commission_artists"

    commission_id: Mapped[int] = mapped_column(
        ForeignKey("commissions.id", ondelete="CASCADE"), primary_key=True
    )
    artist_id: Mapped[int] = mapped_column(
        ForeignKey("artists.id", ondelete="CASCADE"), primary_key=True
    )


# ---------------------------------------------------------------- character pages
class CharacterPage(Base):
    __tablename__ = "character_pages"

    id: Mapped[int] = mapped_column(primary_key=True)
    character_id: Mapped[int] = mapped_column(
        ForeignKey("characters.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    about: Mapped[str | None] = mapped_column(Text)
    main_reference_commission_id: Mapped[int | None] = mapped_column(
        ForeignKey("commissions.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    character: Mapped[Character] = relationship(back_populates="page")
    main_reference: Mapped[Commission | None] = relationship(
        foreign_keys=[main_reference_commission_id]
    )
    sets: Mapped[list[CharacterImageSet]] = relationship(
        back_populates="page",
        cascade="all, delete-orphan",
        order_by="CharacterImageSet.position",
    )


class CharacterImageSet(Base):
    __tablename__ = "character_image_sets"
    __table_args__ = (
        UniqueConstraint("page_id", "position", name="uq_character_image_sets_position"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    page_id: Mapped[int] = mapped_column(
        ForeignKey("character_pages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    page: Mapped[CharacterPage] = relationship(back_populates="sets")
    items: Mapped[list[CharacterImageSetItem]] = relationship(
        back_populates="image_set",
        cascade="all, delete-orphan",
        order_by="CharacterImageSetItem.position",
    )


class CharacterImageSetItem(Base):
    __tablename__ = "character_image_set_items"
    __table_args__ = (
        UniqueConstraint(
            "set_id", "commission_id", name="uq_character_image_set_items_commission"
        ),
        UniqueConstraint("set_id", "position", name="uq_character_image_set_items_position"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    set_id: Mapped[int] = mapped_column(
        ForeignKey("character_image_sets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    commission_id: Mapped[int] = mapped_column(
        ForeignKey("commissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    image_set: Mapped[CharacterImageSet] = relationship(back_populates="items")
    commission: Mapped[Commission] = relationship()


# ---------------------------------------------------------------- auth
class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    prefix: Mapped[str] = mapped_column(String, nullable=False, index=True)
    key_hash: Mapped[str] = mapped_column(String, nullable=False)
    scopes: Mapped[str] = mapped_column(String, nullable=False, default="read")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
