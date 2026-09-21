import json
from datetime import date

from fastapi import APIRouter, HTTPException, status

from ..crud import badge_counts, events_between, members, messages_for, notices_for, todos_for
from ..deps import CurrentUser, DbSession
from ..models import DashboardLayout
from ..schemas import BadgeOut, LayoutIn, LayoutOut, StatOut, SummaryOut, WidgetIn
from ..widgets import DEFAULT_LAYOUT, WIDGET_TYPES

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=SummaryOut)
def summary(user: CurrentUser, db: DbSession):
    """ダッシュボードの全ウィジェット分をまとめて返す。

    ウィジェットごとにAPIを分けると画面表示で何度も往復するため、
    件数の軽いうちは1回で取得する。重い集計を足すときは分ける。
    """
    today = date.today()
    today_events = events_between(db, user, today, today)
    todos = todos_for(db, user)
    notices = notices_for(db, user, limit=10)
    msgs = messages_for(db, user)

    overdue = [t for t in todos if t.due_on and t.due_on < today]
    return SummaryOut(
        stats=[
            StatOut(key="events", label="今日の予定", value=len(today_events)),
            StatOut(key="todos", label="未完了のToDo", value=len(todos), delta=-len(overdue)),
            StatOut(key="notices", label="未読のお知らせ", value=len([n for n in notices if n.unread])),
            StatOut(key="messages", label="未処理の伝言", value=len(msgs)),
        ],
        today_events=today_events,
        todos=todos[:8],
        notices=notices[:5],
        messages=msgs[:5],
        members=members(db),
    )


@router.get("/badges", response_model=BadgeOut)
def badges(user: CurrentUser, db: DbSession):
    """メニューのバッジ用の件数。"""
    return badge_counts(db, user)


@router.get("/layout", response_model=LayoutOut)
def get_layout(user: CurrentUser, db: DbSession):
    row = db.get(DashboardLayout, user.id)
    if row is None or not row.data:
        return LayoutOut(widgets=[WidgetIn(**w) for w in DEFAULT_LAYOUT])
    try:
        saved = json.loads(row.data)
        # 定義が消えたウィジェットは黙って除外する(古い保存データへの備え)
        return LayoutOut(widgets=[WidgetIn(**w) for w in saved if w.get("type") in WIDGET_TYPES])
    except (json.JSONDecodeError, TypeError, ValueError):
        return LayoutOut(widgets=[WidgetIn(**w) for w in DEFAULT_LAYOUT])


@router.put("/layout", response_model=LayoutOut)
def save_layout(data: LayoutIn, user: CurrentUser, db: DbSession):
    unknown = {w.type for w in data.widgets} - WIDGET_TYPES
    if unknown:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"未定義のウィジェットです: {', '.join(sorted(unknown))}")
    if len({w.id for w in data.widgets}) != len(data.widgets):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "ウィジェットIDが重複しています")

    payload = json.dumps([w.model_dump() for w in data.widgets], ensure_ascii=False)
    row = db.get(DashboardLayout, user.id)
    if row is None:
        db.add(DashboardLayout(user_id=user.id, data=payload))
    else:
        row.data = payload
    db.commit()
    return LayoutOut(widgets=data.widgets)
