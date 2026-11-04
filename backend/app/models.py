from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    department: Mapped[str] = mapped_column(String(100), default="")
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    auth_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    # 在席状況。席を外すたびに行を増やさず、この2列を上書きする
    presence: Mapped[str] = mapped_column(String(20), default="in")  # in/out/away/off
    presence_note: Mapped[str] = mapped_column(String(120), default="")
    # 権限。"power"(パワーユーザー)は設定でユーザーを管理できる。"user" は一般ユーザー
    role: Mapped[str] = mapped_column(String(20), default="user", server_default="user")
    # 画面の配色。"warm"(暖色) / "neutral"(中間色) / "cool"(寒色) / "dark"(ダークモード)
    color_scheme: Mapped[str] = mapped_column(String(20), default="neutral", server_default="neutral")


class DashboardLayout(Base):
    """ダッシュボードのウィジェット配置。ユーザーごとに1行、中身はJSON文字列。"""

    __tablename__ = "dashboard_layouts"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    data: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Event(Base):
    """予定。所有者だけが編集でき、公開設定に応じて他の人にも見える。"""

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    # 日付と時刻を分けると週表示の絞り込みが速く、終日の予定も素直に表せる
    on_date: Mapped[date] = mapped_column(Date, index=True)
    start_time: Mapped[str] = mapped_column(String(5), default="")  # "09:00"、終日なら空
    end_time: Mapped[str] = mapped_column(String(5), default="")
    place: Mapped[str] = mapped_column(String(120), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class TodoColumn(Base):
    """カンバンの列。全員で共有する。is_done の列に入ったToDoは完了扱いになる。"""

    __tablename__ = "todo_columns"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    position: Mapped[int] = mapped_column(Integer, default=0)  # 左から何番目か
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)


class Todo(Base):
    __tablename__ = "todos"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)  # 登録した人
    assignee_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)  # 担当する人
    title: Mapped[str] = mapped_column(String(200))
    due_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    done: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    # カンバンでの置き場所。done は「完了列にあるか」と常に一致させる
    column_id: Mapped[int | None] = mapped_column(ForeignKey("todo_columns.id"), nullable=True, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)  # 列の中での順番(小さいほど上)


class TodoShare(Base):
    """ToDoの共有。登録者が選んだ相手にだけ、そのカードが見える。"""

    __tablename__ = "todo_shares"

    todo_id: Mapped[int] = mapped_column(ForeignKey("todos.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True, index=True)


class Notice(Base):
    """社内お知らせ。既読はユーザーごとに NoticeRead で持つ。"""

    __tablename__ = "notices"

    id: Mapped[int] = mapped_column(primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class NoticeRead(Base):
    __tablename__ = "notice_reads"

    notice_id: Mapped[int] = mapped_column(ForeignKey("notices.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Message(Base):
    """伝言メモ。外部からの電話を受けた人が、席にいない人に残す。"""

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    caller: Mapped[str] = mapped_column(String(120), default="")  # 電話の相手
    body: Mapped[str] = mapped_column(Text, default="")
    handled: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
