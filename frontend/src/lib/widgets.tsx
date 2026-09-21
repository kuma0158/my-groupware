"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PRESENCE_LABEL, type Summary, type Widget } from "./types";

/** ウィジェットの中身に渡されるもの */
export type WidgetViewProps = {
  widget: Widget;
  summary: Summary;
  /** ウィジェット固有の設定を保存する(レイアウトと一緒にサーバーへ保存される) */
  setProps: (props: Record<string, string>) => void;
};

export type WidgetDef = {
  title: string;
  defaultSpan?: number;
  /** 本文をクリックしたときに開く画面。省略したウィジェットは遷移しない */
  href?: string;
  View: (props: WidgetViewProps) => React.ReactNode;
};

const empty = (text: string) => <p className="muted">{text}</p>;
const time = (s: string) => new Date(s).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });

/* ---------- 件数 ---------- */
function StatView({ statKey, summary }: { statKey: string; summary: Summary }) {
  const stat = summary.stats.find((s) => s.key === statKey);
  if (!stat) return empty("データがありません");
  return (
    <>
      <div className="value">{stat.value.toLocaleString("ja-JP")}</div>
      {/* ToDo では delta に期限切れの件数が入る */}
      {statKey === "todos" && stat.delta < 0 && <div className="down">期限切れ {-stat.delta} 件</div>}
    </>
  );
}

/* ---------- 今日の予定 ---------- */
function ScheduleView({ summary }: WidgetViewProps) {
  if (!summary.today_events.length) return empty("今日の予定はありません");
  return (
    <ul className="rows">
      {summary.today_events.map((e) => (
        <li key={e.id}>
          <span className="lead">{e.start_time || "終日"}</span>
          <span className="grow">{e.title}</span>
          <span className="sub-text">{e.place || e.user_name}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- 未完了のToDo ---------- */
function TodoView({ summary }: WidgetViewProps) {
  const today = new Date().toISOString().slice(0, 10);
  if (!summary.todos.length) return empty("未完了のToDoはありません");
  return (
    <ul className="rows">
      {summary.todos.map((t) => (
        <li key={t.id}>
          <span className="grow">{t.title}</span>
          <span className={t.due_on && t.due_on < today ? "down" : "sub-text"}>
            {t.due_on ? time(t.due_on) : "期限なし"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- お知らせ ---------- */
function NoticeView({ summary }: WidgetViewProps) {
  if (!summary.notices.length) return empty("お知らせはありません");
  return (
    <ul className="rows">
      {summary.notices.map((n) => (
        <li key={n.id}>
          {n.unread && <span className="badge">未読</span>}
          <Link className="grow" href="/dashboard/notices">{n.title}</Link>
          <span className="sub-text">{time(n.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- 伝言 ---------- */
function MessageView({ summary }: WidgetViewProps) {
  if (!summary.messages.length) return empty("未処理の伝言はありません");
  return (
    <ul className="rows">
      {summary.messages.map((m) => (
        <li key={m.id}>
          <span className="grow">{m.caller || m.from_name}</span>
          <span className="sub-text">{time(m.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- 在席状況 ---------- */
function PresenceView({ summary }: WidgetViewProps) {
  return (
    <ul className="rows">
      {summary.members.map((m) => (
        <li key={m.id}>
          <span className={`dot dot-${m.presence}`} aria-hidden="true" />
          <span className="grow">{m.name}</span>
          <span className="sub-text">{m.presence_note || PRESENCE_LABEL[m.presence]}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---------- 汎用 ---------- */
function MemoView({ widget, setProps }: WidgetViewProps) {
  return (
    <textarea
      className="memo"
      placeholder="メモを入力(自動保存されます)"
      defaultValue={widget.props.text ?? ""}
      onChange={(e) => setProps({ text: e.target.value })}
    />
  );
}

function ClockView() {
  const [now, setNow] = useState<Date | null>(null);
  // サーバーとクライアントで時刻がずれないよう、マウント後に表示を始める
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <div className="value">--:--:--</div>;
  return (
    <>
      <div className="value">{now.toLocaleTimeString("ja-JP")}</div>
      <div className="muted">{now.toLocaleDateString("ja-JP", { dateStyle: "full" })}</div>
    </>
  );
}

/* ---------- 登録表 ----------
   新しいウィジェットを足すときは、ここに1行追加し、
   backend/app/widgets.py の WIDGET_TYPES にも同じ type を追加する。 */

export const WIDGETS: Record<string, WidgetDef> = {
  "stat.events": { title: "今日の予定", href: "/dashboard/schedule", View: (p) => <StatView statKey="events" summary={p.summary} /> },
  "stat.todos": { title: "未完了のToDo", href: "/dashboard/todos", View: (p) => <StatView statKey="todos" summary={p.summary} /> },
  "stat.notices": { title: "未読のお知らせ", href: "/dashboard/notices", View: (p) => <StatView statKey="notices" summary={p.summary} /> },
  "stat.messages": { title: "未処理の伝言", href: "/dashboard/office", View: (p) => <StatView statKey="messages" summary={p.summary} /> },
  "schedule.today": { title: "今日の予定", defaultSpan: 2, href: "/dashboard/schedule", View: ScheduleView },
  "todo.open": { title: "ToDo", defaultSpan: 2, href: "/dashboard/todos", View: TodoView },
  "notice.latest": { title: "インフォメーション", defaultSpan: 2, href: "/dashboard/notices", View: NoticeView },
  "message.unhandled": { title: "伝言", href: "/dashboard/office", View: MessageView },
  "presence.board": { title: "在席状況", href: "/dashboard/office", View: PresenceView },
  memo: { title: "メモ", View: MemoView },
  clock: { title: "時計", View: ClockView },
};

export const WIDGET_LIST = Object.entries(WIDGETS).map(([type, def]) => ({ type, ...def }));
