from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import Principal, require_edit
from app.db import get_db
from app.models import Artist, Character, Label
from app.schemas import ArtistCreate, ArtistOut, ArtistUpdate, CharacterOut, LabelOut

router = APIRouter(tags=["lookups"])


@router.get("/labels", response_model=list[LabelOut])
def list_labels(type: str | None = None, db: Session = Depends(get_db)):
    stmt = select(Label).order_by(Label.name)
    if type:
        stmt = stmt.where(Label.type == type)
    return list(db.scalars(stmt))


@router.get("/characters", response_model=list[CharacterOut])
def list_characters(db: Session = Depends(get_db)):
    return list(db.scalars(select(Character).order_by(Character.name)))


@router.get("/artists", response_model=list[ArtistOut])
def list_artists(db: Session = Depends(get_db)):
    return list(db.scalars(select(Artist).order_by(Artist.name)))


def _artist_or_404(db: Session, artist_id: int) -> Artist:
    row = db.get(Artist, artist_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artist not found")
    return row


def _ensure_unique_artist_name(db: Session, name: str, *, excluding_id: int | None = None) -> None:
    stmt = select(Artist).where(Artist.name == name)
    if excluding_id is not None:
        stmt = stmt.where(Artist.id != excluding_id)
    if db.scalar(stmt) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Artist name already exists"
        )


@router.post("/artists", response_model=ArtistOut, status_code=status.HTTP_201_CREATED)
def create_artist(
    body: ArtistCreate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    _ensure_unique_artist_name(db, body.name)
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
    if body.name is not None:
        _ensure_unique_artist_name(db, body.name, excluding_id=artist_id)
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
    row = _artist_or_404(db, artist_id)
    db.delete(row)
    db.commit()
