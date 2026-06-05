from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    AppSettings,
    Artist,
    Character,
    Commission,
    CommissionMetadata,
    CommissionNode,
    Label,
    LabelType,
    Visibility,
    VisibilityPreset,
    VisibilityStageDefault,
)
from app.schemas import (
    CommissionCreate,
    CommissionDetail,
    CommissionListItem,
    CommissionVisibilityOut,
    CommissionUpdate,
    CopyJsonOut,
    CoverOut,
    FileOut,
    FileVisibilityState,
    NodeOut,
    NodeVisibilityState,
    SiteSettingsOut,
    VisibilityFieldDefaults,
    VisibilityFieldState,
    VisibilitySettingsOut,
    VisibilityStageDefaultOut,
)

SETTINGS_ID = 1
DEFAULT_SITE_TITLE = "Commissions"

FIELD_DEFAULTS: dict[str, bool] = {
    "title": True,
    "description": True,
    "labels": True,
    "rating": True,
    "characters": True,
    "artists": True,
    "completed_at": True,
    "confirmed_at": False,
    "price": False,
}

FIELD_SETTING_ATTRS = {field: f"{field}_public" for field in FIELD_DEFAULTS}
FIELD_OVERRIDE_ATTRS = {field: f"{field}_public_override" for field in FIELD_DEFAULTS}

STAGE_DEFAULTS: list[dict[str, object]] = [
    {
        "stage_name": "Delivered",
        "visibility": Visibility.public,
        "position": 0,
        "note": "final deliverables - public by default",
    },
    {
        "stage_name": "Color",
        "visibility": Visibility.private,
        "position": 1,
        "note": "WIP - private by default",
    },
    {
        "stage_name": "Lineart",
        "visibility": Visibility.private,
        "position": 2,
        "note": "WIP - private by default",
    },
    {
        "stage_name": "Sketching",
        "visibility": Visibility.private,
        "position": 3,
        "note": "WIP - private by default",
    },
]


@dataclass(frozen=True)
class VisibilityContext:
    preset: VisibilityPreset
    default_commission_visibility: Visibility
    default_stage_visibility: Visibility
    fields: dict[str, bool]
    stage_defaults: dict[str, Visibility]


# ---------------------------------------------------------------- get-or-create lookups
def get_or_create_label(db: Session, name: str, type_: LabelType) -> Label:
    row = db.scalar(select(Label).where(Label.name == name))
    if row is None:
        row = Label(name=name, type=type_)
        db.add(row)
        db.flush()
    return row


def get_or_create_character(db: Session, name: str) -> Character:
    row = db.scalar(select(Character).where(Character.name == name))
    if row is None:
        row = Character(name=name)
        db.add(row)
        db.flush()
    return row


def get_or_create_artist(db: Session, name: str) -> Artist:
    row = db.scalar(select(Artist).where(Artist.name == name))
    if row is None:
        row = Artist(name=name)
        db.add(row)
        db.flush()
    return row


# ---------------------------------------------------------------- create / update
def create_commission(db: Session, data: CommissionCreate) -> Commission:
    visibility = load_visibility_context(db)
    commission = Commission()
    db.add(commission)
    db.flush()

    commission.meta = CommissionMetadata(
        commission_id=commission.id,
        title=data.title,
        description=data.description,
        completed_at=data.completed_at,
        rating=data.rating,
        confirmed_at=data.confirmed_at,
        price_amount=data.price_amount,
        price_currency=data.price_currency,
        visibility_override=data.visibility_override,
    )

    # one system-managed detached node, auto-created and never reordered
    commission.nodes.append(
        CommissionNode(
            name="Detached",
            position=None,
            is_detached=True,
            visibility_override=Visibility.private,
        )
    )
    for i, node_name in enumerate(data.node_names):
        commission.nodes.append(
            CommissionNode(
                name=node_name,
                position=i,
                started_at=datetime.now(timezone.utc),
                visibility_override=default_stage_visibility(node_name, visibility),
            )
        )

    _apply_labels(db, commission, data.category_names, LabelType.category)
    _apply_labels(db, commission, data.tag_names, LabelType.tag)
    commission.characters = [get_or_create_character(db, n) for n in data.character_names]
    commission.artists = [get_or_create_artist(db, n) for n in data.artist_names]

    db.commit()
    db.refresh(commission)
    return commission


