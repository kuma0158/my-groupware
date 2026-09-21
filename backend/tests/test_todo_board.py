"""ToDo のカンバン(列・カードの移動と並び順)のテスト。"""

from datetime import date


def _cols(client):
    return client.get("/api/todo-columns").json()


def _titles(client, column_id):
    todos = [t for t in client.get("/api/todos?include_done=true").json() if t["column_id"] == column_id]
    return [t["title"] for t in sorted(todos, key=lambda t: (t["position"], t["id"]))]


def _login_hanako(client):
    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})


def test_default_columns_are_created(client, me):
    cols = _cols(client)
    assert [(c["name"], c["is_done"]) for c in cols] == [("未着手", False), ("進行中", False), ("完了", True)]


def test_new_todo_goes_to_first_open_column_at_the_end(client, me):
    todo_col = _cols(client)[0]["id"]
    for name in ("A", "B", "C"):
        t = client.post("/api/todos", json={"title": name}).json()
        assert t["column_id"] == todo_col
    assert _titles(client, todo_col) == ["A", "B", "C"]


def test_move_between_columns_syncs_done(client, me):
    todo, doing, done = _cols(client)
    t = client.post("/api/todos", json={"title": "資料"}).json()

    moved = client.post(f"/api/todos/{t['id']}/move", json={"column_id": done["id"]}).json()
    assert moved["done"] is True and moved["column_id"] == done["id"]
    assert client.get("/api/todos").json() == []  # 完了は既定の一覧から外れる

    back = client.post(f"/api/todos/{t['id']}/move", json={"column_id": doing["id"]}).json()
    assert back["done"] is False


def test_move_before_card_reorders(client, me):
    todo, doing, _ = _cols(client)
    ids = {n: client.post("/api/todos", json={"title": n}).json()["id"] for n in ("A", "B", "C")}
    # C を A の手前へ
    client.post(f"/api/todos/{ids['C']}/move", json={"column_id": todo["id"], "before_id": ids["A"]})
    assert _titles(client, todo["id"]) == ["C", "A", "B"]
    # B を別の列へ、続けて A の手前に戻す
    client.post(f"/api/todos/{ids['B']}/move", json={"column_id": doing["id"]})
    assert _titles(client, doing["id"]) == ["B"]
    client.post(f"/api/todos/{ids['B']}/move", json={"column_id": todo["id"], "before_id": ids["A"]})
    assert _titles(client, todo["id"]) == ["C", "B", "A"]
    assert _titles(client, doing["id"]) == []


def test_move_validates_target(client, me):
    todo, doing, _ = _cols(client)
    a = client.post("/api/todos", json={"title": "A"}).json()
    b = client.post("/api/todos", json={"title": "B"}).json()
    client.post(f"/api/todos/{b['id']}/move", json={"column_id": doing["id"]})
    assert client.post(f"/api/todos/{a['id']}/move", json={"column_id": 999}).status_code == 400
    # before_id は移動先の列にあるカードでなければならない
    assert client.post(f"/api/todos/{a['id']}/move", json={"column_id": todo["id"], "before_id": b["id"]}).status_code == 400
    assert client.post(f"/api/todos/{a['id']}/move", json={"column_id": todo["id"], "before_id": a["id"]}).status_code == 400


def test_cannot_move_someone_elses_todo(client, me, other):
    todo = _cols(client)[0]
    t = client.post("/api/todos", json={"title": "自分の"}).json()
    _login_hanako(client)
    assert client.post(f"/api/todos/{t['id']}/move", json={"column_id": todo["id"]}).status_code == 403


def test_invisible_cards_keep_their_place(client, me, other):
    """他人のToDoが同じ列に居ても、見えているカードの手前に置ける。"""
    todo = _cols(client)[0]
    a = client.post("/api/todos", json={"title": "自分A"}).json()
    _login_hanako(client)
    client.post("/api/todos", json={"title": "花子の"})  # 太郎からは見えない
    client.post("/api/auth/login", json={"email": "taro@example.com", "password": "password123"})
    b = client.post("/api/todos", json={"title": "自分B"}).json()
    client.post(f"/api/todos/{b['id']}/move", json={"column_id": todo["id"], "before_id": a["id"]})
    visible = [t["title"] for t in sorted(client.get("/api/todos").json(), key=lambda t: t["position"])]
    assert visible == ["自分B", "自分A"]


def test_patch_note_clear_due_and_column(client, me):
    todo, doing, done = _cols(client)
    t = client.post("/api/todos", json={"title": "詳細", "due_on": date.today().isoformat()}).json()
    r = client.patch(f"/api/todos/{t['id']}", json={"note": "メモです", "due_on": None, "column_id": doing["id"]}).json()
    assert r["note"] == "メモです" and r["due_on"] is None and r["column_id"] == doing["id"]
    # 空の件名は受け付けない。件名を送らなければ変わらない
    assert client.patch(f"/api/todos/{t['id']}", json={"title": ""}).status_code == 422
    assert client.patch(f"/api/todos/{t['id']}", json={"note": "更新"}).json()["title"] == "詳細"
    # 完了列へ移すと done になる
    assert client.patch(f"/api/todos/{t['id']}", json={"column_id": done["id"]}).json()["done"] is True


def test_patch_done_moves_between_kinds(client, me):
    todo, _, done = _cols(client)
    t = client.post("/api/todos", json={"title": "x"}).json()
    r = client.patch(f"/api/todos/{t['id']}", json={"done": True}).json()
    assert r["column_id"] == done["id"]
    r = client.patch(f"/api/todos/{t['id']}", json={"done": False}).json()
    assert r["column_id"] == todo["id"] and r["done"] is False


