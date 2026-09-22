"""設定: プロフィール・配色・パスワード・ユーザー管理(権限)。"""

from tests.conftest import OTHER, USER


def _login(client, who):
    client.post("/api/auth/login", json={"email": who["email"], "password": who["password"]})


def test_first_user_is_power_and_next_is_general(client, me, other):
    assert me["role"] == "power"
    assert other["role"] == "user"
    assert me["color_scheme"] == "neutral"


def test_profile_update(client, me):
    r = client.patch("/api/auth/me", json={"name": "  山田次郎 ", "department": "開発部"})
    assert r.status_code == 200
    assert r.json()["name"] == "山田次郎" and r.json()["department"] == "開発部"
    assert client.get("/api/auth/me").json()["name"] == "山田次郎"


def test_profile_cannot_change_role(client, me, other):
    _login(client, OTHER)
    client.patch("/api/auth/me", json={"role": "power"})
    assert client.get("/api/auth/me").json()["role"] == "user"


def test_profile_rejects_blank_name(client, me):
    assert client.patch("/api/auth/me", json={"name": "  "}).status_code == 422


def test_color_scheme(client, me):
    for scheme in ("warm", "cool", "dark", "neutral"):
        r = client.patch("/api/auth/me", json={"color_scheme": scheme})
        assert r.json()["color_scheme"] == scheme
    assert client.patch("/api/auth/me", json={"color_scheme": "pink"}).status_code == 422


def test_change_password(client, me):
    bad = client.post("/api/auth/password", json={"current_password": "wrong-pass", "new_password": "newpassword1"})
    assert bad.status_code == 400
    ok = client.post("/api/auth/password", json={"current_password": USER["password"], "new_password": "newpassword1"})
    assert ok.status_code == 204
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": USER["email"], "password": USER["password"]}).status_code == 401
    assert client.post("/api/auth/login", json={"email": USER["email"], "password": "newpassword1"}).status_code == 200


def test_admin_requires_power_user(client, me, other):
    _login(client, OTHER)
    assert client.get("/api/admin/users").status_code == 403
    assert client.patch(f"/api/admin/users/{other['id']}", json={"role": "power"}).status_code == 403


def test_power_user_lists_and_changes_roles(client, me, other):
    users = client.get("/api/admin/users").json()
    assert [u["email"] for u in users] == [USER["email"], OTHER["email"]]
    r = client.patch(f"/api/admin/users/{other['id']}", json={"role": "power"})
    assert r.status_code == 200 and r.json()["role"] == "power"
    # 昇格した人はユーザー管理に入れる
    _login(client, OTHER)
    assert client.get("/api/admin/users").status_code == 200


def test_last_power_user_is_protected(client, me, other):
    assert client.patch(f"/api/admin/users/{me['id']}", json={"role": "user"}).status_code == 400
    assert client.patch(f"/api/admin/users/{me['id']}", json={"is_active": False}).status_code == 400
    client.patch(f"/api/admin/users/{other['id']}", json={"role": "power"})
    # 2人目が居れば降格できる。ただし自分を無効にはできない
    assert client.patch(f"/api/admin/users/{me['id']}", json={"role": "user"}).status_code == 200


def test_cannot_deactivate_self(client, me, other):
    client.patch(f"/api/admin/users/{other['id']}", json={"role": "power"})
    assert client.patch(f"/api/admin/users/{me['id']}", json={"is_active": False}).status_code == 400


def test_deactivated_user_cannot_login(client, me, other):
    assert client.patch(f"/api/admin/users/{other['id']}", json={"is_active": False}).status_code == 200
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": OTHER["email"], "password": OTHER["password"]}).status_code == 401


def test_unknown_user_and_bad_role(client, me):
    assert client.patch("/api/admin/users/9999", json={"role": "user"}).status_code == 404
    assert client.patch(f"/api/admin/users/{me['id']}", json={"role": "boss"}).status_code == 422


def test_registration_can_be_closed(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "allow_registration", False)
    # 最初の 1 人(パワーユーザー)は登録できる
    assert client.post("/api/auth/register", json={
        "email": "admin@example.com", "name": "管理者", "password": "password123", "department": ""}).status_code == 201
    # 2 人目からは 403
    r = client.post("/api/auth/register", json={
        "email": "late@example.com", "name": "遅刻", "password": "password123", "department": ""})
    assert r.status_code == 403
    # 通常のログインは影響を受けない
    assert client.post("/api/auth/login", json={"email": "admin@example.com", "password": "password123"}).status_code == 200


def test_startup_refuses_default_secret_when_secure(client, monkeypatch):
    import pytest
    from fastapi.testclient import TestClient

    from app.config import settings
    from app.main import app

    monkeypatch.setattr(settings, "cookie_secure", True)
    monkeypatch.setattr(settings, "secret_key", "change-me")
    with pytest.raises(RuntimeError):
        with TestClient(app):
            pass
