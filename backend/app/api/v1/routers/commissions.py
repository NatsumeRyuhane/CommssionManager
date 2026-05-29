from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.v1 import crud
from app.auth.deps import Principal, require_edit
from app.db import get_db
from app.models import Commission
from app.schemas import (
    CommissionCreate,
    CommissionDetail,
    CommissionListItem,
    CommissionUpdate,
    CopyJsonOut,
    FileOut,
)

router = APIRouter(prefix="/commissions", tags=["commissions"])


def _load_all(db: Session) -> list[Commission]:
    stmt = select(Commission).options(
        selectinload(Commission.meta),
        selectinload(Commission.labels),
        selectinload(Commission.characters),
        selectinload(Commission.artists),
        selectinload(Commission.nodes),
    )
    return list(db.scalars(stmt).unique())


def _get_one(db: Session, commission_id: int) -> Commission:
    commission = db.scalar(
        select(Commission)
        .where(Commission.id == commission_id)
        .options(
            selectinload(Commission.meta),
            selectinload(Commission.labels),
            selectinload(Commission.characters),
            selectinload(Commission.artists),
            selectinload(Commission.nodes),
        )
    )
    if commission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Commission not found")
    return commission


@router.get("", response_model=list[CommissionListItem])
def list_commissions(
    db: Session = Depends(get_db),
    q: str | None = None,
    search_in: str = "title,description",
    categories: list[str] = Query(default=[]),
    tags: list[str] = Query(default=[]),
    rating: list[str] = Query(default=[]),
    characters: list[str] = Query(default=[]),
    artists: list[str] = Query(default=[]),
    formats: list[str] = Query(default=[]),
    date_from: date | None = None,
    date_to: date | None = None,
    char_min: int | None = None,
    char_max: int | None = None,
    sort: str = "date",
    order: str = "desc",
):
    items = _load_all(db)
    fields = {s.strip() for s in search_in.split(",") if s.strip()}

    def keep(c: Commission) -> bool:
        meta = c.meta
        if q:
            needle = q.lower()
            haystack = []
            if "title" in fields and meta:
                haystack.append(meta.title or "")
            if "description" in fields and meta:
                haystack.append(meta.description or "")
            if needle not in " \n".join(haystack).lower():
                return False
        cats = crud.categories_of(c)
        tgs = crud.tags_of(c)
        if categories and not set(categories) & set(cats):
            return False
        if tags and not set(tags) & set(tgs):
            return False
        if rating and (not meta or meta.rating.value not in rating):
            return False
        if characters and not set(characters) & {ch.name for ch in c.characters}:
            return False
        if artists and not set(artists) & {a.name for a in c.artists}:
            return False
        if formats and not set(formats) & set(crud.formats_of(c)):
            return False
        if date_from and (not meta or not meta.completed_at or meta.completed_at < date_from):
            return False
        if date_to and (not meta or not meta.completed_at or meta.completed_at > date_to):
            return False
        n_chars = len(c.characters)
        if char_min is not None and n_chars < char_min:
            return False
        if char_max is not None and n_chars > char_max:
            return False
        return True

    filtered = [c for c in items if keep(c)]

    def sort_key(c: Commission):
        meta = c.meta
        if sort == "title":
            return (meta.title or "").lower() if meta else ""
        return (meta.completed_at or date.min) if meta else date.min

    filtered.sort(key=sort_key, reverse=(order == "desc"))
    return [crud.serialize_list_item(c) for c in filtered]


@router.post("", response_model=CommissionDetail, status_code=status.HTTP_201_CREATED)
def create_commission(
    body: CommissionCreate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    commission = crud.create_commission(db, body)
    return crud.serialize_detail(commission)


@router.get("/{commission_id}", response_model=CommissionDetail)
def get_commission(commission_id: int, db: Session = Depends(get_db)):
    return crud.serialize_detail(_get_one(db, commission_id))


@router.patch("/{commission_id}", response_model=CommissionDetail)
def update_commission(
    commission_id: int,
    body: CommissionUpdate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    commission = _get_one(db, commission_id)
    if body.cover_file_id is not None:
        image_file_ids = {f.id for n in commission.nodes for f in n.files if f.is_image}
        if body.cover_file_id not in image_file_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="cover_file_id must reference an image file belonging to this commission",
            )
    return crud.serialize_detail(crud.update_commission(db, commission, body))


@router.delete("/{commission_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_commission(
    commission_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    commission = _get_one(db, commission_id)
    # cover_file_id references a file we're about to cascade-delete; clear it first
    if commission.meta:
        commission.meta.cover_file_id = None
        db.flush()
    db.delete(commission)
    db.commit()


@router.get("/{commission_id}/copy-json", response_model=CopyJsonOut)
def copy_json(commission_id: int, db: Session = Depends(get_db)):
    """Agent-friendly payload: internal id + endpoint URLs, never API credentials."""
    return crud.serialize_copy_json(_get_one(db, commission_id))


@router.get("/{commission_id}/files", response_model=list[FileOut])
def commission_files(commission_id: int, db: Session = Depends(get_db)):
    commission = _get_one(db, commission_id)
    cover_id = commission.meta.cover_file_id if commission.meta else None
    return [crud.file_out(f, cover_id) for n in commission.nodes for f in n.files]


@router.get("/{commission_id}/images", response_model=list[FileOut])
def commission_images(
    commission_id: int,
    visibility: str = "public",  # placeholder; per-file visibility lands in Phase 2
    db: Session = Depends(get_db),
):
    commission = _get_one(db, commission_id)
    cover_id = commission.meta.cover_file_id if commission.meta else None
    # public images in timeline (stage) order, ignoring the detached node
    out = []
    for n in crud.ordered_nodes(commission):
        for f in n.files:
            if f.is_image:
                out.append(crud.file_out(f, cover_id))
    return out
