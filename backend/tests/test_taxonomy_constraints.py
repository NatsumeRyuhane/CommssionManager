import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Artist, Character, Label, LabelType


@pytest.mark.parametrize(
    ("model", "extra_fields"),
    (
        (Label, {"type": LabelType.tag}),
        (Character, {}),
        (Artist, {}),
    ),
)
def test_taxonomy_names_are_case_insensitively_unique(
    client: TestClient,
    engine: Engine,
    model,
    extra_fields: dict,
):
    with Session(engine) as db:
        db.add_all(
            [
                model(name="Aki", **extra_fields),
                model(name="aki", **extra_fields),
            ]
        )
        with pytest.raises(IntegrityError):
            db.commit()
