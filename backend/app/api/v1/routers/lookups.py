from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.v1.crud import resolve_artist, resolve_character, resolve_label
from app.auth.deps import Principal, require_edit
from app.db import get_db
from app.models import (
    Artist,
    ArtistAlias,
    Character,
    CharacterAlias,
    Label,
    LabelAlias,
    LabelType,
)
from app.schemas import (
    AliasCreate,
    ArtistCreate,
    ArtistOut,
    ArtistUpdate,
    CharacterCreate,
    CharacterOut,
    CharacterUpdate,
    LabelCreate,
    LabelOut,
    LabelUpdate,
)

router = APIRouter(tags=["lookups"])


# ---------------------------------------------------------------- labels


def _typeahead_label_ids(db: Session, q: str) -> set[int]:
    """Return label ids that match `q` on name or alias (case-insensitive substring)."""
    needle = f"%{q.strip().lower()}%"
    rows = db.scalars(
        select(Label.id).where(func.lower(Label.name).like(needle))
    ).all()
    alias_rows = db.scalars(
        select(LabelAlias.label_id).where(LabelAlias.alias_lower.like(needle))
    ).all()
    return set(rows) | set(alias_rows)


@router.get("/labels", response_model=list[LabelOut])
def list_labels(
    type: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
):
    stmt = select(Label).options(selectinload(Label.aliases)).order_by(Label.name)
    if type:
        stmt = stmt.where(Label.type == type)
    if q:
        ids = _typeahead_label_ids(db, q)
        if not ids:
            return []
        stmt = stmt.where(Label.id.in_(ids))
    return list(db.scalars(stmt))


def _label_or_404(db: Session, label_id: int) -> Label:
    row = db.get(Label, label_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label not found")
    return row


@router.post("/labels", response_model=LabelOut, status_code=status.HTTP_201_CREATED)
def create_label(
    body: LabelCreate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    existing = resolve_label(db, body.name)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f'"{body.name}" already exists as a {existing.type.value} '
                f"(id={existing.id})"
            ),
        )
    row = Label(name=body.name, type=body.type)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/labels/{label_id}", response_model=LabelOut)
def update_label(
    label_id: int,
    body: LabelUpdate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    row = _label_or_404(db, label_id)
    if body.type is not None and body.type != row.type:
        # The only reclassification we explicitly forbid is tag -> category, to keep
        # accidental promotion of a free-form tag into the category taxonomy out of
        # reach. Other transitions are allowed.
        if row.type == LabelType.tag and body.type == LabelType.category:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Tags cannot be promoted to categories; create a new category instead.",
            )
        row.type = body.type
    if body.name is not None and body.name != row.name:
        clash = resolve_label(db, body.name)
        if clash is not None and clash.id != row.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f'"{body.name}" already exists (as id={clash.id})',
            )
        row.name = body.name
    db.commit()
    db.refresh(row)
    return row


@router.delete("/labels/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_label(
    label_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    db.delete(_label_or_404(db, label_id))
    db.commit()


def _ensure_alias_free(db: Session, alias: str) -> None:
    """Reject an alias that already resolves to any label (by name or alias)."""
    if resolve_label(db, alias) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'"{alias}" already exists as a label name or alias',
        )


