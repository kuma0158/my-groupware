"""ウィジェットの種類の定義。

フロントの `frontend/src/lib/widgets.tsx` と対になっている。
新しいウィジェットを足すときは、両方に同じ type を追加する。
"""

WIDGET_TYPES: set[str] = {
    "stat.events",
    "stat.todos",
    "stat.notices",
    "stat.messages",
    "schedule.today",
    "todo.open",
    "notice.latest",
    "message.unhandled",
    "presence.board",
    "memo",
    "clock",
}

MAX_WIDGETS = 24

# 初回ログイン時の初期配置
DEFAULT_LAYOUT: list[dict] = [
    {"id": "w-stat-events", "type": "stat.events", "span": 1, "props": {}},
    {"id": "w-stat-todos", "type": "stat.todos", "span": 1, "props": {}},
    {"id": "w-stat-notices", "type": "stat.notices", "span": 1, "props": {}},
    {"id": "w-stat-messages", "type": "stat.messages", "span": 1, "props": {}},
    {"id": "w-schedule", "type": "schedule.today", "span": 2, "props": {}},
    {"id": "w-todo", "type": "todo.open", "span": 2, "props": {}},
    {"id": "w-notice", "type": "notice.latest", "span": 2, "props": {}},
    {"id": "w-message", "type": "message.unhandled", "span": 1, "props": {}},
    {"id": "w-presence", "type": "presence.board", "span": 1, "props": {}},
]
