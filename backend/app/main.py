from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (テーブル定義を読み込むため)
from .config import settings
from . import accounts, board
from .database import Base, SessionLocal, engine
from .routers import admin, auth, dashboard, notices, office, schedule, todo_columns, todos


@asynccontextmanager
async def lifespan(_: FastAPI):
    if (settings.cookie_secure or settings.app_env == "production") and (
        settings.secret_key == "change-me" or len(settings.secret_key) < 32
    ):
        raise RuntimeError("SECRET_KEY が初期値または短すぎます。32文字以上のランダムな値にしてください")
    if settings.app_env == "production":
        if not settings.cookie_secure:
            raise RuntimeError("本番環境では COOKIE_SECURE=true が必要です")
        if not settings.frontend_origin.startswith("https://"):
            raise RuntimeError("本番環境では HTTPS の FRONTEND_ORIGIN が必要です")
        if settings.allow_registration:
            raise RuntimeError("本番環境では ALLOW_REGISTRATION=false が必要です")
    # ひな型では手軽さ優先で自動作成。本番運用では Alembic 等のマイグレーションに置き換える
    Base.metadata.create_all(bind=engine)
    board.upgrade_schema(engine)  # 既存のDBに、ToDoカンバン用の項目を足す
    accounts.upgrade_schema(engine)  # 既存のDBに、権限・配色の項目を足す
    with SessionLocal() as db:
        accounts.ensure_power_user(db)  # パワーユーザーが居なければ最初のユーザーを昇格
        board.seed_and_backfill(db)  # 初期の列を作り、既存のToDoを列へ振り分ける
    yield


app = FastAPI(title="Dashboard API", lifespan=lifespan)


@app.middleware("http")
async def csrf_origin_guard(request: Request, call_next):
    """Cookie認証APIの状態変更はフロントエンドのOriginのみ許可する。"""
    if request.url.path.startswith("/api/") and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        if request.headers.get("origin") != settings.frontend_origin:
            return JSONResponse(status_code=403, content={"detail": "許可されていない送信元です"})
    return await call_next(request)


# Next.js の rewrites 経由なら通常CORSは不要だが、フロントから直接叩く場合に備えて許可しておく
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(dashboard.router)
app.include_router(schedule.router)
app.include_router(todos.router)
app.include_router(todo_columns.router)
app.include_router(notices.router)
app.include_router(office.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