def test_create_in_done_column(client, me):
    done = _cols(client)[2]
    t = client.post("/api/todos", json={"title": "済み", "column_id": done["id"]}).json()
    assert t["done"] is True


def test_column_crud_and_reorder(client, me):
    todo, doing, done = _cols(client)
    r = client.post("/api/todo-columns", json={"name": "  レビュー中  "})
    assert r.status_code == 201 and r.json()["name"] == "レビュー中" and r.json()["position"] == 3
    review = r.json()
    assert client.patch(f"/api/todo-columns/{review['id']}", json={"name": "確認待ち"}).json()["name"] == "確認待ち"
    assert client.post("/api/todo-columns", json={"name": "  "}).status_code == 422

    order = [review["id"], todo["id"], doing["id"], done["id"]]
    assert [c["id"] for c in client.put("/api/todo-columns/order", json={"ids": order}).json()] == order
    assert client.put("/api/todo-columns/order", json={"ids": order[:-1]}).status_code == 400


def test_column_limit(client, me):
    for i in range(9):
        assert client.post("/api/todo-columns", json={"name": f"列{i}"}).status_code == 201
    assert client.post("/api/todo-columns", json={"name": "あふれ"}).status_code == 400


def test_delete_column_moves_cards_to_same_kind(client, me):
    todo, doing, done = _cols(client)
    client.post("/api/todos", json={"title": "A"})
    client.post("/api/todos", json={"title": "B", "column_id": doing["id"]})
    assert client.delete(f"/api/todo-columns/{doing['id']}").status_code == 204
    assert [c["position"] for c in _cols(client)] == [0, 1]
    assert _titles(client, todo["id"]) == ["A", "B"]  # 進行中のカードは、左の未完了の列の末尾へ
    assert all(t["done"] is False for t in client.get("/api/todos").json())


def test_last_done_or_open_column_cannot_be_removed(client, me):
    todo, doing, done = _cols(client)
    assert client.delete(f"/api/todo-columns/{done['id']}").status_code == 400
    assert client.patch(f"/api/todo-columns/{done['id']}", json={"is_done": False}).status_code == 400
    client.delete(f"/api/todo-columns/{doing['id']}")
    assert client.delete(f"/api/todo-columns/{todo['id']}").status_code == 400


def test_changing_column_kind_syncs_cards(client, me):
    _, doing, _ = _cols(client)
    client.post("/api/todos", json={"title": "x", "column_id": doing["id"]})
    assert client.patch(f"/api/todo-columns/{doing['id']}", json={"is_done": True}).status_code == 200
    assert client.get("/api/todos?include_done=true").json()[0]["done"] is True


def test_badge_counts_follow_columns(client, me):
    """完了列へ動かすとバッジの未完了ToDo数が減る(バッジは done を数えている)。"""
    _, _, done = _cols(client)
    t = client.post("/api/todos", json={"title": "x"}).json()
    assert client.get("/api/dashboard/badges").json()["todos"] == 1
    client.post(f"/api/todos/{t['id']}/move", json={"column_id": done["id"]})
    assert client.get("/api/dashboard/badges").json()["todos"] == 0


# ---------- 共有 ----------


def test_others_cards_are_hidden_until_shared(client, me, other):
    t = client.post("/api/todos", json={"title": "秘密の資料"}).json()
    _login_hanako(client)
    assert client.get("/api/todos").json() == []
    assert client.patch(f"/api/todos/{t['id']}", json={"title": "x"}).status_code == 403

    client.post("/api/auth/login", json={"email": "taro@example.com", "password": "password123"})
    shared = client.put(f"/api/todos/{t['id']}/shares", json={"user_ids": [other["id"]]}).json()
    assert shared["shared_with"] == [other["id"]]

    _login_hanako(client)
    assert [x["title"] for x in client.get("/api/todos").json()] == ["秘密の資料"]
    assert client.get("/api/dashboard/badges").json()["todos"] == 1
    # 共有された人は動かせるが、削除と共有の変更はできない
    todo, doing, _ = _cols(client)
    assert client.post(f"/api/todos/{t['id']}/move", json={"column_id": doing["id"]}).status_code == 200
    assert client.delete(f"/api/todos/{t['id']}").status_code == 403
    assert client.put(f"/api/todos/{t['id']}/shares", json={"user_ids": []}).status_code == 403


def test_unshare_hides_card_again(client, me, other):
    t = client.post("/api/todos", json={"title": "A"}).json()
    client.put(f"/api/todos/{t['id']}/shares", json={"user_ids": [other["id"]]})
    client.put(f"/api/todos/{t['id']}/shares", json={"user_ids": []})
    _login_hanako(client)
    assert client.get("/api/todos").json() == []


def test_share_rejects_unknown_user_and_ignores_self(client, me, other):
    t = client.post("/api/todos", json={"title": "A"}).json()
    assert client.put(f"/api/todos/{t['id']}/shares", json={"user_ids": [9999]}).status_code == 400
    out = client.put(f"/api/todos/{t['id']}/shares", json={"user_ids": [me["id"], other["id"]]}).json()
    assert out["shared_with"] == [other["id"]]


def test_deleting_shared_todo_removes_shares(client, me, other):
    t = client.post("/api/todos", json={"title": "A"}).json()
    client.put(f"/api/todos/{t['id']}/shares", json={"user_ids": [other["id"]]})
    assert client.delete(f"/api/todos/{t['id']}").status_code == 204
    t2 = client.post("/api/todos", json={"title": "B"}).json()
    assert client.get("/api/todos").json()[0]["shared_with"] == []
    assert t2["shared_with"] == []
