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


def _typeahead_needle(q: str) -> str | None:
    q_str = q.strip().lower()
    if not q_str:
        return None
    escaped_q_str = (
        q_str.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    )
    return f"%{escaped_q_str}%"


def _typeahead_label_ids(db: Session, q: str) -> set[int]:
    """
    Find label IDs whose name or aliases contain the given query as a case-insensitive substring.
    
    Parameters:
        q (str): Substring to match against label names and alias entries; leading/trailing whitespace is ignored and matching is case-insensitive.
    
    Returns:
        set[int]: Set of matching label IDs.
    """
    needle = _typeahead_needle(q)
    if needle is None:
        return set()
    rows = db.scalars(
        select(Label.id).where(func.lower(Label.name).like(needle, escape="\\"))
    ).all()
    alias_rows = db.scalars(
        select(LabelAlias.label_id).where(LabelAlias.alias_lower.like(needle, escape="\\"))
    ).all()
    return set(rows) | set(alias_rows)


@router.get("/labels", response_model=list[LabelOut])
def list_labels(
    type: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
):
    """
    List labels, optionally filtered by label type or a typeahead query.
    
    Parameters:
        type (str | None): If provided, restrict results to labels whose `type` equals this value.
        q (str | None): If provided, restrict results to labels whose name or any alias contains this substring (case-insensitive).
    
    Returns:
        list: Label ORM objects matching the filters, ordered by `Label.name`.
    """
    stmt = select(Label).options(selectinload(Label.aliases)).order_by(Label.name)
    if type:
        stmt = stmt.where(Label.type == type)
    if q is not None:
        ids = _typeahead_label_ids(db, q)
        if not ids:
            return []
        stmt = stmt.where(Label.id.in_(ids))
    return list(db.scalars(stmt))


def _label_or_404(db: Session, label_id: int) -> Label:
    """
    Fetches a Label by its primary key or raises a 404 error if not found.
    
    Returns:
        The `Label` instance with the given `label_id`.
    
    Raises:
        HTTPException: with status 404 and detail "Label not found" when no matching label exists.
    """
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
    """
    Create a new label with the provided name and type.
    
    Parameters:
        body (LabelCreate): Payload containing `name` and `type` for the new label.
    
    Returns:
        Label: The created label row after being persisted and refreshed.
    
    Raises:
        HTTPException: 409 Conflict if a label or alias with the given name already exists.
    """
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
    """
    Update an existing label's name and/or type.
    
    Parameters:
    	label_id (int): ID of the label to update.
    	body (LabelUpdate): Fields to change. If `type` is provided, the label's type will be updated except that changing from `tag` to `category` is forbidden. If `name` is provided, it will be updated unless another label with that name already exists.
    
    Returns:
    	Label: The updated label row after commit and refresh.
    
    Raises:
    	HTTPException(404): If the label with `label_id` does not exist.
    	HTTPException(400): If attempting to change a label from `tag` to `category`.
    	HTTPException(409): If the new name conflicts with an existing label.
    """
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
    """
    Delete the label with the given id.
    
    Raises:
        HTTPException: 404 if no label with the provided id exists.
    """
    db.delete(_label_or_404(db, label_id))
    db.commit()


