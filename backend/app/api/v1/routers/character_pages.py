"""Character page (profile + curated commission showcases) endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.v1 import crud
from app.auth.deps import Principal, get_principal, require_edit
from app.db import get_db
from app.models import (
    Character,
    CharacterImageSet,
    CharacterImageSetItem,
    CharacterPage,
    Commission,
    CommissionCharacter,
    CommissionFile,
    CommissionMetadata,
    CommissionNode,
)
from app.schemas import (
    CharacterPageCommission,
    CharacterPageListItem,
    CharacterPageOut,
    CharacterPageSetCreate,
    CharacterPageSetItemOut,
    CharacterPageSetItemsAdd,
    CharacterPageSetItemsReorder,
    CharacterPageSetOut,
    CharacterPageSetReorder,
    CharacterPageSetUpdate,
    CharacterPageUpdate,
)

router = APIRouter(tags=["character-pages"])


# ---------------------------------------------------------------- helpers
def _character_or_404(db: Session, character_id: int) -> Character:
    row = db.get(Character, character_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    return row


def _page_or_404(db: Session, character_id: int) -> CharacterPage:
    page = db.scalar(
        select(CharacterPage).where(CharacterPage.character_id == character_id)
    )
    if page is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character page not found")
    return page


def _set_or_404(db: Session, set_id: int) -> CharacterImageSet:
    row = db.get(CharacterImageSet, set_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Set not found")
    return row


def _item_or_404(db: Session, item_id: int) -> CharacterImageSetItem:
    row = db.get(CharacterImageSetItem, item_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return row


def _commission_or_400(db: Session, commission_id: int) -> Commission:
    row = db.get(Commission, commission_id)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"commission_id={commission_id} not found",
        )
    return row


def _commission_payload(
    commission: Commission,
    context: crud.VisibilityContext,
    public_only: bool,
) -> CharacterPageCommission | None:
    """Serialize a commission as it should appear on a character page.

    Returns None when the caller is public-only and the commission has no
    visible cover image, so the frontend can drop empty tiles.
    """
    if public_only:
        if (
            crud.effective_commission_visibility(commission, context)
            != crud.Visibility.public
        ):
            return None
    cover = crud._cover(
        commission, visibility_context=context, include_private=not public_only
    )
    if public_only and cover is None:
        return None
    meta = commission.meta
    title = (meta.title if meta else None) or f"#{commission.id}"
    return CharacterPageCommission(
        commission_id=commission.id,
        title=title,
        cover=cover,
        completed_at=meta.completed_at if meta else None,
    )


def _serialize_page(
    page: CharacterPage,
    *,
    character: Character,
    commission_count: int,
    context: crud.VisibilityContext,
    public_only: bool,
) -> CharacterPageOut:
    main_ref = None
    if page.main_reference is not None:
        main_ref = _commission_payload(page.main_reference, context, public_only)

    sets: list[CharacterPageSetOut] = []
    for s in sorted(page.sets, key=lambda x: x.position):
        items: list[CharacterPageSetItemOut] = []
        for item in sorted(s.items, key=lambda i: i.position):
            payload = _commission_payload(item.commission, context, public_only)
            if payload is None:
                continue
            items.append(
                CharacterPageSetItemOut(id=item.id, position=item.position, commission=payload)
            )
        if public_only and not items:
            continue
        sets.append(
            CharacterPageSetOut(
                id=s.id,
                title=s.title,
                description=s.description,
                position=s.position,
                items=items,
            )
        )

    return CharacterPageOut(
        character_id=character.id,
        character_name=character.name,
        about=page.about,
        main_reference=main_ref,
        sets=sets,
        commission_count=commission_count,
        updated_at=page.updated_at,
    )


def _commission_count(db: Session, character_id: int) -> int:
    return int(
        db.scalar(
            select(func.count())
            .select_from(CommissionCharacter)
            .where(CommissionCharacter.character_id == character_id)
        )
        or 0
    )


def _commission_loader_opts() -> tuple:
    """Eager-load everything `_commission_payload` and the cover helper touch."""
    return (
        selectinload(Commission.meta),
        selectinload(Commission.nodes)
        .selectinload(CommissionNode.files)
        .selectinload(CommissionFile.storage_object),
    )


def _load_page(db: Session, character_id: int) -> CharacterPage | None:
    return db.scalar(
        select(CharacterPage)
        .where(CharacterPage.character_id == character_id)
        .options(
            selectinload(CharacterPage.main_reference).options(*_commission_loader_opts()),
            selectinload(CharacterPage.sets)
            .selectinload(CharacterImageSet.items)
            .selectinload(CharacterImageSetItem.commission)
            .options(*_commission_loader_opts()),
        )
    )


# ---------------------------------------------------------------- directory
@router.get("/character-pages", response_model=list[CharacterPageListItem])
def list_character_pages(
    db: Session = Depends(get_db),
    principal: Principal | None = Depends(get_principal),
):
    """Public directory of characters that have published a page."""
    context = crud.load_visibility_context(db)
    public_only = principal is None or not principal.can_write
    pages = list(
        db.scalars(
            select(CharacterPage)
            .options(
                selectinload(CharacterPage.character),
                selectinload(CharacterPage.main_reference).options(*_commission_loader_opts()),
                selectinload(CharacterPage.sets)
                .selectinload(CharacterImageSet.items)
                .selectinload(CharacterImageSetItem.commission)
                .options(*_commission_loader_opts()),
            )
            .order_by(CharacterPage.id)
        )
    )

    items: list[CharacterPageListItem] = []
    for page in pages:
        commission_count_total = _commission_count(db, page.character_id)
        main_ref = (
            _commission_payload(page.main_reference, context, public_only)
            if page.main_reference is not None
            else None
        )
        showcased: set[int] = set()
        for s in page.sets:
            for it in s.items:
                if public_only and _commission_payload(it.commission, context, True) is None:
                    continue
                showcased.add(it.commission_id)
        items.append(
            CharacterPageListItem(
                character_id=page.character_id,
                character_name=page.character.name,
                set_count=len(page.sets),
                commission_count_total=commission_count_total,
                commission_count_in_db=len(showcased),
                main_reference=main_ref,
                updated_at=page.updated_at,
            )
        )
    items.sort(key=lambda it: it.character_name.lower())
    return items


# ---------------------------------------------------------------- page CRUD
@router.get("/characters/{character_id}/page", response_model=CharacterPageOut)
def get_character_page(
    character_id: int,
    db: Session = Depends(get_db),
    principal: Principal | None = Depends(get_principal),
):
    character = _character_or_404(db, character_id)
    page = _load_page(db, character_id)
    if page is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character page not found")
    context = crud.load_visibility_context(db)
    public_only = principal is None or not principal.can_write
    return _serialize_page(
        page,
        character=character,
        commission_count=_commission_count(db, character_id),
        context=context,
        public_only=public_only,
    )


@router.put("/characters/{character_id}/page", response_model=CharacterPageOut)
def upsert_character_page(
    character_id: int,
    body: CharacterPageUpdate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    character = _character_or_404(db, character_id)
    page = db.scalar(select(CharacterPage).where(CharacterPage.character_id == character_id))
    if page is None:
        page = CharacterPage(character_id=character_id)
        db.add(page)
        db.flush()

    if "about" in body.model_fields_set:
        page.about = body.about
    if "main_reference_commission_id" in body.model_fields_set:
        if body.main_reference_commission_id is None:
            page.main_reference_commission_id = None
        else:
            _commission_or_400(db, body.main_reference_commission_id)
            page.main_reference_commission_id = body.main_reference_commission_id

    db.commit()
    page = _load_page(db, character_id)
    return _serialize_page(
        page,
        character=character,
        commission_count=_commission_count(db, character_id),
        context=crud.load_visibility_context(db),
        public_only=False,
    )


@router.delete(
    "/characters/{character_id}/page", status_code=status.HTTP_204_NO_CONTENT
)
def delete_character_page(
    character_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    page = _page_or_404(db, character_id)
    db.delete(page)
    db.commit()


# ---------------------------------------------------------------- eligible commissions
@router.get(
    "/characters/{character_id}/page/eligible-commissions",
    response_model=list[CharacterPageCommission],
)
def list_eligible_commissions(
    character_id: int,
    only_tagged: bool = True,
    exclude_set_id: int | None = None,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    """List commissions an admin can add to the character's sets.

    By default returns commissions tagged with this character; pass
    `only_tagged=false` to consider every commission. `exclude_set_id`
    filters out commissions already in the named set so the picker only
    shows fresh candidates.
    """
    _character_or_404(db, character_id)

    stmt = (
        select(Commission)
        .join(CommissionMetadata, CommissionMetadata.commission_id == Commission.id)
        .options(*_commission_loader_opts())
        .order_by(CommissionMetadata.completed_at.desc().nulls_last(), Commission.id.desc())
    )
    if only_tagged:
        stmt = stmt.join(
            CommissionCharacter, CommissionCharacter.commission_id == Commission.id
        ).where(CommissionCharacter.character_id == character_id)
    if exclude_set_id is not None:
        excluded_subq = select(CharacterImageSetItem.commission_id).where(
            CharacterImageSetItem.set_id == exclude_set_id
        )
        stmt = stmt.where(Commission.id.notin_(excluded_subq))

    context = crud.load_visibility_context(db)
    commissions = list(db.scalars(stmt))
    payloads: list[CharacterPageCommission] = []
    for c in commissions:
        payload = _commission_payload(c, context, public_only=False)
        if payload is not None:
            payloads.append(payload)
    return payloads


# ---------------------------------------------------------------- sets
def _next_position(db: Session, *, page_id: int) -> int:
    current = db.scalar(
        select(func.coalesce(func.max(CharacterImageSet.position), -1)).where(
            CharacterImageSet.page_id == page_id
        )
    )
    return int(current) + 1


def _next_item_position(db: Session, *, set_id: int) -> int:
    current = db.scalar(
        select(func.coalesce(func.max(CharacterImageSetItem.position), -1)).where(
            CharacterImageSetItem.set_id == set_id
        )
    )
    return int(current) + 1


def _set_payload(
    row: CharacterImageSet,
    context: crud.VisibilityContext,
    public_only: bool,
) -> CharacterPageSetOut:
    items: list[CharacterPageSetItemOut] = []
    for it in sorted(row.items, key=lambda i: i.position):
        payload = _commission_payload(it.commission, context, public_only)
        if payload is None:
            continue
        items.append(
            CharacterPageSetItemOut(id=it.id, position=it.position, commission=payload)
        )
    return CharacterPageSetOut(
        id=row.id,
        title=row.title,
        description=row.description,
        position=row.position,
        items=items,
    )


@router.post(
    "/characters/{character_id}/page/sets",
    response_model=CharacterPageSetOut,
    status_code=status.HTTP_201_CREATED,
)
def create_set(
    character_id: int,
    body: CharacterPageSetCreate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    page = _page_or_404(db, character_id)
    row = CharacterImageSet(
        page_id=page.id,
        title=body.title,
        description=body.description,
        position=_next_position(db, page_id=page.id),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _set_payload(row, crud.load_visibility_context(db), public_only=False)


@router.patch("/character-page-sets/{set_id}", response_model=CharacterPageSetOut)
def update_set(
    set_id: int,
    body: CharacterPageSetUpdate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    row = _set_or_404(db, set_id)
    if "title" in body.model_fields_set and body.title is not None:
        row.title = body.title
    if "description" in body.model_fields_set:
        row.description = body.description
    db.commit()
    db.refresh(row)
    return _set_payload(row, crud.load_visibility_context(db), public_only=False)


@router.delete("/character-page-sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_set(
    set_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    row = _set_or_404(db, set_id)
    db.delete(row)
    db.commit()


@router.post(
    "/characters/{character_id}/page/sets/reorder",
    response_model=list[CharacterPageSetOut],
)
def reorder_sets(
    character_id: int,
    body: CharacterPageSetReorder,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    page = _page_or_404(db, character_id)
    sets_by_id = {s.id: s for s in page.sets}
    if set(body.set_ids) != set(sets_by_id.keys()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="set_ids must list every set on this page exactly once",
        )
    offset = len(body.set_ids) + 1000
    for i, set_id in enumerate(body.set_ids):
        sets_by_id[set_id].position = offset + i
    db.flush()
    for i, set_id in enumerate(body.set_ids):
        sets_by_id[set_id].position = i
    db.commit()
    context = crud.load_visibility_context(db)
    return [
        _set_payload(s, context, public_only=False)
        for s in sorted(page.sets, key=lambda s: s.position)
    ]


# ---------------------------------------------------------------- items
@router.post(
    "/character-page-sets/{set_id}/items",
    response_model=CharacterPageSetOut,
    status_code=status.HTTP_201_CREATED,
)
def add_set_items(
    set_id: int,
    body: CharacterPageSetItemsAdd,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    row = _set_or_404(db, set_id)
    existing = {it.commission_id for it in row.items}
    next_pos = _next_item_position(db, set_id=set_id)
    for commission_id in body.commission_ids:
        if commission_id in existing:
            continue
        _commission_or_400(db, commission_id)
        db.add(
            CharacterImageSetItem(
                set_id=set_id, commission_id=commission_id, position=next_pos
            )
        )
        existing.add(commission_id)
        next_pos += 1
    db.commit()
    db.refresh(row)
    return _set_payload(row, crud.load_visibility_context(db), public_only=False)


@router.delete(
    "/character-page-set-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_set_item(
    item_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    row = _item_or_404(db, item_id)
    db.delete(row)
    db.commit()


@router.post(
    "/character-page-sets/{set_id}/items/reorder",
    response_model=CharacterPageSetOut,
)
def reorder_set_items(
    set_id: int,
    body: CharacterPageSetItemsReorder,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    row = _set_or_404(db, set_id)
    items_by_id = {it.id: it for it in row.items}
    if set(body.item_ids) != set(items_by_id.keys()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="item_ids must list every item in this set exactly once",
        )
    offset = len(body.item_ids) + 1000
    for i, item_id in enumerate(body.item_ids):
        items_by_id[item_id].position = offset + i
    db.flush()
    for i, item_id in enumerate(body.item_ids):
        items_by_id[item_id].position = i
    db.commit()
    return _set_payload(row, crud.load_visibility_context(db), public_only=False)