def update_commission(db: Session, commission: Commission, data: CommissionUpdate) -> Commission:
    meta = commission.meta
    for field in (
        "title",
        "description",
        "completed_at",
        "rating",
        "confirmed_at",
        "price_amount",
        "price_currency",
        "cover_file_id",
        "visibility_override",
    ):
        value = getattr(data, field)
        if value is not None:
            setattr(meta, field, value)

    if data.category_names is not None or data.tag_names is not None:
        cats = [
            la
            for la in commission.labels
            if la.type == LabelType.category and data.category_names is None
        ]
        tags = [
            la for la in commission.labels if la.type == LabelType.tag and data.tag_names is None
        ]
        commission.labels = cats + tags
        if data.category_names is not None:
            _apply_labels(db, commission, data.category_names, LabelType.category)
        if data.tag_names is not None:
            _apply_labels(db, commission, data.tag_names, LabelType.tag)

    if data.character_names is not None:
        commission.characters = [get_or_create_character(db, n) for n in data.character_names]
    if data.artist_names is not None:
        commission.artists = [get_or_create_artist(db, n) for n in data.artist_names]

    db.commit()
    db.refresh(commission)
    return commission


def _apply_labels(
    db: Session, commission: Commission, names: list[str], type_: LabelType
) -> None:
    for name in names:
        label = get_or_create_label(db, name, type_)
        if label not in commission.labels:
            commission.labels.append(label)


# ---------------------------------------------------------------- serialization
def _file_url(file_id: int) -> str:
    return f"/api/v1/files/{file_id}/raw"


def default_stage_visibility(stage_name: str, context: VisibilityContext) -> Visibility:
    return context.stage_defaults.get(stage_name.strip().lower(), context.default_stage_visibility)


def load_visibility_context(db: Session) -> VisibilityContext:
    settings = db.get(AppSettings, SETTINGS_ID)
    stage_rows = list(
        db.scalars(select(VisibilityStageDefault).order_by(VisibilityStageDefault.position))
    )
    fields = FIELD_DEFAULTS.copy()
    if settings is not None:
        fields = {
            field: getattr(settings, attr)
            for field, attr in FIELD_SETTING_ATTRS.items()
        }
        preset = settings.visibility_preset
        default_commission = settings.default_commission_visibility
        default_stage = settings.default_stage_visibility
    else:
        preset = VisibilityPreset.public_by_default
        default_commission = Visibility.public
        default_stage = Visibility.private

    stage_defaults = {
        str(row["stage_name"]).lower(): row["visibility"] for row in STAGE_DEFAULTS
    }
    stage_defaults.update({row.stage_name.lower(): row.visibility for row in stage_rows})
    return VisibilityContext(
        preset=preset,
        default_commission_visibility=default_commission,
        default_stage_visibility=default_stage,
        fields=fields,
        stage_defaults=stage_defaults,
    )


def ensure_app_settings(db: Session) -> AppSettings:
    settings = db.get(AppSettings, SETTINGS_ID)
    if settings is None:
        settings = AppSettings(id=SETTINGS_ID, site_title=DEFAULT_SITE_TITLE)
        db.add(settings)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            settings = db.get(AppSettings, SETTINGS_ID)
            if settings is None:
                raise
    return settings


def site_settings_out(settings: AppSettings | None) -> SiteSettingsOut:
    return SiteSettingsOut(
        site_title=settings.site_title if settings is not None else DEFAULT_SITE_TITLE,
        updated_at=settings.updated_at if settings is not None else None,
    )


def ensure_visibility_settings(db: Session) -> tuple[AppSettings, list[VisibilityStageDefault]]:
    settings = ensure_app_settings(db)
    existing = {
        row.stage_name.lower(): row
        for row in db.scalars(select(VisibilityStageDefault))
    }
    for default in STAGE_DEFAULTS:
        key = str(default["stage_name"]).lower()
        if key not in existing:
            row = VisibilityStageDefault(**default)
            db.add(row)
            existing[key] = row
    db.flush()
    stage_defaults = list(
        db.scalars(select(VisibilityStageDefault).order_by(VisibilityStageDefault.position))
    )
    return settings, stage_defaults


def visibility_settings_out(
    settings: AppSettings, stage_defaults: list[VisibilityStageDefault]
) -> VisibilitySettingsOut:
    return VisibilitySettingsOut(
        preset=settings.visibility_preset,
        default_commission_visibility=settings.default_commission_visibility,
        default_stage_visibility=settings.default_stage_visibility,
        fields=VisibilityFieldDefaults(
            **{
                field: getattr(settings, attr)
                for field, attr in FIELD_SETTING_ATTRS.items()
            }
        ),
        stage_defaults=[
            VisibilityStageDefaultOut(
                id=row.id,
                stage_name=row.stage_name,
                visibility=row.visibility,
                position=row.position,
                note=row.note,
            )
            for row in stage_defaults
        ],
        updated_at=settings.updated_at,
    )


