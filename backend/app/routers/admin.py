"""ユーザー管理。パワーユーザーだけが使える。"""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from ..accounts import count_active_power
from ..deps import DbSession, PowerUser
from ..models import User
from ..schemas import AdminUserOut, AdminUserPatch

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[AdminUserOut])
def users(_: PowerUser, db: DbSession):
    return list(db.scalars(select(User).order_by(User.id)))


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(user_id: int, data: AdminUserPatch, admin: PowerUser, db: DbSession):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ユーザーが見つかりません")
    fields = data.model_dump(exclude_unset=True)
    role = fields.get("role", target.role)
    active = fields.get("is_active", target.is_active)
    if role is None or active is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "権限と有効/無効には値が必要です")

    if target.id == admin.id and not active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "自分自身を無効にはできません")
    # 降格・無効化のあとにパワーユーザーが0人になる操作は止める
    stays_power = role == "power" and active
    if not stays_power and count_active_power(db, excluding=target.id) == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "パワーユーザーは最低1人必要です")

    target.role = role
    target.is_active = active
    db.commit()
    db.refresh(target)
    return target
