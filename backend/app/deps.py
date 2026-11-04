from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User
from .security import decode_access_token


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    token: Annotated[str | None, Cookie(alias=settings.cookie_name)] = None,
) -> User:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "ログインが必要です")
    if not token:
        raise unauthorized
    decoded = decode_access_token(token)
    if decoded is None:
        raise unauthorized
    user_id, token_version = decoded
    user = db.get(User, user_id)
    if user is None or not user.is_active or user.auth_version != token_version:
        raise unauthorized
    return user


def require_power_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != "power":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "この操作はパワーユーザーだけができます")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
PowerUser = Annotated[User, Depends(require_power_user)]
DbSession = Annotated[Session, Depends(get_db)]