def effective_commission_visibility(
    commission: Commission, context: VisibilityContext
) -> Visibility:
    meta = commission.meta
    return (
        meta.visibility_override
        if meta is not None and meta.visibility_override is not None
        else context.default_commission_visibility
    )


def effective_node_visibility(node: CommissionNode, context: VisibilityContext) -> Visibility:
    if node.visibility_override is not None:
        return node.visibility_override
    return default_stage_visibility(node.name, context)


def effective_file_visibility(file, context: VisibilityContext) -> Visibility:
    if file.visibility_override is not None:
        return file.visibility_override
    return effective_node_visibility(file.node, context)


def _effective_field_public(
    commission: Commission, field: str, context: VisibilityContext
) -> bool:
    meta = commission.meta
    override = None
    if meta is not None:
        override = getattr(meta, FIELD_OVERRIDE_ATTRS[field])
    return override if override is not None else context.fields[field]


def categories_of(commission: Commission) -> list[str]:
    return [la.name for la in commission.labels if la.type == LabelType.category]


def tags_of(commission: Commission) -> list[str]:
    return [la.name for la in commission.labels if la.type == LabelType.tag]


def formats_of(
    commission: Commission,
    visibility_context: VisibilityContext | None = None,
    include_private: bool = True,
) -> list[str]:
    seen: list[str] = []
    for node in commission.nodes:
        for f in node.files:
            if (
                not include_private
                and visibility_context is not None
                and effective_file_visibility(f, visibility_context) != Visibility.public
            ):
                continue
            if f.format not in seen:
                seen.append(f.format)
    return seen


def ordered_nodes(commission: Commission) -> list[CommissionNode]:
    regular = sorted(
        (n for n in commission.nodes if not n.is_detached), key=lambda n: n.position or 0
    )
    return regular


def _current_stage(commission: Commission) -> str | None:
    nodes = ordered_nodes(commission)
    with_files = [n for n in nodes if n.files]
    if with_files:
        return with_files[-1].name
    return nodes[-1].name if nodes else None


def _cover(
    commission: Commission,
    visibility_context: VisibilityContext | None = None,
    include_private: bool = True,
) -> CoverOut | None:
    def visible(file) -> bool:
        return (
            include_private
            or visibility_context is None
            or effective_file_visibility(file, visibility_context) == Visibility.public
        )

    meta = commission.meta
    cover_file = None
    if meta and meta.cover_file_id:
        cover_file = next(
            (
                f
                for n in commission.nodes
                for f in n.files
                if f.id == meta.cover_file_id and visible(f)
            ),
            None,
        )
    if cover_file is None:
        cover_file = next(
            (f for n in ordered_nodes(commission) for f in n.files if f.is_image and visible(f)),
            None,
        )
    if cover_file is None:
        return None
    return CoverOut(
        file_id=cover_file.id,
        url=_file_url(cover_file.id),
        width=cover_file.width,
        height=cover_file.height,
        focal_x=cover_file.focal_x,
        focal_y=cover_file.focal_y,
    )


def fallback_visibility_context() -> VisibilityContext:
    return VisibilityContext(
        preset=VisibilityPreset.public_by_default,
        default_commission_visibility=Visibility.public,
        default_stage_visibility=Visibility.private,
        fields=FIELD_DEFAULTS.copy(),
        stage_defaults={
            str(row["stage_name"]).lower(): row["visibility"] for row in STAGE_DEFAULTS
        },
    )


def serialize_list_item(
    commission: Commission,
    visibility_context: VisibilityContext | None = None,
    include_private: bool = True,
) -> CommissionListItem:
    meta = commission.meta
    visibility_context = visibility_context or fallback_visibility_context()
    labels_public = include_private or _effective_field_public(
        commission, "labels", visibility_context
    )
    return CommissionListItem(
        id=commission.id,
        title=(
            meta.title
            if meta and (include_private or _effective_field_public(commission, "title", visibility_context))
            else f"#{commission.id}"
        ),
        rating=(
            meta.rating
            if meta and (include_private or _effective_field_public(commission, "rating", visibility_context))
            else None
        ),
        completed_at=(
            meta.completed_at
            if meta
            and (include_private or _effective_field_public(commission, "completed_at", visibility_context))
            else None
        ),
        visibility=meta.visibility_override if meta else None,
        effective_visibility=effective_commission_visibility(commission, visibility_context),
        categories=categories_of(commission) if labels_public else [],
        tags=tags_of(commission) if labels_public else [],
        characters=(
            [c.name for c in commission.characters]
            if include_private or _effective_field_public(commission, "characters", visibility_context)
            else []
        ),
        artists=(
            [a.name for a in commission.artists]
            if include_private or _effective_field_public(commission, "artists", visibility_context)
            else []
        ),
        formats=formats_of(commission, visibility_context, include_private),
        current_stage=_current_stage(commission),
        cover=_cover(commission, visibility_context, include_private),
    )