@router.post(
    "/labels/{label_id}/aliases",
    response_model=LabelOut,
    status_code=status.HTTP_201_CREATED,
)
def add_label_alias(
    label_id: int,
    body: AliasCreate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    row = _label_or_404(db, label_id)
    _ensure_alias_free(db, body.alias)
    db.add(LabelAlias(label_id=row.id, alias=body.alias, alias_lower=body.alias.lower()))
    db.commit()
    db.refresh(row)
    return row


@router.delete("/label-aliases/{alias_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_label_alias(
    alias_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    row = db.get(LabelAlias, alias_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alias not found")
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------- characters


def _typeahead_character_ids(db: Session, q: str) -> set[int]:
    needle = f"%{q.strip().lower()}%"
    rows = db.scalars(
        select(Character.id).where(func.lower(Character.name).like(needle))
    ).all()
    alias_rows = db.scalars(
        select(CharacterAlias.character_id).where(CharacterAlias.alias_lower.like(needle))
    ).all()
    return set(rows) | set(alias_rows)


@router.get("/characters", response_model=list[CharacterOut])
def list_characters(q: str | None = None, db: Session = Depends(get_db)):
    stmt = select(Character).options(selectinload(Character.aliases)).order_by(Character.name)
    if q:
        ids = _typeahead_character_ids(db, q)
        if not ids:
            return []
        stmt = stmt.where(Character.id.in_(ids))
    return list(db.scalars(stmt))


def _character_or_404(db: Session, character_id: int) -> Character:
    row = db.get(Character, character_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    return row


@router.post("/characters", response_model=CharacterOut, status_code=status.HTTP_201_CREATED)
def create_character(
    body: CharacterCreate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    existing = resolve_character(db, body.name)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'"{body.name}" already exists (id={existing.id})',
        )
    row = Character(name=body.name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/characters/{character_id}", response_model=CharacterOut)
def update_character(
    character_id: int,
    body: CharacterUpdate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    row = _character_or_404(db, character_id)
    if body.name is not None and body.name != row.name:
        clash = resolve_character(db, body.name)
        if clash is not None and clash.id != row.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f'"{body.name}" already exists (as id={clash.id})',
            )
        row.name = body.name
    db.commit()
    db.refresh(row)
    return row


@router.delete("/characters/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_character(
    character_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    db.delete(_character_or_404(db, character_id))
    db.commit()


@router.post(
    "/characters/{character_id}/aliases",
    response_model=CharacterOut,
    status_code=status.HTTP_201_CREATED,
)
def add_character_alias(
    character_id: int,
    body: AliasCreate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    row = _character_or_404(db, character_id)
    if resolve_character(db, body.alias) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'"{body.alias}" already exists as a character name or alias',
        )
    db.add(CharacterAlias(character_id=row.id, alias=body.alias, alias_lower=body.alias.lower()))
    db.commit()
    db.refresh(row)
    return row


@router.delete("/character-aliases/{alias_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_character_alias(
    alias_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    row = db.get(CharacterAlias, alias_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alias not found")
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------- artists


def _typeahead_artist_ids(db: Session, q: str) -> set[int]:
    needle = f"%{q.strip().lower()}%"
    rows = db.scalars(
        select(Artist.id).where(func.lower(Artist.name).like(needle))
    ).all()
    alias_rows = db.scalars(
        select(ArtistAlias.artist_id).where(ArtistAlias.alias_lower.like(needle))
    ).all()
    return set(rows) | set(alias_rows)


@router.get("/artists", response_model=list[ArtistOut])
def list_artists(q: str | None = None, db: Session = Depends(get_db)):
    stmt = select(Artist).options(selectinload(Artist.aliases)).order_by(Artist.name)
    if q:
        ids = _typeahead_artist_ids(db, q)
        if not ids:
            return []
        stmt = stmt.where(Artist.id.in_(ids))
    return list(db.scalars(stmt))


def _artist_or_404(db: Session, artist_id: int) -> Artist:
    row = db.get(Artist, artist_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    return row


@router.post("/artists", response_model=ArtistOut, status_code=status.HTTP_201_CREATED)
def create_artist(
    body: ArtistCreate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    existing = resolve_artist(db, body.name)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'"{body.name}" already exists (id={existing.id})',
        )
    row = Artist(name=body.name, info_xml=body.info_xml)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/artists/{artist_id}", response_model=ArtistOut)
def update_artist(
    artist_id: int,
    body: ArtistUpdate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    row = _artist_or_404(db, artist_id)
    if body.name is not None and body.name != row.name:
        clash = resolve_artist(db, body.name)
        if clash is not None and clash.id != row.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f'"{body.name}" already exists (as id={clash.id})',
            )
        row.name = body.name
    if "info_xml" in body.model_fields_set:
        row.info_xml = body.info_xml
    db.commit()
    db.refresh(row)
    return row


@router.delete("/artists/{artist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_artist(
    artist_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    db.delete(_artist_or_404(db, artist_id))
    db.commit()


@router.post(
    "/artists/{artist_id}/aliases",
    response_model=ArtistOut,
    status_code=status.HTTP_201_CREATED,
)
def add_artist_alias(
    artist_id: int,
    body: AliasCreate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    row = _artist_or_404(db, artist_id)
    if resolve_artist(db, body.alias) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'"{body.alias}" already exists as an artist name or alias',
        )
    db.add(ArtistAlias(artist_id=row.id, alias=body.alias, alias_lower=body.alias.lower()))
    db.commit()
    db.refresh(row)
    return row


@router.delete("/artist-aliases/{alias_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_artist_alias(
    alias_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    row = db.get(ArtistAlias, alias_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alias not found")
    db.delete(row)
    db.commit()
