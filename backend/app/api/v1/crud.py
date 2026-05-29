from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Artist,
    Character,
    Commission,
    CommissionMetadata,
    CommissionNode,
    Label,
    LabelType,
)
from app.schemas import (
    CommissionCreate,
    CommissionDetail,
    CommissionListItem,
    CommissionUpdate,
    CopyJsonOut,
    CoverOut,
    FileOut,
    NodeOut,
)


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
    )

    # one system-managed detached node, auto-created and never reordered
    commission.nodes.append(CommissionNode(name="Detached", position=None, is_detached=True))
    for i, node_name in enumerate(data.node_names):
        commission.nodes.append(
            CommissionNode(name=node_name, position=i, started_at=datetime.now(timezone.utc))
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


def categories_of(commission: Commission) -> list[str]:
    return [la.name for la in commission.labels if la.type == LabelType.category]


def tags_of(commission: Commission) -> list[str]:
    return [la.name for la in commission.labels if la.type == LabelType.tag]


def formats_of(commission: Commission) -> list[str]:
    seen: list[str] = []
    for node in commission.nodes:
        for f in node.files:
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


def _cover(commission: Commission) -> CoverOut | None:
    meta = commission.meta
    cover_file = None
    if meta and meta.cover_file_id:
        cover_file = next(
            (f for n in commission.nodes for f in n.files if f.id == meta.cover_file_id), None
        )
    if cover_file is None:
        cover_file = next(
            (f for n in ordered_nodes(commission) for f in n.files if f.is_image), None
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


def serialize_list_item(commission: Commission) -> CommissionListItem:
    meta = commission.meta
    return CommissionListItem(
        id=commission.id,
        title=meta.title if meta else f"#{commission.id}",
        rating=meta.rating if meta else None,
        completed_at=meta.completed_at if meta else None,
        categories=categories_of(commission),
        tags=tags_of(commission),
        characters=[c.name for c in commission.characters],
        artists=[a.name for a in commission.artists],
        formats=formats_of(commission),
        current_stage=_current_stage(commission),
        cover=_cover(commission),
    )


def file_out(f, cover_file_id: int | None) -> FileOut:
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
        url=_file_url(f.id),
        is_cover=(f.id == cover_file_id),
    )


def serialize_detail(commission: Commission) -> CommissionDetail:
    base = serialize_list_item(commission).model_dump()
    meta = commission.meta
    cover_file_id = meta.cover_file_id if meta else None

    nodes: list[NodeOut] = []
    # detached pinned first (anomalies surface first), then regular stages by position
    detached = [n for n in commission.nodes if n.is_detached]
    for n in detached + ordered_nodes(commission):
        nodes.append(
            NodeOut(
                id=n.id,
                name=n.name,
                position=n.position,
                started_at=n.started_at,
                is_detached=n.is_detached,
                files=[file_out(f, cover_file_id) for f in n.files],
            )
        )

    return CommissionDetail(
        **base,
        description=meta.description if meta else None,
        confirmed_at=meta.confirmed_at if meta else None,
        price_amount=meta.price_amount if meta else None,
        price_currency=meta.price_currency if meta else None,
        nodes=nodes,
        created_at=commission.created_at,
        updated_at=commission.updated_at,
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
