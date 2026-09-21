from fastapi import APIRouter, HTTPException, status

from ..crud import notices_for
from ..deps import CurrentUser, DbSession
from ..models import Notice, NoticeRead
from ..schemas import NoticeIn, NoticeOut

router = APIRouter(prefix="/api/notices", tags=["notices"])


@router.get("", response_model=list[NoticeOut])
def index(user: CurrentUser, db: DbSession):
    return notices_for(db, user)


@router.post("", response_model=NoticeOut, status_code=status.HTTP_201_CREATED)
def create(data: NoticeIn, user: CurrentUser, db: DbSession):
    n = Notice(author_id=user.id, **data.model_dump())
    db.add(n)
    db.commit()
    db.refresh(n)
    return NoticeOut(
        id=n.id, title=n.title, body=n.body, pinned=n.pinned, author_id=n.author_id,
        author_name=user.name, created_at=n.created_at, unread=False,
    )


@router.post("/{notice_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(notice_id: int, user: CurrentUser, db: DbSession):
    if db.get(Notice, notice_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "お知らせが見つかりません")
    if db.get(NoticeRead, (notice_id, user.id)) is None:
        db.add(NoticeRead(notice_id=notice_id, user_id=user.id))
        db.commit()


@router.delete("/{notice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(notice_id: int, user: CurrentUser, db: DbSession):
    n = db.get(Notice, notice_id)
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "お知らせが見つかりません")
    if n.author_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "自分が書いたお知らせだけ削除できます")
    for r in db.query(NoticeRead).filter(NoticeRead.notice_id == notice_id):
        db.delete(r)
    db.delete(n)
    db.commit()
