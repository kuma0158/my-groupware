from datetime import date, timedelta


def test_summary_counts_reflect_data(client, me, other):
    client.post("/api/schedule", json={"title": "打ち合わせ", "on_date": date.today().isoformat()})
    client.post("/api/todos", json={"title": "期限切れ", "due_on": (date.today() - timedelta(days=2)).isoformat()})
    client.post("/api/todos", json={"title": "通常"})

    # 別の人からお知らせと伝言をもらう(自分が書いたお知らせは未読に数えない)
    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    client.post("/api/notices", json={"title": "お知らせ"})
    client.post("/api/messages", json={"to_user_id": me["id"], "caller": "取引先", "body": "電話ください"})
    client.post("/api/auth/login", json={"email": "taro@example.com", "password": "password123"})

    s = client.get("/api/dashboard/summary").json()
    stats = {x["key"]: x for x in s["stats"]}
    assert stats["events"]["value"] == 1
    assert stats["todos"]["value"] == 2
    assert stats["todos"]["delta"] == -1  # 期限切れの件数
    assert stats["notices"]["value"] == 1
    assert stats["messages"]["value"] == 1
    assert len(s["members"]) == 2
    assert s["messages"][0]["from_name"] == "鈴木花子"


def test_layout_default_and_save(client, me):
    assert len(client.get("/api/dashboard/layout").json()["widgets"]) > 0
    widgets = [
        {"id": "a", "type": "clock", "span": 1, "props": {}},
        {"id": "b", "type": "memo", "span": 2, "props": {"text": "メモ"}},
    ]
    assert client.put("/api/dashboard/layout", json={"widgets": widgets}).status_code == 200
    saved = client.get("/api/dashboard/layout").json()["widgets"]
    assert [w["id"] for w in saved] == ["a", "b"]
    assert saved[1]["props"]["text"] == "メモ"


def test_layout_rejects_unknown_type(client, me):
    bad = [{"id": "a", "type": "evil.widget", "span": 1, "props": {}}]
    assert client.put("/api/dashboard/layout", json={"widgets": bad}).status_code == 400


def test_requires_login(client):
    assert client.get("/api/dashboard/summary").status_code == 401


def test_badges_count_unread_notices_and_messages(client, me, other):
    assert client.get("/api/dashboard/badges").json() == {"todos": 0, "notices": 0, "messages": 0}

    n = client.post("/api/notices", json={"title": "お知らせ"}).json()
    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    client.post("/api/messages", json={"to_user_id": me["id"], "caller": "取引先", "body": "電話ください"})
    client.post("/api/auth/login", json={"email": "taro@example.com", "password": "password123"})

    # 自分が書いたお知らせは数えない
    assert client.get("/api/dashboard/badges").json() == {"todos": 0, "notices": 0, "messages": 1}

    # 他人のお知らせは、読むまで未読として数える
    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    assert client.get("/api/dashboard/badges").json()["notices"] == 1
    client.post(f"/api/notices/{n['id']}/read")
    assert client.get("/api/dashboard/badges").json()["notices"] == 0
    client.post("/api/auth/login", json={"email": "taro@example.com", "password": "password123"})


def test_badges_message_count_is_per_user(client, me, other):
    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    client.post("/api/messages", json={"to_user_id": me["id"], "caller": "取引先", "body": "電話ください"})
    # 宛先ではない人には数えない
    assert client.get("/api/dashboard/badges").json()["messages"] == 0

    client.post("/api/auth/login", json={"email": "taro@example.com", "password": "password123"})
    msg = client.get("/api/messages").json()[0]
    assert client.get("/api/dashboard/badges").json()["messages"] == 1
    client.post(f"/api/messages/{msg['id']}/handled")
    assert client.get("/api/dashboard/badges").json()["messages"] == 0


def test_badges_needs_login(client):
    assert client.get("/api/dashboard/badges").status_code == 401


def test_badges_count_open_todos(client, me, other):
    t = client.post("/api/todos", json={"title": "やること"}).json()
    client.post("/api/todos", json={"title": "もうひとつ"})
    assert client.get("/api/dashboard/badges").json()["todos"] == 2

    client.patch(f"/api/todos/{t['id']}", json={"done": True})
    assert client.get("/api/dashboard/badges").json()["todos"] == 1


def test_badges_todo_count_follows_assignee(client, me, other):
    # 相手を担当にしたToDo。登録者は自分なので、どちらにも数える
    client.post("/api/todos", json={"title": "お願い", "assignee_id": other["id"]})
    assert client.get("/api/dashboard/badges").json()["todos"] == 1

    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    assert client.get("/api/dashboard/badges").json()["todos"] == 1