def file_out(
    f, cover_file_id: int | None, visibility_context: VisibilityContext | None = None
) -> FileOut:
    return FileOut(
        id=f.id,
        node_id=f.node_id,
        format=f.format,
        label=f.label,
        is_image=f.is_image,
        width=f.width,
        height=f.height,
        focal_x=f.focal_x,
        focal_y=f.focal_y,
        visibility=f.visibility_override,
        effective_visibility=(
            effective_file_visibility(f, visibility_context)
            if visibility_context is not None
            else None
        ),
        url=_file_url(f.id),
        is_cover=(f.id == cover_file_id),
    )


def node_out(
    node: CommissionNode,
    cover_file_id: int | None = None,
    visibility_context: VisibilityContext | None = None,
) -> NodeOut:
    return NodeOut(
        id=node.id,
        name=node.name,
        position=node.position,
        started_at=node.started_at,
        is_detached=node.is_detached,
        visibility=node.visibility_override,
        effective_visibility=(
            effective_node_visibility(node, visibility_context)
            if visibility_context is not None
            else None
        ),
        files=[file_out(f, cover_file_id, visibility_context) for f in node.files],
    )


def serialize_detail(
    commission: Commission,
    visibility_context: VisibilityContext | None = None,
    include_private: bool = True,
) -> CommissionDetail:
    visibility_context = visibility_context or fallback_visibility_context()
    base = serialize_list_item(commission, visibility_context, include_private).model_dump()
    meta = commission.meta
    cover_file_id = meta.cover_file_id if meta else None

    # detached pinned first (anomalies surface first), then regular stages by position
    detached = [n for n in commission.nodes if n.is_detached]
    nodes = [
        node_out(n, cover_file_id, visibility_context)
        for n in detached + ordered_nodes(commission)
    ]

    return CommissionDetail(
        **base,
        description=(
            meta.description
            if meta
            and (include_private or _effective_field_public(commission, "description", visibility_context))
            else None
        ),
        confirmed_at=(
            meta.confirmed_at
            if meta
            and (include_private or _effective_field_public(commission, "confirmed_at", visibility_context))
            else None
        ),
        price_amount=(
            meta.price_amount
            if meta
            and (include_private or _effective_field_public(commission, "price", visibility_context))
            else None
        ),
        price_currency=(
            meta.price_currency
            if meta
            and (include_private or _effective_field_public(commission, "price", visibility_context))
            else None
        ),
        nodes=nodes,
        created_at=commission.created_at,
        updated_at=commission.updated_at,
    )


def serialize_commission_visibility(
    commission: Commission, visibility_context: VisibilityContext
) -> CommissionVisibilityOut:
    meta = commission.meta
    nodes = [n for n in commission.nodes if n.is_detached] + ordered_nodes(commission)
    return CommissionVisibilityOut(
        commission_id=commission.id,
        visibility=meta.visibility_override if meta else None,
        effective_visibility=effective_commission_visibility(commission, visibility_context),
        fields=[
            VisibilityFieldState(
                field=field,
                public=getattr(meta, FIELD_OVERRIDE_ATTRS[field]) if meta else None,
                effective_public=_effective_field_public(commission, field, visibility_context),
            )
            for field in FIELD_DEFAULTS
        ],
        nodes=[
            NodeVisibilityState(
                id=node.id,
                name=node.name,
                is_detached=node.is_detached,
                visibility=node.visibility_override,
                effective_visibility=effective_node_visibility(node, visibility_context),
                files=[
                    FileVisibilityState(
                        id=file.id,
                        label=file.label,
                        format=file.format,
                        is_image=file.is_image,
                        visibility=file.visibility_override,
                        effective_visibility=effective_file_visibility(
                            file, visibility_context
                        ),
                    )
                    for file in node.files
                ],
            )
            for node in nodes
        ],
    )


def serialize_copy_json(commission: Commission) -> CopyJsonOut:
    meta = commission.meta
    cats = categories_of(commission)
    return CopyJsonOut(
        id=commission.id,
        title=meta.title if meta else f"#{commission.id}",
        completed_date=meta.completed_at if meta else None,
        confirmed_at=meta.confirmed_at if meta else None,
        category=cats[0] if cats else None,
        rating=meta.rating if meta else None,
        tags=tags_of(commission),
        characters=[c.name for c in commission.characters],
        artists=[a.name for a in commission.artists],
        current_stage=_current_stage(commission),
        files_endpoint=f"/api/v1/commissions/{commission.id}/files",
        public_images_endpoint=f"/api/v1/commissions/{commission.id}/images?visibility=public",
    )
