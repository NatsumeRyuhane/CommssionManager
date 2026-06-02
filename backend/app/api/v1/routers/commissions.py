from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.v1 import crud
from app.auth.deps import Principal, get_principal, require_edit
from app.db import get_db
from app.models import Commission, Visibility
from app.schemas import (
    CommissionCreate,
    CommissionDetail,
    CommissionListItem,
    CommissionUpdate,
    CommissionVisibilityOut,
    CommissionVisibilityUpdate,
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


def _can_view_private(principal: Principal | None) -> bool:
    return principal is not None and principal.can_write


def _assert_commission_visible(
    commission: Commission,
    visibility_context: crud.VisibilityContext,
    principal: Principal | None,
) -> None:
    if (
        crud.effective_commission_visibility(commission, visibility_context) != Visibility.public
        and not _can_view_private(principal)
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Commission not found")


@router.get("", response_model=list[CommissionListItem])
def list_commissions(
    response: Response,
    db: Session = Depends(get_db),
    principal: Principal | None = Depends(get_principal),
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
    limit: int = Query(default=60, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    items = _load_all(db)
    visibility_context = crud.load_visibility_context(db)
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
    if not _can_view_private(principal):
        filtered = [
            c
            for c in filtered
            if crud.effective_commission_visibility(c, visibility_context) == Visibility.public
        ]

    def sort_key(c: Commission):
        meta = c.meta
        if sort == "title":
            return (meta.title or "").lower() if meta else ""
        return (meta.completed_at or date.min) if meta else date.min

    filtered.sort(key=sort_key, reverse=(order == "desc"))
    response.headers["X-Total-Count"] = str(len(filtered))
    page = filtered[offset : offset + limit]
    return [
        crud.serialize_list_item(c, visibility_context, include_private=_can_view_private(principal))
        for c in page
    ]


@router.post("", response_model=CommissionDetail, status_code=status.HTTP_201_CREATED)
def create_commission(
    body: CommissionCreate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    commission = crud.create_commission(db, body)
    return crud.serialize_detail(
        commission, crud.load_visibility_context(db), include_private=True
    )


@router.get("/{commission_id}", response_model=CommissionDetail)
def get_commission(
    commission_id: int,
    db: Session = Depends(get_db),
    principal: Principal | None = Depends(get_principal),
):
    commission = _get_one(db, commission_id)
    visibility_context = crud.load_visibility_context(db)
    _assert_commission_visible(commission, visibility_context, principal)
    return crud.serialize_detail(
        commission, visibility_context, include_private=_can_view_private(principal)
    )


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
    return crud.serialize_detail(
        crud.update_commission(db, commission, body),
        crud.load_visibility_context(db),
        include_private=True,
    )


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
def copy_json(
    commission_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    """Agent-friendly payload: internal id + endpoint URLs, never API credentials."""
    return crud.serialize_copy_json(_get_one(db, commission_id))


@router.get("/{commission_id}/files", response_model=list[FileOut])
def commission_files(
    commission_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    commission = _get_one(db, commission_id)
    cover_id = commission.meta.cover_file_id if commission.meta else None
    visibility_context = crud.load_visibility_context(db)
    return [
        crud.file_out(f, cover_id, visibility_context)
        for n in commission.nodes
        for f in n.files
    ]


@router.get("/{commission_id}/images", response_model=list[FileOut])
def commission_images(
    commission_id: int,
    visibility: Visibility = Visibility.public,
    db: Session = Depends(get_db),
    principal: Principal | None = Depends(get_principal),
):
    if visibility != Visibility.public and (principal is None or not principal.can_write):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Private images require admin login or a write-scoped API key.",
        )
    commission = _get_one(db, commission_id)
    cover_id = commission.meta.cover_file_id if commission.meta else None
    visibility_context = crud.load_visibility_context(db)
    if visibility == Visibility.public:
        _assert_commission_visible(commission, visibility_context, principal)
    out = []
    for n in crud.ordered_nodes(commission):
        for f in n.files:
            if f.is_image and crud.effective_file_visibility(f, visibility_context) == visibility:
                out.append(crud.file_out(f, cover_id, visibility_context))
    return out


@router.get("/{commission_id}/visibility", response_model=CommissionVisibilityOut)
def get_commission_visibility(
    commission_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    commission = _get_one(db, commission_id)
    return crud.serialize_commission_visibility(
        commission, crud.load_visibility_context(db)
    )


@router.patch("/{commission_id}/visibility", response_model=CommissionVisibilityOut)
def update_commission_visibility(
    commission_id: int,
    body: CommissionVisibilityUpdate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    commission = _get_one(db, commission_id)
    if "visibility" in body.model_fields_set and commission.meta is not None:
        commission.meta.visibility_override = body.visibility
    if body.fields is not None and commission.meta is not None:
        for field, value in body.fields.model_dump(exclude_unset=True).items():
            setattr(commission.meta, crud.FIELD_OVERRIDE_ATTRS[field], value)

    nodes_by_id = {node.id: node for node in commission.nodes}
    files_by_id = {
        file.id: file for node in commission.nodes for file in node.files
    }
    if body.nodes is not None:
        missing = set(body.nodes) - set(nodes_by_id)
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="nodes contains ids outside this commission",
            )
        for node_id, visibility in body.nodes.items():
            nodes_by_id[node_id].visibility_override = visibility
    if body.files is not None:
        missing = set(body.files) - set(files_by_id)
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="files contains ids outside this commission",
            )
        for file_id, visibility in body.files.items():
            files_by_id[file_id].visibility_override = visibility

    db.commit()
    commission = _get_one(db, commission_id)
    return crud.serialize_commission_visibility(
        commission, crud.load_visibility_context(db)
    )
