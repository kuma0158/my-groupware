from datetime import date, timedelta


def test_create_complete_and_filter(client, me):
    r = client.post("/api/todos", json={"title": "提案資料作成", "due_on": date.today().isoformat()})
    assert r.status_code == 201
    todo = r.json()
    assert todo["assignee_name"] == "山田太郎"  # 省略したら自分が担当

    assert client.patch(f"/api/todos/{todo['id']}", json={"done": True}).json()["done"] is True
    assert client.get("/api/todos").json() == []  # 既定では未完了のみ
    assert len(client.get("/api/todos?include_done=true").json()) == 1


def test_assign_to_other_and_both_can_edit(client, me, other):
    todo = client.post("/api/todos", json={"title": "見積もり確認", "assignee_id": other["id"]}).json()
    assert todo["assignee_name"] == "鈴木花子"

    # 担当者からも見えて、完了にできる
    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    assert [t["title"] for t in client.get("/api/todos").json()] == ["見積もり確認"]
    assert client.patch(f"/api/todos/{todo['id']}", json={"done": True}).status_code == 200


def test_due_order_puts_nearest_first(client, me):
    client.post("/api/todos", json={"title": "期限なし"})
    client.post("/api/todos", json={"title": "来週", "due_on": (date.today() + timedelta(days=7)).isoformat()})
    client.post("/api/todos", json={"title": "今日", "due_on": date.today().isoformat()})
    assert [t["title"] for t in client.get("/api/todos").json()] == ["今日", "来週", "期限なし"]


def test_unknown_assignee_is_rejected(client, me):
    assert client.post("/api/todos", json={"title": "x", "assignee_id": 999}).status_code == 400


def test_unrelated_user_cannot_edit(client, me, other):
    todo = client.post("/api/todos", json={"title": "自分のToDo"}).json()
    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    assert client.patch(f"/api/todos/{todo['id']}", json={"done": True}).status_code == 403
    assert client.delete(f"/api/todos/{todo['id']}").status_code == 403