def _ensure_alias_free(db: Session, alias: str) -> None:
    """
    Ensure the provided alias does not conflict with any existing label name or alias.
    
    Raises:
        HTTPException: with status 409 and a detail message indicating the alias already exists as a label name or alias when a conflict is found.
    """
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
    """
    Add an alias to the specified label and return the updated label.
    
    Parameters:
        label_id (int): Primary key of the label to which the alias will be added.
        body (AliasCreate): Payload containing the alias string to add; the alias is stored alongside a lowercase form for searching.
    
    Returns:
        Label: The label row refreshed from the database, including the newly added alias.
    """
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
    """
    Delete a label alias by its primary key.
    
    Parameters:
        alias_id (int): ID of the label alias to remove.
    
    Raises:
        HTTPException: 404 if no alias with the given `alias_id` exists.
    """
    row = db.get(LabelAlias, alias_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alias not found")
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------- characters


def _typeahead_character_ids(db: Session, q: str) -> set[int]:
    """
    Compute character IDs whose primary name or any alias contains the given query as a case-insensitive substring.
    
    Parameters:
        q (str): Search substring; leading and trailing whitespace are ignored and matching is case-insensitive.
    
    Returns:
        set[int]: Set of Character IDs that match the query in either their name or any alias.
    """
    needle = _typeahead_needle(q)
    if needle is None:
        return set()
    rows = db.scalars(
        select(Character.id).where(func.lower(Character.name).like(needle, escape="\\"))
    ).all()
    alias_rows = db.scalars(
        select(CharacterAlias.character_id).where(
            CharacterAlias.alias_lower.like(needle, escape="\\")
        )
    ).all()
    return set(rows) | set(alias_rows)


@router.get("/characters", response_model=list[CharacterOut])
def list_characters(q: str | None = None, db: Session = Depends(get_db)):
    """
    List characters, optionally filtered by a case-insensitive typeahead query.
    
    When `q` is provided, performs a case-insensitive substring match against character names and stored lowercase aliases; if no matches are found, an empty list is returned. Results are ordered by character name.
    
    Parameters:
    	q (str | None): Optional typeahead query string used to filter characters by name or alias.
    
    Returns:
    	List[Character]: Characters matching the optional query, ordered by name.
    """
    stmt = (
        select(Character)
        .options(selectinload(Character.aliases), selectinload(Character.page))
        .order_by(Character.name)
    )
    if q is not None:
        ids = _typeahead_character_ids(db, q)
        if not ids:
            return []
        stmt = stmt.where(Character.id.in_(ids))
    return list(db.scalars(stmt))


def _character_or_404(db: Session, character_id: int) -> Character:
    """
    Fetches a Character by primary key or raises a 404 HTTPException if not found.
    
    Parameters:
        character_id (int): The Character primary key.
    
    Returns:
        Character: The Character row for the given id.
    
    Raises:
        HTTPException: with status 404 and detail "Character not found" when no matching row exists.
    """
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
    """
    Create a new Character with the provided name.
    
    Parameters:
        body (CharacterCreate): Payload containing the character's name.
    
    Returns:
        Character: The newly created character row.
    
    Raises:
        HTTPException: 409 if a character with the given name already exists.
    """
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
    """
    Update the name of an existing character and return the updated character.
    
    Parameters:
        character_id (int): ID of the character to update.
        body (CharacterUpdate): Update payload; if `name` is provided and different, the character's name will be changed.
    
    Returns:
        Character: The updated character row.
    
    Raises:
        HTTPException(404): If no character exists for `character_id`.
        HTTPException(409): If the provided `name` already exists for a different character.
    """
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
    """
    Delete the character with the given ID.
    
    Raises:
        HTTPException: 404 if the character does not exist.
    """
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
    """
    Add a new alias to an existing character and return the updated character.
    
    Parameters:
        character_id (int): ID of the character to add an alias to.
        body (AliasCreate): Alias payload; `body.alias` is the alias string.
        db (Session): Database session.
    
    Returns:
        Character: The refreshed character row including its aliases.
    
    Raises:
        HTTPException: 404 if the character does not exist.
        HTTPException: 409 if the provided alias already exists as a character name or alias.
    """
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
    """
    Delete a character alias by its primary key.
    
    Parameters:
        alias_id (int): Primary key of the alias to delete.
    
    Raises:
        HTTPException: 404 if the alias does not exist.
    """
    row = db.get(CharacterAlias, alias_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alias not found")
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------- artists


def _typeahead_artist_ids(db: Session, q: str) -> set[int]:
    """
    Compute artist IDs whose name or aliases contain the given query substring (case-insensitive).
    
    Parameters:
        q (str): Query string; trimmed and lowercased for substring matching against artist names and aliases.
    
    Returns:
        set[int]: Set of matching Artist IDs from names or alias entries.
    """
    needle = _typeahead_needle(q)
    if needle is None:
        return set()
    rows = db.scalars(
        select(Artist.id).where(func.lower(Artist.name).like(needle, escape="\\"))
    ).all()
    alias_rows = db.scalars(
        select(ArtistAlias.artist_id).where(ArtistAlias.alias_lower.like(needle, escape="\\"))
    ).all()
    return set(rows) | set(alias_rows)


@router.get("/artists", response_model=list[ArtistOut])
def list_artists(q: str | None = None, db: Session = Depends(get_db)):
    """
    List artists, optionally filtered by a case-insensitive typeahead query against artist names and aliases.
    
    Parameters:
        q (str | None): Optional typeahead substring; when provided, returns only artists whose primary name or any alias contains this substring (case-insensitive).
    
    Returns:
        list[Artist]: Artists ordered by name. If `q` matches no artists, returns an empty list.
    """
    stmt = select(Artist).options(selectinload(Artist.aliases)).order_by(Artist.name)
    if q is not None:
        ids = _typeahead_artist_ids(db, q)
        if not ids:
            return []
        stmt = stmt.where(Artist.id.in_(ids))
    return list(db.scalars(stmt))


def _artist_or_404(db: Session, artist_id: int) -> Artist:
    """
    Fetches an Artist by its primary key or raises a 404 error if not found.
    
    Returns:
        The Artist instance matching the provided `artist_id`.
    
    Raises:
        HTTPException: with status code 404 when no Artist exists for `artist_id`.
    """
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
    """
    Create a new Artist record with the provided name and optional `info_xml`.
    
    Parameters:
        body (ArtistCreate): DTO containing `name` and optional `info_xml` for the new artist.
    
    Returns:
        Artist: The newly created and refreshed Artist ORM instance.
    
    Raises:
        HTTPException: 409 Conflict if an artist with the given name already exists.
    """
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
    """
    Update an artist's name and/or info XML and return the updated Artist.
    
    If a new `name` is provided and differs from the current one, ensures no other artist already uses that name and raises an HTTPException with status 409 on conflict. If `"info_xml"` is present in `body.model_fields_set`, updates the artist's `info_xml` value.
    
    Returns:
        The updated `Artist` model instance.
    
    Raises:
        HTTPException: Status 409 if the requested name already exists for a different artist.
    """
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
    """
    Delete an artist by its identifier.
    
    Parameters:
        artist_id (int): ID of the artist to delete.
    
    Raises:
        HTTPException: 404 if the artist does not exist.
    """
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
    """
    Add a new alias to an existing artist.
    
    Parameters:
        artist_id (int): ID of the artist to attach the alias to.
        body (AliasCreate): Payload containing the `alias` string to add.
    
    Returns:
        Artist: The updated artist row with aliases refreshed.
    
    Raises:
        HTTPException: 404 if the artist does not exist.
        HTTPException: 409 if the provided alias already exists as an artist name or alias.
    """
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
    """
    Delete the artist alias with the given identifier.
    
    Parameters:
        alias_id (int): Primary key of the ArtistAlias to remove.
    
    Raises:
        HTTPException: 404 if no alias exists with the provided `alias_id`.
    """
    row = db.get(ArtistAlias, alias_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alias not found")
    db.delete(row)
    db.commit()
