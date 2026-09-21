"""ToDo のカンバン(列とカードの置き場所)まわりの処理。

列は全員で共有する。「完了」かどうかは Todo.done が持っているので、
カードを動かしたときは必ず apply_done で列の is_done に合わせる。
"""

from datetime import datetime, timezone

from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from .models import Todo, TodoColumn

DEFAULT_COLUMNS = [("未着手", False), ("進行中", False), ("完了", True)]
MAX_COLUMNS = 12


def upgrade_schema(engine: Engine) -> None:
    """既存の app.db に、カンバン用の項目を足す(create_all は既存テーブルに列を足さないため)。"""
    have = {c["name"] for c in inspect(engine).get_columns("todos")}
    with engine.begin() as conn:
        if "column_id" not in have:
            conn.execute(text("ALTER TABLE todos ADD COLUMN column_id INTEGER REFERENCES todo_columns(id)"))
        if "position" not in have:
            conn.execute(text("ALTER TABLE todos ADD COLUMN position INTEGER NOT NULL DEFAULT 0"))


def seed_and_backfill(db: Session) -> None:
    """列が1つも無ければ初期の3列を作り、置き場所が未設定のToDoを完了/未完了に応じて振り分ける。"""
    if db.scalar(select(TodoColumn.id).limit(1)) is None:
        for i, (name, is_done) in enumerate(DEFAULT_COLUMNS):
            db.add(TodoColumn(name=name, position=i, is_done=is_done))
        db.flush()
    unplaced = list(db.scalars(select(Todo).where(Todo.column_id.is_(None)).order_by(Todo.id)))
    for t in unplaced:
        col = first_column(db, done=t.done)
        t.column_id = col.id
        t.position = next_position(db, col.id)
        db.flush()
    db.commit()


def columns(db: Session) -> list[TodoColumn]:
    return list(db.scalars(select(TodoColumn).order_by(TodoColumn.position, TodoColumn.id)))


def first_column(db: Session, done: bool) -> TodoColumn:
    """完了列(または未完了の列)のうち、いちばん左のもの。"""
    col = db.scalars(
        select(TodoColumn).where(TodoColumn.is_done.is_(done)).order_by(TodoColumn.position, TodoColumn.id)
    ).first()
    if col is None:  # 列の削除・変更で最後の1つを消させないので、通常は起きない
        raise ValueError("完了列と未完了の列は、それぞれ1つ以上必要です")
    return col


def next_position(db: Session, column_id: int) -> int:
    last = db.scalars(select(Todo.position).where(Todo.column_id == column_id).order_by(Todo.position.desc())).first()
    return 0 if last is None else last + 1


def apply_done(todo: Todo, column: TodoColumn) -> None:
    """カードの完了状態を、置かれた列に合わせる。"""
    if column.is_done and not todo.done:
        todo.done = True
        todo.done_at = datetime.now(timezone.utc)
    elif not column.is_done and todo.done:
        todo.done = False
        todo.done_at = None


def place(db: Session, todo: Todo, column: TodoColumn, before_id: int | None = None) -> None:
    """カードを column の before_id のカードの手前(None なら末尾)に置き、列の順番を振り直す。

    before_id は画面に見えているカードの id で決める。見えていないカード
    (他人のToDo)も同じ列に居るので、位置は index ではなく id で受け取る。
    """
    cards = list(
        db.scalars(
            select(Todo).where(Todo.column_id == column.id, Todo.id != todo.id).order_by(Todo.position, Todo.id)
        )
    )
    if before_id is None:
        index = len(cards)
    else:
        ids = [c.id for c in cards]
        if before_id not in ids:
            raise ValueError("指定したカードがこの列にありません")
        index = ids.index(before_id)
    cards.insert(index, todo)
    todo.column_id = column.id
    apply_done(todo, column)
    for i, c in enumerate(cards):
        c.position = i
