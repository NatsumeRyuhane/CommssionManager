from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.v1 import crud
from app.auth.deps import Principal, get_principal, require_edit
from app.db import get_db
from app.models import Commission, CommissionFile, CommissionNode, Visibility
from app.schemas import NodeCreate, NodeOut, NodeReorder, NodeUpdate

router = APIRouter(tags=["nodes"])

_REORDER_TEMP_OFFSET = 100_000  # park positions here to dodge the (commission_id, position) unique


def _commission_or_404(db: Session, commission_id: int) -> Commission:
    commission = db.scalar(
        select(Commission)
        .where(Commission.id == commission_id)
        .options(selectinload(Commission.nodes).selectinload(CommissionNode.files))
    )
    if commission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Commission not found")
    return commission


def _node_or_404(db: Session, node_id: int) -> CommissionNode:
    node = db.get(CommissionNode, node_id)
    if node is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    return node


@router.get("/commissions/{commission_id}/nodes", response_model=list[NodeOut])
def list_nodes(
    commission_id: int,
    db: Session = Depends(get_db),
    principal: Principal | None = Depends(get_principal),
):
    commission = _commission_or_404(db, commission_id)
    visibility_context = crud.load_visibility_context(db)
    include_private = principal is not None and principal.can_write
    if (
        not include_private
        and crud.effective_commission_visibility(commission, visibility_context)
        != Visibility.public
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Commission not found")
    return crud.serialize_nodes(commission, visibility_context, include_private)


@router.post(
    "/commissions/{commission_id}/nodes", response_model=NodeOut, status_code=status.HTTP_201_CREATED
)
def create_node(
    commission_id: int,
    body: NodeCreate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    commission = _commission_or_404(db, commission_id)
    positions = [n.position for n in commission.nodes if not n.is_detached and n.position is not None]
    node = CommissionNode(
        commission_id=commission_id,
        name=body.name,
        position=(max(positions) + 1) if positions else 0,
        started_at=datetime.now(timezone.utc),
        visibility_override=crud.default_stage_visibility(
            body.name, crud.load_visibility_context(db)
        ),
    )
    db.add(node)
    db.commit()
    db.refresh(node)
    return crud.node_out(node, visibility_context=crud.load_visibility_context(db))


@router.patch("/nodes/{node_id}", response_model=NodeOut)
def update_node(
    node_id: int,
    body: NodeUpdate,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    node = _node_or_404(db, node_id)
    if node.is_detached:
        raise HTTPException(status_code=400, detail="The detached node cannot be edited")
    if body.name is None and "started_at" not in body.model_fields_set:
        raise HTTPException(status_code=400, detail="No node fields provided")
    if body.name is not None:
        node.name = body.name
    if "started_at" in body.model_fields_set:
        node.started_at = body.started_at
    db.commit()
    db.refresh(node)
    return crud.node_out(node, visibility_context=crud.load_visibility_context(db))


@router.post("/commissions/{commission_id}/nodes/reorder", response_model=list[NodeOut])
def reorder_nodes(
    commission_id: int,
    body: NodeReorder,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    commission = _commission_or_404(db, commission_id)
    regular = {n.id: n for n in commission.nodes if not n.is_detached}
    if set(body.node_ids) != set(regular):
        raise HTTPException(
            status_code=400,
            detail="node_ids must list exactly the commission's regular (non-detached) nodes",
        )
    # two-phase to avoid transient unique-constraint collisions on (commission_id, position)
    for i, nid in enumerate(body.node_ids):
        regular[nid].position = _REORDER_TEMP_OFFSET + i
    db.flush()
    for i, nid in enumerate(body.node_ids):
        regular[nid].position = i
    db.commit()
    visibility_context = crud.load_visibility_context(db)
    return [crud.node_out(regular[nid], visibility_context=visibility_context) for nid in body.node_ids]


@router.delete("/nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_node(
    node_id: int,
    db: Session = Depends(get_db),
    _: Principal = Depends(require_edit),
):
    node = _node_or_404(db, node_id)
    if node.is_detached:
        raise HTTPException(status_code=400, detail="The detached node cannot be deleted")

    detached = db.scalar(
        select(CommissionNode).where(
            CommissionNode.commission_id == node.commission_id,
            CommissionNode.is_detached.is_(True),
        )
    )
    if detached is None:
        raise HTTPException(status_code=500, detail="Commission is missing its detached node")

    # Reparent in the existing order and append after any detached files.
    detached_positions = [
        file.position for file in detached.files
    ]
    next_position = max(detached_positions, default=-1) + 1
    files = list(
        db.scalars(
            select(CommissionFile)
            .where(CommissionFile.node_id == node.id)
            .order_by(CommissionFile.position, CommissionFile.id)
        )
    )
    for index, file in enumerate(files):
        file.position = next_position + index
        file.node_id = detached.id
    db.flush()
    db.delete(node)
    db.commit()
