from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import models  # noqa: F401  (テーブル定義を読み込むため)
from .config import settings
from . import accounts, board
from .database import Base, SessionLocal, engine
from .routers import admin, auth, dashboard, notices, office, schedule, todo_columns, todos


@asynccontextmanager
async def lifespan(_: FastAPI):
    # ひな型では手軽さ優先で自動作成。本番運用では Alembic 等のマイグレーションに置き換える
    Base.metadata.create_all(bind=engine)
    board.upgrade_schema(engine)  # 既存のDBに、ToDoカンバン用の項目を足す
    accounts.upgrade_schema(engine)  # 既存のDBに、権限・配色の項目を足す
    with SessionLocal() as db:
        accounts.ensure_power_user(db)  # パワーユーザーが居なければ最初のユーザーを昇格
        board.seed_and_backfill(db)  # 初期の列を作り、既存のToDoを列へ振り分ける
    yield


app = FastAPI(title="Dashboard API", lifespan=lifespan)

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
