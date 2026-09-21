from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import select

from ..config import settings
from ..deps import CurrentUser, DbSession
from ..models import User
from ..schemas import LoginIn, PasswordChange, ProfilePatch, RegisterIn, UserOut
from ..security import DUMMY_HASH, create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_login_cookie(response: Response, user_id: int) -> None:
    response.set_cookie(
        key=settings.cookie_name,
        value=create_access_token(user_id),
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,  # JavaScript から読めない → XSS でトークンを盗まれにくい
        secure=settings.cookie_secure,
        samesite="lax",  # 他サイトからの POST にはクッキーを付けない(CSRF 対策)
        path="/",
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, response: Response, db: DbSession):
    email = data.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "このメールアドレスは既に登録されています")
    # 最初に登録した人はパワーユーザーにする(誰も管理できない状態を避けるため)
    first = db.scalar(select(User.id).limit(1)) is None
    user = User(
        email=email, name=data.name, department=data.department,
        hashed_password=hash_password(data.password), role="power" if first else "user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _set_login_cookie(response, user.id)  # 登録後はそのままログイン状態にする
    return user


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, response: Response, db: DbSession):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    ok = verify_password(data.password, user.hashed_password if user else DUMMY_HASH)
    if not user or not ok or not user.is_active:
        # どちらが間違いかは教えない
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "メールアドレスまたはパスワードが正しくありません")
    _set_login_cookie(response, user.id)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    response.delete_cookie(settings.cookie_name, path="/")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(data: ProfilePatch, user: CurrentUser, db: DbSession):
    """自分のプロフィールと配色を変える。権限とメールアドレスはここでは変えられない。"""
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: PasswordChange, user: CurrentUser, db: DbSession):
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "現在のパスワードが正しくありません")
    user.hashed_password = hash_password(data.new_password)
    db.commit()
