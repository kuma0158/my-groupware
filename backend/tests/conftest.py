import os
import tempfile

# アプリを import する前にテスト用DBを指定する
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-must-be-32-bytes-or-more"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.routers.auth import login_limiter, register_limiter  # noqa: E402

USER = {"email": "taro@example.com", "name": "山田太郎", "password": "password123", "department": "営業部"}
OTHER = {"email": "hanako@example.com", "name": "鈴木花子", "password": "password123", "department": "総務部"}


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    # レート制限の記録はテストをまたいで残る(モジュール単位のメモリのため)ので毎回リセットする
    login_limiter.clear()
    register_limiter.clear()
    with TestClient(app, headers={"Origin": "http://localhost:3000"}) as c:
        yield c


@pytest.fixture()
def other(client):
    """別ユーザーを1人作る。作成後は元のユーザーのログインに戻す。"""
    client.post("/api/auth/register", json=OTHER)
    user = client.get("/api/auth/me").json()
    client.post("/api/auth/login", json={"email": USER["email"], "password": USER["password"]})
    return user


@pytest.fixture()
def me(client):
    client.post("/api/auth/register", json=USER)
    return client.get("/api/auth/me").json()
