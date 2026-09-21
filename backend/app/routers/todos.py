from fastapi import APIRouter, HTTPException, status

from .. import board
from ..crud import name_map, share_map, todo_out, todos_for
from ..deps import CurrentUser, DbSession
from ..models import Todo, TodoColumn, TodoShare, User
from ..schemas import TodoIn, TodoMove, TodoOut, TodoPatch, TodoShareIn

router = APIRouter(prefix="/api/todos", tags=["todos"])


@router.get("", response_model=list[TodoOut])
def index(user: CurrentUser, db: DbSession, include_done: bool = False):
    return todos_for(db, user, include_done)


def _column(db, column_id: int) -> TodoColumn:
    col = db.get(TodoColumn, column_id)
    if col is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "列が見つかりません")
    return col


def _out(db, t: Todo) -> TodoOut:
    return todo_out(t, name_map(db), share_map(db))


@router.post("", response_model=TodoOut, status_code=status.HTTP_201_CREATED)
def create(data: TodoIn, user: CurrentUser, db: DbSession):
    assignee_id = data.assignee_id or user.id
    if db.get(User, assignee_id) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "担当者が見つかりません")
    col = _column(db, data.column_id) if data.column_id else board.first_column(db, done=False)
    t = Todo(owner_id=user.id, assignee_id=assignee_id, title=data.title, due_on=data.due_on, note=data.note)
    db.add(t)
    db.flush()
    board.place(db, t, col)  # 列の末尾に置く。完了列に作ったときは完了扱いになる
    db.commit()
    db.refresh(t)
    return _out(db, t)


def _editable(db, user, todo_id: int, allow_shared: bool = True) -> Todo:
    t = db.get(Todo, todo_id)
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ToDoが見つかりません")
    # 担当者と登録者のどちらも触れる。共有された人は、見て・動かして・直せる(削除と共有の変更は除く)
    allowed = user.id in (t.assignee_id, t.owner_id)
    if not allowed and allow_shared:
        allowed = db.get(TodoShare, (t.id, user.id)) is not None
    if not allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "このToDoは編集できません")
    return t


@router.patch("/{todo_id}", response_model=TodoOut)
def update(todo_id: int, data: TodoPatch, user: CurrentUser, db: DbSession):
    t = _editable(db, user, todo_id)
    fields = data.model_dump(exclude_unset=True)
    if fields.get("assignee_id") is not None and db.get(User, fields["assignee_id"]) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "担当者が見つかりません")

    for key in ("title", "assignee_id"):
        if fields.get(key) is not None:
            setattr(t, key, fields[key])
    if fields.get("note") is not None:
        t.note = fields["note"]
    if "due_on" in fields:  # 期限だけは null で消せる
        t.due_on = fields["due_on"]

    # 置き場所は column_id を優先。done だけ来たら、完了列/未完了の列の末尾へ動かす
    if fields.get("column_id") is not None:
        if fields["column_id"] != t.column_id:
            board.place(db, t, _column(db, fields["column_id"]))
    elif fields.get("done") is not None and fields["done"] != t.done:
        try:
            board.place(db, t, board.first_column(db, done=fields["done"]))
        except ValueError as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    db.commit()
    db.refresh(t)
    return _out(db, t)


@router.post("/{todo_id}/move", response_model=TodoOut)
def move(todo_id: int, data: TodoMove, user: CurrentUser, db: DbSession):
    """カンバンでカードを動かす(別の列へ、または同じ列の中で並べ替え)。"""
    t = _editable(db, user, todo_id)
    col = _column(db, data.column_id)
    if data.before_id == t.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "自分自身の手前には置けません")
    try:
        board.place(db, t, col, data.before_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    db.commit()
    db.refresh(t)
    return _out(db, t)


@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(todo_id: int, user: CurrentUser, db: DbSession):
    t = _editable(db, user, todo_id, allow_shared=False)
    db.query(TodoShare).filter(TodoShare.todo_id == t.id).delete()
    db.delete(t)
    db.commit()


@router.put("/{todo_id}/shares", response_model=TodoOut)
def share(todo_id: int, data: TodoShareIn, user: CurrentUser, db: DbSession):
    """共有する相手を選び直す(送った一覧がそのまま新しい共有先になる)。登録者だけができる。"""
    t = _editable(db, user, todo_id, allow_shared=False)
    if t.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "共有を変えられるのは登録した人だけです")
    ids = set(data.user_ids) - {t.owner_id}
    found = {u.id for u in db.query(User).filter(User.id.in_(ids), User.is_active.is_(True))} if ids else set()
    if found != ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "共有先のユーザーが見つかりません")
    db.query(TodoShare).filter(TodoShare.todo_id == t.id).delete()
    for uid in sorted(ids):
        db.add(TodoShare(todo_id=t.id, user_id=uid))
    db.commit()
    db.refresh(t)
    return _out(db, t)
