USER = {"email": "Taro@Example.com", "name": "太郎", "password": "password123", "department": "営業部"}


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
