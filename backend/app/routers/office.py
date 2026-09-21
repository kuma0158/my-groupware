"""在席状況と伝言メモ。席にいない相手への連絡を残すための機能。"""

from fastapi import APIRouter, HTTPException, status

from ..crud import members, messages_for
from ..deps import CurrentUser, DbSession
from ..models import Message, User
from ..schemas import MemberOut, MessageIn, MessageOut, PresenceIn

router = APIRouter(prefix="/api", tags=["office"])


@router.get("/members", response_model=list[MemberOut])
def member_list(user: CurrentUser, db: DbSession):
    return members(db)


@router.put("/presence", response_model=MemberOut)
def set_presence(data: PresenceIn, user: CurrentUser, db: DbSession):
    user.presence = data.presence
    user.presence_note = data.presence_note
    db.commit()
    db.refresh(user)
    return MemberOut.model_validate(user)


@router.get("/messages", response_model=list[MessageOut])
def message_list(user: CurrentUser, db: DbSession, include_handled: bool = False):
    """自分あての伝言。既定では未処理のものだけ。"""
    return messages_for(db, user, include_handled)


@router.post("/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
def create_message(data: MessageIn, user: CurrentUser, db: DbSession):
    to = db.get(User, data.to_user_id)
    if to is None or not to.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "宛先が見つかりません")
    m = Message(to_user_id=to.id, from_user_id=user.id, caller=data.caller, body=data.body)
    db.add(m)
    db.commit()
    db.refresh(m)
    return MessageOut(
        id=m.id, to_user_id=m.to_user_id, from_user_id=m.from_user_id, from_name=user.name,
        caller=m.caller, body=m.body, handled=m.handled, created_at=m.created_at,
    )


@router.post("/messages/{message_id}/handled", status_code=status.HTTP_204_NO_CONTENT)
def mark_handled(message_id: int, user: CurrentUser, db: DbSession):
    m = db.get(Message, message_id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "伝言が見つかりません")
    if m.to_user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "自分あての伝言だけ操作できます")
    m.handled = True
    db.commit()
