"""Character page (profile + curated image sets) endpoints."""
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
    Visibility,
)
from app.schemas import (
    CharacterPageImage,
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


def _image_file_or_400(db: Session, file_id: int) -> CommissionFile:
    file = db.get(CommissionFile, file_id)
    if file is None or not file.is_image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"file_id={file_id} is not an image file",
        )
    return file


def _file_is_visible(file: CommissionFile, context: crud.VisibilityContext) -> bool:
    commission = file.node.commission
    return (
        crud.effective_commission_visibility(commission, context) == Visibility.public
        and crud.effective_file_visibility(file, context) == Visibility.public
    )


def _image_payload(file: CommissionFile) -> CharacterPageImage:
    commission = file.node.commission
    meta = commission.meta
    return CharacterPageImage(
        id=file.id,
        url=f"/api/v1/files/{file.id}/raw",
        width=file.width,
        height=file.height,
        focal_x=file.focal_x,
        focal_y=file.focal_y,
        commission_id=commission.id,
        commission_title=meta.title if meta else f"#{commission.id}",
        label=file.label,
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
    if page.main_reference is not None and (
        not public_only or _file_is_visible(page.main_reference, context)
    ):
        main_ref = _image_payload(page.main_reference)

    sets: list[CharacterPageSetOut] = []
    for s in page.sets:
        items: list[CharacterPageSetItemOut] = []
        for item in s.items:
            if public_only and not _file_is_visible(item.file, context):
                continue
            items.append(
                CharacterPageSetItemOut(
                    id=item.id, position=item.position, file=_image_payload(item.file)
                )
            )
        # Skip empty sets on the public view — nothing useful to render.
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


def _load_page(db: Session, character_id: int) -> CharacterPage | None:
    return db.scalar(
        select(CharacterPage)
        .where(CharacterPage.character_id == character_id)
        .options(
            selectinload(CharacterPage.main_reference)
            .selectinload(CommissionFile.node)
            .selectinload(CommissionNode.commission)
            .selectinload(Commission.meta),
            selectinload(CharacterPage.sets)
            .selectinload(CharacterImageSet.items)
            .selectinload(CharacterImageSetItem.file)
            .selectinload(CommissionFile.node)
            .selectinload(CommissionNode.commission)
            .selectinload(Commission.meta),
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
                selectinload(CharacterPage.main_reference)
                .selectinload(CommissionFile.node)
                .selectinload(CommissionNode.commission)
                .selectinload(Commission.meta),
                selectinload(CharacterPage.sets)
                .selectinload(CharacterImageSet.items)
                .selectinload(CharacterImageSetItem.file)
                .selectinload(CommissionFile.node)
                .selectinload(CommissionNode.commission),
            )
            .order_by(CharacterPage.id)
        )
    )

    items: list[CharacterPageListItem] = []
    for page in pages:
        main_ref = None
        if page.main_reference is not None and (
            not public_only or _file_is_visible(page.main_reference, context)
        ):
            main_ref = _image_payload(page.main_reference)
        image_count = 0
        for s in page.sets:
            for it in s.items:
                if public_only and not _file_is_visible(it.file, context):
                    continue
                image_count += 1
        items.append(
            CharacterPageListItem(
                character_id=page.character_id,
                character_name=page.character.name,
                set_count=len(page.sets),
                image_count=image_count,
                commission_count=_commission_count(db, page.character_id),
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
    if "main_reference_file_id" in body.model_fields_set:
        if body.main_reference_file_id is None:
            page.main_reference_file_id = None
        else:
            _image_file_or_400(db, body.main_reference_file_id)
            page.main_reference_file_id = body.main_reference_file_id

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


# ---------------------------------------------------------------- eligible images
@router.get(
    "/characters/{character_id}/page/eligible-images",
    response_model=list[CharacterPageImage],
)
def list_eligible_images(
    character_id: int,
    only_tagged: bool = True,
    exclude_set_id: int | None = None,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    """List image files an admin can curate into the character's sets.

    By default returns images from commissions tagged with this character; set
    `only_tagged=false` to consider every image in the database. When
    `exclude_set_id` is provided, files already in that set are filtered out so
    the picker can show only "not in this set" candidates.
    """
    _character_or_404(db, character_id)

    stmt = (
        select(CommissionFile)
        .join(CommissionNode, CommissionFile.node_id == CommissionNode.id)
        .join(Commission, CommissionNode.commission_id == Commission.id)
        .join(CommissionMetadata, CommissionMetadata.commission_id == Commission.id)
        .where(CommissionFile.is_image.is_(True))
        .options(
            selectinload(CommissionFile.node)
            .selectinload(CommissionNode.commission)
            .selectinload(Commission.meta),
        )
        .order_by(CommissionFile.created_at.desc())
    )
    if only_tagged:
        stmt = stmt.join(
            CommissionCharacter, CommissionCharacter.commission_id == Commission.id
        ).where(CommissionCharacter.character_id == character_id)
    if exclude_set_id is not None:
        excluded_subq = select(CharacterImageSetItem.file_id).where(
            CharacterImageSetItem.set_id == exclude_set_id
        )
        stmt = stmt.where(CommissionFile.id.notin_(excluded_subq))

    files = list(db.scalars(stmt))
    return [_image_payload(f) for f in files]


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
    return CharacterPageSetOut(
        id=row.id,
        title=row.title,
        description=row.description,
        position=row.position,
        items=[],
    )


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
    items = [
        CharacterPageSetItemOut(id=it.id, position=it.position, file=_image_payload(it.file))
        for it in sorted(row.items, key=lambda it: it.position)
    ]
    return CharacterPageSetOut(
        id=row.id,
        title=row.title,
        description=row.description,
        position=row.position,
        items=items,
    )


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
    # Two-phase update to avoid colliding with the (page_id, position) unique constraint.
    offset = len(body.set_ids) + 1000
    for i, set_id in enumerate(body.set_ids):
        sets_by_id[set_id].position = offset + i
    db.flush()
    for i, set_id in enumerate(body.set_ids):
        sets_by_id[set_id].position = i
    db.commit()
    return [
        CharacterPageSetOut(
            id=s.id,
            title=s.title,
            description=s.description,
            position=s.position,
            items=[
                CharacterPageSetItemOut(
                    id=it.id, position=it.position, file=_image_payload(it.file)
                )
                for it in sorted(s.items, key=lambda it: it.position)
            ],
        )
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
    existing_file_ids = {it.file_id for it in row.items}
    next_pos = _next_item_position(db, set_id=set_id)
    for file_id in body.file_ids:
        if file_id in existing_file_ids:
            continue
        _image_file_or_400(db, file_id)
        db.add(
            CharacterImageSetItem(
                set_id=set_id, file_id=file_id, position=next_pos
            )
        )
        existing_file_ids.add(file_id)
        next_pos += 1
    db.commit()
    db.refresh(row)
    items = [
        CharacterPageSetItemOut(id=it.id, position=it.position, file=_image_payload(it.file))
        for it in sorted(row.items, key=lambda it: it.position)
    ]
    return CharacterPageSetOut(
        id=row.id,
        title=row.title,
        description=row.description,
        position=row.position,
        items=items,
    )


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
    items = [
        CharacterPageSetItemOut(id=it.id, position=it.position, file=_image_payload(it.file))
        for it in sorted(row.items, key=lambda it: it.position)
    ]
    return CharacterPageSetOut(
        id=row.id,
        title=row.title,
        description=row.description,
        position=row.position,
        items=items,
    )
