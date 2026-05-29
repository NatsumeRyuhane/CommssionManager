from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Artist, Character, Label
from app.schemas import ArtistOut, CharacterOut, LabelOut

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
