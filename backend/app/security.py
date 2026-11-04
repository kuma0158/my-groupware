from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# ユーザーが存在しない場合も同程度の時間をかけ、ログイン可否の推測(タイミング攻撃)を防ぐ
DUMMY_HASH = hash_password("dummy-password")


def create_access_token(user_id: int, auth_version: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire, "ver": auth_version},
        settings.secret_key, algorithm=settings.algorithm,
    )


def decode_access_token(token: str) -> tuple[int, int] | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm],
                             options={"require": ["sub", "exp", "ver"]})
        user_id = int(payload["sub"])
        version = payload["ver"]
        if user_id <= 0 or type(version) is not int or version < 0:
            return None
        return user_id, version
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        return None
