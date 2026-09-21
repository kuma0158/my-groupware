def test_presence_update_and_member_list(client, me, other):
    r = client.put("/api/presence", json={"presence": "out", "presence_note": "15時に戻ります"})
    assert r.status_code == 200
    assert r.json()["presence"] == "out"

    members = client.get("/api/members").json()
    mine = next(m for m in members if m["name"] == "山田太郎")
    assert mine["presence_note"] == "15時に戻ります"
    assert mine["department"] == "営業部"
    assert "email" not in mine  # 名簿にメールアドレスは出さない


def test_unknown_presence_is_rejected(client, me):
    assert client.put("/api/presence", json={"presence": "寝てる"}).status_code == 422


def test_message_flow(client, me, other):
    r = client.post("/api/messages", json={"to_user_id": other["id"], "caller": "みなと商事 佐藤様", "body": "折り返し希望"})
    assert r.status_code == 201
    assert client.get("/api/messages").json() == []  # 自分あてではない

    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    msgs = client.get("/api/messages").json()
    assert len(msgs) == 1
    assert msgs[0]["from_name"] == "山田太郎"
    assert msgs[0]["caller"] == "みなと商事 佐藤様"

    assert client.post(f"/api/messages/{msgs[0]['id']}/handled").status_code == 204
    assert client.get("/api/messages").json() == []
    assert len(client.get("/api/messages?include_handled=true").json()) == 1


def test_cannot_handle_others_message(client, me, other):
    m = client.post("/api/messages", json={"to_user_id": other["id"], "body": "x"}).json()
    assert client.post(f"/api/messages/{m['id']}/handled").status_code == 403


def test_unknown_recipient_is_rejected(client, me):
    assert client.post("/api/messages", json={"to_user_id": 999, "body": "x"}).status_code == 400
