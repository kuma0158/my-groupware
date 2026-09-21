from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .accounts import ROLES, SCHEMES

PRESENCE = ("in", "out", "away", "off")  # 在席 / 外出 / 離席 / 休み


def _check_password(v: str) -> str:
    # bcrypt は 72 バイトを超える部分を無視するため、超過は入力エラーにする
    if len(v.encode("utf-8")) > 72:
        raise ValueError("パスワードは72バイト以内にしてください")
    return v


class RegisterIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8)
    department: str = Field(default="", max_length=100)

    _pw = field_validator("password")(_check_password)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    department: str
    created_at: datetime
    role: str = "user"
    color_scheme: str = "neutral"


class ProfilePatch(BaseModel):
    """自分のプロフィールと配色の変更。送った項目だけ変える。"""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    department: str | None = Field(default=None, max_length=100)
    color_scheme: str | None = None

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("名前を入力してください")
        return v

    @field_validator("color_scheme")
    @classmethod
    def _known_scheme(cls, v: str | None) -> str | None:
        if v is not None and v not in SCHEMES:
            raise ValueError(f"配色は {', '.join(SCHEMES)} のいずれかにしてください")
        return v


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)

    _pw = field_validator("new_password")(_check_password)


class AdminUserOut(BaseModel):
    """ユーザー管理の一覧用。パワーユーザーにだけ返す。"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str
    department: str
    role: str
    is_active: bool
    created_at: datetime


class AdminUserPatch(BaseModel):
    role: str | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def _known_role(cls, v: str | None) -> str | None:
        if v is not None and v not in ROLES:
            raise ValueError(f"権限は {', '.join(ROLES)} のいずれかにしてください")
        return v


class MemberOut(BaseModel):
    """名簿・在席ボードに出す最小限の情報(メールなどは含めない)"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    department: str
    presence: str
    presence_note: str


class PresenceIn(BaseModel):
    presence: str
    presence_note: str = Field(default="", max_length=120)

    @field_validator("presence")
    @classmethod
    def _known(cls, v: str) -> str:
        if v not in PRESENCE:
            raise ValueError(f"在席状況は {', '.join(PRESENCE)} のいずれかにしてください")
        return v


# ---------- スケジュール ----------
class EventIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    on_date: date
    start_time: str = Field(default="", max_length=5)
    end_time: str = Field(default="", max_length=5)
    place: str = Field(default="", max_length=120)
    note: str = ""
    is_private: bool = False

    @field_validator("start_time", "end_time")
    @classmethod
    def _hhmm(cls, v: str) -> str:
        if v and not (len(v) == 5 and v[2] == ":" and v[:2].isdigit() and v[3:].isdigit()):
            raise ValueError("時刻は HH:MM の形式で入力してください")
        return v


class EventPatch(BaseModel):
    """予定の変更。送られた項目だけ変える(ドラッグ移動と編集の両方で使う)。

    省略した項目はそのまま。時刻と場所は空文字を送ると消える。
    """
    title: str | None = Field(default=None, min_length=1, max_length=200)
    on_date: date | None = None
    start_time: str | None = Field(default=None, max_length=5)
    end_time: str | None = Field(default=None, max_length=5)
    place: str | None = Field(default=None, max_length=120)
    note: str | None = None
    is_private: bool | None = None

    @field_validator("start_time", "end_time")
    @classmethod
    def _hhmm(cls, v: str | None) -> str | None:
        if v and not (len(v) == 5 and v[2] == ":" and v[:2].isdigit() and v[3:].isdigit()):
            raise ValueError("時刻は HH:MM の形式で入力してください")
        return v


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_name: str = ""
    title: str
    on_date: date
    start_time: str
    end_time: str
    place: str
    note: str
    is_private: bool


# ---------- ToDo ----------
class TodoIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    due_on: date | None = None
    note: str = ""
    assignee_id: int | None = None  # 省略したら自分
    column_id: int | None = None  # 省略したら、いちばん左の未完了の列


class TodoPatch(BaseModel):
    """ToDoの変更。送られた項目だけ変える。期限は null を送ると消える。"""

    done: bool | None = None  # true で完了列の末尾へ、false で未完了の列の末尾へ
    title: str | None = Field(default=None, min_length=1, max_length=200)
    note: str | None = None
    due_on: date | None = None
    assignee_id: int | None = None
    column_id: int | None = None  # 別の列へ移す(末尾に置く)


class TodoMove(BaseModel):
    """カンバンでカードを動かす。before_id のカードの手前に置き、None なら列の末尾。"""

    column_id: int
    before_id: int | None = None


class TodoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    due_on: date | None
    note: str
    done: bool
    assignee_id: int
    assignee_name: str = ""
    owner_id: int
    column_id: int = 0
    position: int = 0
    shared_with: list[int] = []  # 共有している相手のユーザーid


class TodoShareIn(BaseModel):
    user_ids: list[int]


class ColumnIn(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    is_done: bool = False

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("列の名前を入力してください")
        return v


class ColumnPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    is_done: bool | None = None

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("列の名前を入力してください")
        return v


class ColumnOrder(BaseModel):
    ids: list[int] = Field(max_length=50)  # 左から順に、すべての列の id


class ColumnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    position: int
    is_done: bool


# ---------- お知らせ ----------
class NoticeIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    body: str = ""
    pinned: bool = False


class NoticeOut(BaseModel):
    id: int
    title: str
    body: str
    pinned: bool
    author_id: int
    author_name: str
    created_at: datetime
    unread: bool


# ---------- 伝言 ----------
class MessageIn(BaseModel):
    to_user_id: int
    caller: str = Field(default="", max_length=120)
    body: str = ""


class MessageOut(BaseModel):
    id: int
    to_user_id: int
    from_user_id: int
    from_name: str
    caller: str
    body: str
    handled: bool
    created_at: datetime


# ---------- ダッシュボード ----------
class StatOut(BaseModel):
    key: str
    label: str
    value: int
    delta: float = 0.0


class SummaryOut(BaseModel):
    stats: list[StatOut]
    today_events: list[EventOut]
    todos: list[TodoOut]
    notices: list[NoticeOut]
    messages: list[MessageOut]
    members: list[MemberOut]


class WidgetIn(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    type: str = Field(min_length=1, max_length=40)
    span: int = Field(default=1, ge=1, le=2)
    props: dict[str, str] = Field(default_factory=dict)

    @field_validator("props")
    @classmethod
    def _limit_props(cls, v: dict[str, str]) -> dict[str, str]:
        if len(v) > 10 or sum(len(k) + len(val) for k, val in v.items()) > 2000:
            raise ValueError("ウィジェットの設定が大きすぎます")
        return v


class BadgeOut(BaseModel):
    """メニューに出す件数"""
    todos: int
    notices: int
    messages: int


class LayoutIn(BaseModel):
    widgets: list[WidgetIn] = Field(max_length=24)


class LayoutOut(BaseModel):
    widgets: list[WidgetIn]
