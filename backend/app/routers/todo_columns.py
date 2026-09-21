from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from .. import board
from ..deps import CurrentUser, DbSession
from ..models import Todo, TodoColumn
from ..schemas import ColumnIn, ColumnOrder, ColumnOut, ColumnPatch

# 列は全員で共有するボードの設定なので、ログインしていれば誰でも変えられる
router = APIRouter(prefix="/api/todo-columns", tags=["todos"])


def _get(db, column_id: int) -> TodoColumn:
    col = db.get(TodoColumn, column_id)
    if col is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "列が見つかりません")
    return col


def _count_of_kind(db, is_done: bool) -> int:
    return db.scalar(select(func.count()).select_from(TodoColumn).where(TodoColumn.is_done.is_(is_done))) or 0


@router.get("", response_model=list[ColumnOut])
def index(_: CurrentUser, db: DbSession):
    return board.columns(db)


@router.post("", response_model=ColumnOut, status_code=status.HTTP_201_CREATED)
def create(data: ColumnIn, _: CurrentUser, db: DbSession):
    cols = board.columns(db)
    if len(cols) >= board.MAX_COLUMNS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"列は{board.MAX_COLUMNS}個までです")
    col = TodoColumn(name=data.name, is_done=data.is_done, position=len(cols))
    db.add(col)
    db.commit()
    db.refresh(col)
    return col


# /order は /{column_id} より先に宣言する(数値でないパスを column_id と取り違えないため)
@router.put("/order", response_model=list[ColumnOut])
def reorder(data: ColumnOrder, _: CurrentUser, db: DbSession):
    cols = {c.id: c for c in board.columns(db)}
    if sorted(data.ids) != sorted(cols):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "すべての列を1回ずつ指定してください")
    for i, cid in enumerate(data.ids):
        cols[cid].position = i
    db.commit()
    return board.columns(db)


@router.patch("/{column_id}", response_model=ColumnOut)
def update(column_id: int, data: ColumnPatch, _: CurrentUser, db: DbSession):
    col = _get(db, column_id)
    if data.name is not None:
        col.name = data.name
    if data.is_done is not None and data.is_done != col.is_done:
        # 完了列と未完了の列は、どちらも最低1つ残す(カードの行き先が無くなるため)
        if _count_of_kind(db, col.is_done) <= 1:
            kind = "完了列" if col.is_done else "未完了の列"
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{kind}は最低1つ必要です")
        col.is_done = data.is_done
        # 列の性質が変わったので、中のカードの完了状態も合わせる
        for t in db.scalars(select(Todo).where(Todo.column_id == col.id)):
            board.apply_done(t, col)
    db.commit()
    db.refresh(col)
    return col


@router.delete("/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(column_id: int, _: CurrentUser, db: DbSession):
    """列を消す。中のカードは、同じ種類(完了/未完了)のいちばん左の列の末尾へ移す。"""
    col = _get(db, column_id)
    if _count_of_kind(db, col.is_done) <= 1:
        kind = "完了列" if col.is_done else "未完了の列"
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{kind}は最低1つ必要です")
    target = db.scalars(
        select(TodoColumn)
        .where(TodoColumn.is_done.is_(col.is_done), TodoColumn.id != col.id)
        .order_by(TodoColumn.position, TodoColumn.id)
    ).first()
    moving = list(db.scalars(select(Todo).where(Todo.column_id == col.id).order_by(Todo.position, Todo.id)))
    start = board.next_position(db, target.id)
    for i, t in enumerate(moving):
        t.column_id = target.id
        t.position = start + i
    db.flush()
    db.delete(col)
    db.flush()
    for i, c in enumerate(board.columns(db)):  # 列の番号の欠けを詰める
        c.position = i
    db.commit()
