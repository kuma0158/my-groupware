USER = {"email": "Taro@Example.com", "name": "太郎", "password": "password123", "department": "営業部"}
OTHER_USER = {"email": "hanako@example.com", "name": "花子", "password": "password123", "department": "総務部"}


def test_register_logs_in_and_me_works(client):
    r = client.post("/api/auth/register", json=USER)
    assert r.status_code == 201
    assert r.json()["email"] == "taro@example.com"  # 小文字に正規化
    assert "hashed_password" not in r.json()
    assert client.get("/api/auth/me").json()["name"] == "太郎"


def test_duplicate_email_is_rejected(client):
    client.post("/api/auth/register", json=USER)
    assert client.post("/api/auth/register", json=USER).status_code == 409


def test_short_password_is_rejected(client):
    r = client.post("/api/auth/register", json={**USER, "password": "short"})
    assert r.status_code == 422


def test_login_logout_flow(client):
    client.post("/api/auth/register", json=USER)
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401

    bad = client.post("/api/auth/login", json={"email": USER["email"], "password": "wrong-pass"})
    assert bad.status_code == 401

    ok = client.post("/api/auth/login", json={"email": USER["email"], "password": USER["password"]})
    assert ok.status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_dashboard_requires_login(client):
    assert client.get("/api/dashboard/summary").status_code == 401
    client.post("/api/auth/register", json=USER)
    r = client.get("/api/dashboard/summary")
    assert r.status_code == 200
    assert len(r.json()["stats"]) == 4


def test_layout_default_and_save(client):
    client.post("/api/auth/register", json=USER)

    # 初期状態ではデフォルト配置が返る
    r = client.get("/api/dashboard/layout")
    assert r.status_code == 200
    assert len(r.json()["widgets"]) > 0

    # 並べ替え・追加した結果を保存できる
    widgets = [
        {"id": "a", "type": "clock", "span": 1, "props": {}},
        {"id": "b", "type": "memo", "span": 2, "props": {"text": "買い物メモ"}},
    ]
    assert client.put("/api/dashboard/layout", json={"widgets": widgets}).status_code == 200
    saved = client.get("/api/dashboard/layout").json()["widgets"]
    assert [w["id"] for w in saved] == ["a", "b"]
    assert saved[1]["props"]["text"] == "買い物メモ"
    assert saved[1]["span"] == 2


def test_layout_rejects_unknown_type_and_duplicate_id(client):
    client.post("/api/auth/register", json=USER)
    bad_type = [{"id": "a", "type": "evil.widget", "span": 1, "props": {}}]
    assert client.put("/api/dashboard/layout", json={"widgets": bad_type}).status_code == 400
    dup = [
        {"id": "a", "type": "clock", "span": 1, "props": {}},
        {"id": "a", "type": "memo", "span": 1, "props": {}},
    ]
    assert client.put("/api/dashboard/layout", json={"widgets": dup}).status_code == 400


def test_layout_requires_login(client):
    assert client.get("/api/dashboard/layout").status_code == 401
    assert client.put("/api/dashboard/layout", json={"widgets": []}).status_code == 401


def test_login_is_locked_out_after_five_failures(client):
    client.post("/api/auth/register", json=USER)
    client.post("/api/auth/logout")

    bad = {"email": USER["email"], "password": "wrong-pass"}
    for _ in range(5):
        r = client.post("/api/auth/login", json=bad)
        assert r.status_code == 401

    # 6回目は、正しいパスワードでもロックされる
    locked = client.post("/api/auth/login", json={"email": USER["email"], "password": USER["password"]})
    assert locked.status_code == 429
    assert "Retry-After" in locked.headers
    assert client.get("/api/auth/me").status_code == 401

    # 別のアカウントはロックの影響を受けない
    client.post("/api/auth/register", json=OTHER_USER)
    client.post("/api/auth/logout")
    other_ok = client.post("/api/auth/login", json={"email": OTHER_USER["email"], "password": OTHER_USER["password"]})
    assert other_ok.status_code == 200


def test_login_success_resets_failure_count(client):
    client.post("/api/auth/register", json=USER)
    client.post("/api/auth/logout")

    bad = {"email": USER["email"], "password": "wrong-pass"}
    for _ in range(4):
        assert client.post("/api/auth/login", json=bad).status_code == 401

    ok = client.post("/api/auth/login", json={"email": USER["email"], "password": USER["password"]})
    assert ok.status_code == 200

    # 成功したので失敗カウントは0に戻り、再びログインできる
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": USER["email"], "password": USER["password"]}).status_code == 200


def test_register_is_locked_out_after_five_failures(client):
    client.post("/api/auth/register", json=USER)  # 既存の登録者を1人作る

    for _ in range(5):
        r = client.post("/api/auth/register", json=USER)  # 重複メールで失敗させる
        assert r.status_code == 409

    locked = client.post("/api/auth/register", json=OTHER_USER)  # 別メールでもIP単位でロックされる
    assert locked.status_code == 429
    assert "Retry-After" in locked.headers


def test_logout_revokes_old_token(client):
    assert client.post("/api/auth/register", json=USER).status_code == 201
    old_token = client.cookies.get("access_token")
    assert old_token
    assert client.post("/api/auth/logout").status_code == 204
    client.cookies.set("access_token", old_token)
    assert client.get("/api/auth/me").status_code == 401


def test_password_change_revokes_previous_token(client):
    assert client.post("/api/auth/register", json=USER).status_code == 201
    old_token = client.cookies.get("access_token")
    response = client.post("/api/auth/password", json={
        "current_password": "password123",
        "new_password": "newpassword123",
    })
    assert response.status_code == 204
    assert client.get("/api/auth/me").status_code == 200
    client.cookies.set("access_token", old_token)
    assert client.get("/api/auth/me").status_code == 401
    client.cookies.clear()
    assert client.post("/api/auth/login", json={
        "email": USER["email"], "password": "newpassword123"
    }).status_code == 200


def test_logout_with_invalid_cookie_still_clears_it(client):
    client.cookies.set("access_token", "not-a-token")
    response = client.post("/api/auth/logout")
    assert response.status_code == 204
    assert client.cookies.get("access_token") is None


def test_signed_token_without_expiration_is_rejected(client):
    import jwt
    from app.config import settings

    assert client.post("/api/auth/register", json=USER).status_code == 201
    user_id = client.get("/api/auth/me").json()["id"]
    bad_token = jwt.encode({"sub": str(user_id), "ver": 0}, settings.secret_key, algorithm=settings.algorithm)
    client.cookies.set("access_token", bad_token)
    assert client.get("/api/auth/me").status_code == 401


def test_legacy_signed_token_without_version_is_rejected(client):
    import jwt
    from datetime import datetime, timedelta, timezone
    from app.config import settings

    assert client.post("/api/auth/register", json=USER).status_code == 201
    user_id = client.get("/api/auth/me").json()["id"]
    bad_token = jwt.encode({
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }, settings.secret_key, algorithm=settings.algorithm)
    client.cookies.set("access_token", bad_token)
    assert client.get("/api/auth/me").status_code == 401


def test_cross_origin_changes_are_blocked(client):
    assert client.post("/api/auth/register", json=USER).status_code == 201
    response = client.patch("/api/auth/me",
        headers={"Origin": "https://untrusted.example"},
        json={"name": "改ざん"})
    assert response.status_code == 403
    assert client.get("/api/auth/me").json()["name"] == USER["name"]


def test_missing_origin_changes_are_blocked(client):
    response = client.post("/api/auth/login",
        headers={"Origin": ""},
        json={"email": USER["email"], "password": USER["password"]})
    assert response.status_code == 403
