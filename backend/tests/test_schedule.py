from datetime import date, timedelta

TODAY = date.today().isoformat()


def test_create_and_list_week(client, me):
    r = client.post("/api/schedule", json={"title": "定例会議", "on_date": TODAY, "start_time": "09:00", "end_time": "10:00", "place": "会議室A"})
    assert r.status_code == 201
    assert r.json()["user_name"] == "山田太郎"

    week = client.get("/api/schedule/week").json()
    assert [e["title"] for e in week] == ["定例会議"]


def test_end_before_start_is_rejected(client, me):
    r = client.post("/api/schedule", json={"title": "逆転", "on_date": TODAY, "start_time": "15:00", "end_time": "09:00"})
    assert r.status_code == 400


def test_bad_time_format_is_rejected(client, me):
    assert client.post("/api/schedule", json={"title": "x", "on_date": TODAY, "start_time": "9時"}).status_code == 422


def test_private_event_hidden_from_others(client, me, other):
    client.post("/api/schedule", json={"title": "私用", "on_date": TODAY, "is_private": True})
    client.post("/api/schedule", json={"title": "公開予定", "on_date": TODAY})

    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    titles = [e["title"] for e in client.get("/api/schedule/week").json()]
    assert titles == ["公開予定"]


def test_delete_only_own_event(client, me, other):
    ev = client.post("/api/schedule", json={"title": "自分の予定", "on_date": TODAY}).json()
    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    assert client.delete(f"/api/schedule/{ev['id']}").status_code == 403

    client.post("/api/auth/login", json={"email": "taro@example.com", "password": "password123"})
    assert client.delete(f"/api/schedule/{ev['id']}").status_code == 204
    assert client.get("/api/schedule/week").json() == []


def test_other_week_is_not_returned(client, me):
    next_week = (date.today() + timedelta(days=14)).isoformat()
    client.post("/api/schedule", json={"title": "再来週", "on_date": next_week})
    assert client.get("/api/schedule/week").json() == []
    assert len(client.get(f"/api/schedule/week?start={next_week}").json()) == 1


def test_requires_login(client):
    assert client.get("/api/schedule/week").status_code == 401


def test_range_returns_events_in_period_only(client, me):
    d = date.today()
    client.post("/api/schedule", json={"title": "範囲内", "on_date": d.isoformat()})
    client.post("/api/schedule", json={"title": "範囲外", "on_date": (d + timedelta(days=30)).isoformat()})
    r = client.get("/api/schedule/range", params={"start": (d - timedelta(days=1)).isoformat(), "end": (d + timedelta(days=1)).isoformat()})
    assert [e["title"] for e in r.json()] == ["範囲内"]


def test_range_rejects_reversed_or_too_long(client, me):
    d = date.today()
    assert client.get("/api/schedule/range", params={"start": d.isoformat(), "end": (d - timedelta(days=1)).isoformat()}).status_code == 400
    assert client.get("/api/schedule/range", params={"start": d.isoformat(), "end": (d + timedelta(days=90)).isoformat()}).status_code == 400


def test_range_hides_private_from_others(client, me, other):
    client.post("/api/schedule", json={"title": "私用", "on_date": TODAY, "is_private": True})
    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    assert client.get("/api/schedule/range", params={"start": TODAY, "end": TODAY}).json() == []


def test_move_changes_date_and_times(client, me):
    ev = client.post("/api/schedule", json={"title": "会議", "on_date": TODAY, "start_time": "09:00", "end_time": "10:00"}).json()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    r = client.patch(f"/api/schedule/{ev['id']}", json={"on_date": tomorrow, "start_time": "13:15", "end_time": "14:15"})
    assert r.status_code == 200
    body = r.json()
    assert (body["on_date"], body["start_time"], body["end_time"], body["title"]) == (tomorrow, "13:15", "14:15", "会議")
    assert [e["on_date"] for e in client.get("/api/schedule/week", params={"start": tomorrow}).json()] == [tomorrow]


def test_move_date_only_keeps_times_and_empty_clears(client, me):
    ev = client.post("/api/schedule", json={"title": "会議", "on_date": TODAY, "start_time": "09:00", "end_time": "10:00"}).json()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    kept = client.patch(f"/api/schedule/{ev['id']}", json={"on_date": tomorrow}).json()
    assert (kept["start_time"], kept["end_time"]) == ("09:00", "10:00")
    cleared = client.patch(f"/api/schedule/{ev['id']}", json={"start_time": "", "end_time": ""}).json()
    assert (cleared["start_time"], cleared["end_time"]) == ("", "")


def test_move_rejects_bad_times(client, me):
    ev = client.post("/api/schedule", json={"title": "会議", "on_date": TODAY, "start_time": "09:00", "end_time": "10:00"}).json()
    assert client.patch(f"/api/schedule/{ev['id']}", json={"start_time": "11:00"}).status_code == 400  # 終了より後ろ
    assert client.patch(f"/api/schedule/{ev['id']}", json={"start_time": "9時"}).status_code == 422
    untimed = client.post("/api/schedule", json={"title": "終日", "on_date": TODAY}).json()
    assert client.patch(f"/api/schedule/{untimed['id']}", json={"end_time": "10:00"}).status_code == 400


def test_move_only_own_event_and_404(client, me, other):
    ev = client.post("/api/schedule", json={"title": "自分の予定", "on_date": TODAY}).json()
    assert client.patch("/api/schedule/99999", json={"on_date": TODAY}).status_code == 404
    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    assert client.patch(f"/api/schedule/{ev['id']}", json={"start_time": "10:00"}).status_code == 403


def test_patch_edits_title_place_and_private(client, me):
    ev = client.post("/api/schedule", json={"title": "会議", "on_date": TODAY, "start_time": "09:00", "end_time": "10:00", "place": "A室"}).json()
    r = client.patch(f"/api/schedule/{ev['id']}", json={"title": "打合せ", "place": "B室", "is_private": True})
    assert r.status_code == 200
    body = r.json()
    assert (body["title"], body["place"], body["is_private"]) == ("打合せ", "B室", True)
    # 触っていない項目はそのまま
    assert (body["on_date"], body["start_time"], body["end_time"]) == (TODAY, "09:00", "10:00")


def test_patch_can_clear_place_and_unset_private(client, me):
    ev = client.post("/api/schedule", json={"title": "会議", "on_date": TODAY, "place": "A室", "is_private": True}).json()
    body = client.patch(f"/api/schedule/{ev['id']}", json={"place": "", "is_private": False}).json()
    assert (body["place"], body["is_private"]) == ("", False)


def test_patch_rejects_empty_title(client, me):
    ev = client.post("/api/schedule", json={"title": "会議", "on_date": TODAY}).json()
    assert client.patch(f"/api/schedule/{ev['id']}", json={"title": ""}).status_code == 422
    assert client.get("/api/schedule/week").json()[0]["title"] == "会議"


def test_patch_title_only_on_own_event(client, me, other):
    ev = client.post("/api/schedule", json={"title": "自分の予定", "on_date": TODAY}).json()
    client.post("/api/auth/login", json={"email": "hanako@example.com", "password": "password123"})
    assert client.patch(f"/api/schedule/{ev['id']}", json={"title": "書き換え"}).status_code == 403
