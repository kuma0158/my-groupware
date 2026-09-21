"""各機能で共通して使う取り出し処理。

ルーターとダッシュボードの両方から同じ一覧が必要になるため、
問い合わせをここにまとめて二重実装を避けている。
"""

from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Event, Message, Notice, NoticeRead, Todo, TodoShare, User
from .schemas import BadgeOut, EventOut, MemberOut, MessageOut, NoticeOut, TodoOut


def name_map(db: Session) -> dict[int, str]:
    return {u.id: u.name for u in db.scalars(select(User))}


def events_between(db: Session, viewer: User, start: date, end: date, user_id: int | None = None) -> list[EventOut]:
    """期間内の予定。非公開の予定は本人にだけ返す。"""
    q = select(Event).where(Event.on_date >= start, Event.on_date <= end)
    if user_id is not None:
        q = q.where(Event.user_id == user_id)
    q = q.order_by(Event.on_date, Event.start_time)
    names = name_map(db)
    out = []
    for e in db.scalars(q):
        if e.is_private and e.user_id != viewer.id:
            continue
        out.append(EventOut(**{c.name: getattr(e, c.name) for c in Event.__table__.columns if c.name != "created_at"},
                            user_name=names.get(e.user_id, "")))
    return out


def share_map(db: Session) -> dict[int, list[int]]:
    out: dict[int, list[int]] = {}
    for todo_id, user_id in db.execute(select(TodoShare.todo_id, TodoShare.user_id).order_by(TodoShare.user_id)):
        out.setdefault(todo_id, []).append(user_id)
    return out


def todo_visible(user: User):
    """自分のToDo(登録した・担当する)と、共有されたToDo。他の人のカードは見えない。"""
    shared = select(TodoShare.todo_id).where(TodoShare.user_id == user.id)
    return (Todo.assignee_id == user.id) | (Todo.owner_id == user.id) | Todo.id.in_(shared)


def todo_out(t: Todo, names: dict[int, str], shares: dict[int, list[int]] | None = None) -> TodoOut:
    return TodoOut(
        id=t.id, title=t.title, due_on=t.due_on, note=t.note, done=t.done,
        assignee_id=t.assignee_id, assignee_name=names.get(t.assignee_id, ""), owner_id=t.owner_id,
        column_id=t.column_id or 0, position=t.position, shared_with=(shares or {}).get(t.id, []),
    )


def todos_for(db: Session, user: User, include_done: bool = False) -> list[TodoOut]:
    """自分が担当、自分が登録した、または共有されたToDo。"""
    q = select(Todo).where(todo_visible(user))
    if not include_done:
        q = q.where(Todo.done.is_(False))
    # 期限なしは末尾に回す
    rows = sorted(db.scalars(q), key=lambda t: (t.done, t.due_on is None, t.due_on or date.max, -t.id))
    names = name_map(db)
    shares = share_map(db)
    return [todo_out(t, names, shares) for t in rows]


def notices_for(db: Session, user: User, limit: int | None = None) -> list[NoticeOut]:
    q = select(Notice).order_by(Notice.pinned.desc(), Notice.created_at.desc())
    if limit:
        q = q.limit(limit)
    # 自分が書いたお知らせは、常に既読として扱う
    read_ids = set(db.scalars(select(NoticeRead.notice_id).where(NoticeRead.user_id == user.id)))
    names = name_map(db)
    return [
        NoticeOut(
            id=n.id, title=n.title, body=n.body, pinned=n.pinned, author_id=n.author_id,
            author_name=names.get(n.author_id, ""), created_at=n.created_at, unread=n.author_id != user.id and n.id not in read_ids,
        )
        for n in db.scalars(q)
    ]


def messages_for(db: Session, user: User, include_handled: bool = False) -> list[MessageOut]:
    q = select(Message).where(Message.to_user_id == user.id)
    if not include_handled:
        q = q.where(Message.handled.is_(False))
    names = name_map(db)
    return [
        MessageOut(
            id=m.id, to_user_id=m.to_user_id, from_user_id=m.from_user_id,
            from_name=names.get(m.from_user_id, ""), caller=m.caller, body=m.body,
            handled=m.handled, created_at=m.created_at,
        )
        for m in db.scalars(q.order_by(Message.created_at.desc()))
    ]


def badge_counts(db: Session, user: User) -> BadgeOut:
    """メニューのバッジ用。一覧は作らず件数だけ数えるので、繰り返し呼んでも軽い。

    数える条件は各画面の一覧と同じ。ToDo は todos_for、お知らせは notices_for、
    伝言は messages_for に合わせている。
    """

    def count(model, *where) -> int:
        return db.scalar(select(func.count()).select_from(model).where(*where)) or 0

    read = select(NoticeRead.notice_id).where(NoticeRead.user_id == user.id)
    return BadgeOut(
        todos=count(Todo, todo_visible(user), Todo.done.is_(False)),
        notices=count(Notice, Notice.id.not_in(read), Notice.author_id != user.id),
        messages=count(Message, Message.to_user_id == user.id, Message.handled.is_(False)),
    )


def members(db: Session) -> list[MemberOut]:
    rows = db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.id))
    return [MemberOut.model_validate(u) for u in rows]
