def test_create_read_and_unread_flag(client, me, other):
    n = client.post("/api/notices", json={"title": "年末年始の休業", "body": "12/29〜1/3"}).json()
    assert n["author_name"] == "山田太郎"
    # 自分が書いたお知らせは最初から既読
    assert n["unread"] is False
    assert client.get("/api/notices").json()[0]["unread"] is False

    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    assert client.get("/api/notices").json()[0]["unread"] is True
    assert client.post(f"/api/notices/{n['id']}/read").status_code == 204
    assert client.get("/api/notices").json()[0]["unread"] is False
    # 二重に既読にしても壊れない
    assert client.post(f"/api/notices/{n['id']}/read").status_code == 204


def test_pinned_comes_first(client, me):
    client.post("/api/notices", json={"title": "通常のお知らせ"})
    client.post("/api/notices", json={"title": "重要なお知らせ", "pinned": True})
    assert client.get("/api/notices").json()[0]["title"] == "重要なお知らせ"


def test_delete_only_own_notice(client, me, other):
    n = client.post("/api/notices", json={"title": "自分の投稿"}).json()
    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    assert client.delete(f"/api/notices/{n['id']}").status_code == 403

    client.post("/api/auth/login", json={"email": "taro@example.com", "password": "password123"})
    assert client.delete(f"/api/notices/{n['id']}").status_code == 204
    assert client.get("/api/notices").json() == []


def test_requires_login(client):
    assert client.get("/api/notices").status_code == 401
