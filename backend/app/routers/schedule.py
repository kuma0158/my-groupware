from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, status

from ..crud import events_between
from ..deps import CurrentUser, DbSession
from ..models import Event
from ..schemas import EventIn, EventOut, EventPatch

router = APIRouter(prefix="/api/schedule", tags=["schedule"])


def week_start(d: date) -> date:
    """その日を含む週の月曜日"""
    return d - timedelta(days=d.weekday())


@router.get("/week", response_model=list[EventOut])
def week(user: CurrentUser, db: DbSession, start: date | None = None, user_id: int | None = None):
    """週の予定。start を省略すると今週。user_id を指定するとその人の分だけ。"""
    s = week_start(start or date.today())
    return events_between(db, user, s, s + timedelta(days=6), user_id)


MAX_RANGE_DAYS = 62


@router.get("/range", response_model=list[EventOut])
def range_(user: CurrentUser, db: DbSession, start: date, end: date, user_id: int | None = None):
    """期間 start〜end(両端含む)の予定。月表示・週表示のカレンダー用。"""
    if end < start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "終了日が開始日より前になっています")
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"期間は{MAX_RANGE_DAYS}日以内で指定してください")
    return events_between(db, user, start, end, user_id)


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create(data: EventIn, user: CurrentUser, db: DbSession):
    if data.start_time and data.end_time and data.end_time < data.start_time:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "終了時刻が開始時刻より前になっています")
    e = Event(user_id=user.id, **data.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return EventOut(**{c.name: getattr(e, c.name) for c in Event.__table__.columns if c.name != "created_at"},
                    user_name=user.name)


@router.patch("/{event_id}", response_model=EventOut)
def update(event_id: int, data: EventPatch, user: CurrentUser, db: DbSession):
    """自分の予定を変える。送られた項目だけを書き換える。"""
    e = db.get(Event, event_id)
    if e is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "予定が見つかりません")
    if e.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "自分の予定だけ変更できます")
    changes = data.model_dump(exclude_unset=True, exclude_none=True)
    start = changes.get("start_time", e.start_time)
    end = changes.get("end_time", e.end_time)
    if start and end and end < start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "終了時刻が開始時刻より前になっています")
    if end and not start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "終了時刻だけの予定にはできません")
    for k, v in changes.items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return EventOut(**{c.name: getattr(e, c.name) for c in Event.__table__.columns if c.name != "created_at"},
                    user_name=user.name)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(event_id: int, user: CurrentUser, db: DbSession):
    e = db.get(Event, event_id)
    if e is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "予定が見つかりません")
    if e.user_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "自分の予定だけ削除できます")
    db.delete(e)
    db.commit()
