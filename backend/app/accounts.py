"""アカウントの権限と配色まわりの処理。

権限は2種類。パワーユーザー(power)は設定画面でユーザーの権限や有効/無効を変えられる。
一般ユーザー(user)は自分のプロフィールと配色だけ変えられる。
パワーユーザーは常に1人以上いる状態を保つ(最後の1人は降格も無効化もできない)。
"""

from sqlalchemy import func, inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from .models import User

ROLES = ("power", "user")
SCHEMES = ("warm", "neutral", "cool", "dark")


def upgrade_schema(engine: Engine) -> None:
    """既存の app.db に、権限と配色の項目を足す(create_all は既存テーブルに列を足さないため)。"""
    have = {c["name"] for c in inspect(engine).get_columns("users")}
    with engine.begin() as conn:
        if "role" not in have:
            conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'"))
        if "color_scheme" not in have:
            conn.execute(text("ALTER TABLE users ADD COLUMN color_scheme VARCHAR(20) NOT NULL DEFAULT 'neutral'"))


def ensure_power_user(db: Session) -> None:
    """パワーユーザーが1人もいなければ、いちばん古い有効なユーザーを昇格する(既存 DB の移行用)。"""
    if count_active_power(db) == 0:
        first = db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.id)).first()
        if first is not None:
            first.role = "power"
            db.commit()


def count_active_power(db: Session, excluding: int | None = None) -> int:
    q = select(func.count()).select_from(User).where(User.role == "power", User.is_active.is_(True))
    if excluding is not None:
        q = q.where(User.id != excluding)
    return db.scalar(q) or 0
