"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { hhmm, toMin } from "@/lib/time";
import type { Event } from "@/lib/types";
import EventForm, { type EventInput } from "./EventForm";
import Modal from "./Modal";

type Mode = "month" | "week";
type Panel = { kind: "add"; date: string; start: string } | { kind: "view"; event: Event } | null;

const DAYS = ["月", "火", "水", "木", "金", "土", "日"];
const HOUR_PX = 48; // 週表示の1時間あたりの高さ
const DEFAULT_MINUTES = 60; // 終了時刻なしの予定を描く長さ
const MIN_MINUTES = 30; // 短すぎる予定でも読める最低の高さ
const MONTH_CHIPS = 3; // 月表示で1日に並べる予定の数
const SNAP_MIN = 15; // ドラッグで動かすときの時刻の刻み
const MOUSE_THRESHOLD = 5; // マウスでドラッグ開始とみなす移動量(px)
const LONG_PRESS_MS = 350; // スマホで長押しと判定するまでの時間
const SCROLL_THRESHOLD = 12; // 長押し前にこれ以上動いたらスクロール操作とみなす
const EDGE_PX = 30; // 週表示の上下端に近づくと自動スクロールする距離

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
/** その日を含む週の月曜日(バックエンドの week_start と同じ規則) */
function weekStart(d: Date) {
  const x = addDays(d, -((d.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}
/** 表示範囲。月表示は月初を含む週の月曜〜月末を含む週の日曜 */
function rangeOf(mode: Mode, cursor: Date): [Date, Date] {
  if (mode === "week") {
    const s = weekStart(cursor);
    return [s, addDays(s, 6)];
  }
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  return [weekStart(first), addDays(weekStart(last), 6)];
}

/** ドラッグ中のポインタが指している場所。週の時間枠なら分、それ以外は日付だけ */
type Target = { kind: "col" | "allday" | "cell"; date: string; min: number };
type Move = { on_date: string; start_time: string; end_time: string };
type Drag = {
  ev: Event;
  startX: number;
  startY: number;
  grabY: number; // 週の予定ブロックの上端から見た、つかんだ位置
  touch: boolean;
  active: boolean;
  timer: number;
};

/** 予定を目的の場所へ動かしたあとの日付・時刻。月表示は日付だけ、時間枠は所要時間を保つ */
function moveTo(ev: Event, t: Target): Move {
  if (t.kind === "cell") return { on_date: t.date, start_time: ev.start_time, end_time: ev.end_time };
  if (t.kind === "allday") return { on_date: t.date, start_time: "", end_time: "" };
  const dur = ev.start_time && ev.end_time && toMin(ev.end_time) > toMin(ev.start_time) ? toMin(ev.end_time) - toMin(ev.start_time) : 0;
  const start = Math.max(0, Math.min(t.min, 24 * 60 - 1 - dur)); // 終了が翌日にはみ出さないようにする
  return { on_date: t.date, start_time: hhmm(start), end_time: dur ? hhmm(start + dur) : "" };
}
const dayClass = (i: number) => (i === 5 ? " sat" : i === 6 ? " sun" : "");

/** 同じ日の重なる予定を横に並べるための列番号を振る */
function layoutDay(list: Event[]) {
  const items = list
    .map((e) => {
      const s = toMin(e.start_time);
      const end = e.end_time && toMin(e.end_time) > s ? toMin(e.end_time) : s + DEFAULT_MINUTES;
      return { e, s, end: Math.max(end, s + MIN_MINUTES), col: 0, cols: 1 };
    })
    .sort((a, b) => a.s - b.s || a.end - b.end);
  let group: typeof items = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.max(0, ...group.map((g) => g.col)) + 1;
    group.forEach((g) => (g.cols = cols));
    group = [];
  };
  for (const it of items) {
    if (group.length && it.s >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const used = new Set(group.filter((g) => g.end > it.s).map((g) => g.col));
    while (used.has(it.col)) it.col++;
    group.push(it);
    groupEnd = Math.max(groupEnd, it.end);
  }
  flush();
  return items;
}

export default function ScheduleCalendar({ initial, meId }: { initial: Event[]; meId: number }) {
  const [mode, setMode] = useState<Mode>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState(initial);
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState("");
  const firstLoad = useRef(true);
  const gridRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const justDragged = useRef(false); // ドラッグ直後のクリックを無視するため
  const [dragging, setDragging] = useState<Event | null>(null);
  const [target, setTarget] = useState<Target | null>(null);

  const [from, to] = rangeOf(mode, cursor);
  const fromKey = iso(from);
  const toKey = iso(to);
  const todayKey = iso(new Date());
  const days = Array.from({ length: Math.round((to.getTime() - from.getTime()) / 86400000) + 1 }, (_, i) => addDays(from, i));

  // 表示範囲が変わるたびに取り直す。最初の1回は、サーバーが渡した今週分をそのまま使う
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    let stale = false;
    api.rangeEvents(fromKey, toKey).then(
      (list) => !stale && setEvents(list),
      (err) => !stale && setError(err instanceof Error ? err.message : "予定を取得できませんでした"),
    );
    return () => {
      stale = true;
    };
  }, [fromKey, toKey]);

  // 週表示を開いたら、仕事始めの時間帯が見える位置までスクロールしておく
  useEffect(() => {
    if (mode === "week" && gridRef.current) gridRef.current.scrollTop = 7.5 * HOUR_PX;
  }, [mode]);

  function move(dir: -1 | 1) {
    setPanel(null);
    setError("");
    setCursor((c) => (mode === "week" ? addDays(c, dir * 7) : new Date(c.getFullYear(), c.getMonth() + dir, 1)));
  }
  function switchMode(next: Mode, on?: Date) {
    setPanel(null);
    setMode(next);
    if (on) setCursor(on);
  }

  /** 追加パネルを開く(ドラッグ直後のクリックでは開かない) */
  function addAt(date: string, start: string) {
    if (justDragged.current) return;
    setError("");
    setPanel({ kind: "add", date, start });
  }
  function view(e: Event) {
    if (justDragged.current) return;
    setError("");
    setPanel({ kind: "view", event: e });
  }

  /**
   * 他の人の予定をつかんだとき。動かせる予定と見分けが付かないまま無反応だと
   * 壊れたように見えるので、実際に動かそうとした時点で理由を知らせる。
   * スマホでは指を置いて動かすのは普通のスクロールなので、長押ししたときだけ知らせる。
   */
  function hintNotMine(e: React.PointerEvent) {
    const [x, y] = [e.clientX, e.clientY];
    const touch = e.pointerType !== "mouse";
    let hinted = false;
    const hint = () => {
      hinted = true;
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      setError("他の人の予定は動かせません。動かせるのは自分の予定だけです。");
    };
    const timer = touch ? window.setTimeout(hint, LONG_PRESS_MS) : 0;
    const stop = () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      if (hinted) {
        // 離したときのクリックで詳細が開いて、知らせた理由が消えないようにする
        justDragged.current = true;
        window.setTimeout(() => (justDragged.current = false), 0);
      }
    };
    const onMove = (m: PointerEvent) => {
      if (hinted) return;
      const dist = Math.hypot(m.clientX - x, m.clientY - y);
      if (touch) {
        if (dist > SCROLL_THRESHOLD) stop(); // 長押し前に動いた = スクロール
      } else if (dist > MOUSE_THRESHOLD) hint();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  async function applyMove(ev: Event, to: Target) {
    const next = moveTo(ev, to);
    if (next.on_date === ev.on_date && next.start_time === ev.start_time && next.end_time === ev.end_time) return;
    setError("");
    setEvents((prev) => prev.map((x) => (x.id === ev.id ? { ...x, ...next } : x))); // 先に動かして見せる
    try {
      const saved = await api.patchEvent(ev.id, next);
      setEvents((prev) => prev.map((x) => (x.id === ev.id ? saved : x)));
    } catch (err) {
      setEvents((prev) => prev.map((x) => (x.id === ev.id ? ev : x)));
      setError(err instanceof Error ? err.message : "予定を移動できませんでした");
    }
  }

  /** ポインタの位置から、落とし先(週の時間枠・時間未定欄・月のマス)を調べる */
  function targetAt(x: number, y: number, grabY: number): Target | null {
    const els = document.elementsFromPoint(x, y);
    for (const el of els) {
      const html = el as HTMLElement;
      if (html.closest(".cal-dragging")) continue;
      const drop = html.dataset.drop as Target["kind"] | undefined;
      const date = html.dataset.date;
      if (!drop || !date) continue;
      if (drop !== "col") return { kind: drop, date, min: 0 };
      const top = y - html.getBoundingClientRect().top - grabY;
      return { kind: "col", date, min: Math.round(((top / HOUR_PX) * 60) / SNAP_MIN) * SNAP_MIN };
    }
    return null;
  }

  function startDrag(e: React.PointerEvent, ev: Event, timed: boolean) {
    if (e.button !== 0 || drag.current) return;
    if (ev.user_id !== meId) return hintNotMine(e);
    const touch = e.pointerType !== "mouse";
    const d: Drag = {
      ev,
      startX: e.clientX,
      startY: e.clientY,
      grabY: timed ? e.clientY - e.currentTarget.getBoundingClientRect().top : 0,
      touch,
      active: false,
      timer: 0,
    };
    drag.current = d;
    // 長押しでつかんだあとは、指の動きで画面がスクロールしないよう止める。
    // つかむ前は止めないので、予定の上からでも普通にスクロールできる
    const blockScroll = (t: UIEvent) => t.preventDefault();
    const activate = () => {
      d.active = true;
      if (touch) {
        window.addEventListener("touchmove", blockScroll, { passive: false });
        window.addEventListener("contextmenu", blockScroll); // 長押しメニューを出さない
      }
      setDragging(ev);
    };
    if (touch) d.timer = window.setTimeout(activate, LONG_PRESS_MS);

    const finish = (commit: boolean, x: number, y: number) => {
      window.clearTimeout(d.timer);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchmove", blockScroll);
      window.removeEventListener("contextmenu", blockScroll);
      drag.current = null;
      if (d.active) {
        justDragged.current = true;
        window.setTimeout(() => (justDragged.current = false), 0);
        const to = commit ? targetAt(x, y, d.grabY) : null;
        if (to) void applyMove(ev, to);
      }
      setDragging(null);
      setTarget(null);
    };
    const onMove = (m: PointerEvent) => {
      const dist = Math.hypot(m.clientX - d.startX, m.clientY - d.startY);
      if (!d.active) {
        if (touch && dist > SCROLL_THRESHOLD) finish(false, 0, 0); // 長押し前に動いた = スクロール
        else if (!touch && dist > MOUSE_THRESHOLD) activate();
        if (!d.active) return;
      }
      m.preventDefault();
      setTarget(targetAt(m.clientX, m.clientY, d.grabY));
      const box = gridRef.current;
      if (box && stickyRef.current) {
        const r = box.getBoundingClientRect();
        const headBottom = r.top + stickyRef.current.offsetHeight;
        if (m.clientY > r.bottom - EDGE_PX) box.scrollTop += 12;
        else if (m.clientY < headBottom + EDGE_PX && m.clientY > r.top) box.scrollTop -= 12;
      }
    };
    const onUp = (u: PointerEvent) => finish(true, u.clientX, u.clientY);
    const onCancel = () => finish(false, 0, 0);
    const onKey = (k: KeyboardEvent) => k.key === "Escape" && finish(false, 0, 0);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
  }

  /** 表示範囲の中にある予定だけ一覧に置く。範囲の外へ移した予定は消す */
  function place(id: number, saved: Event) {
    setEvents((prev) => {
      const rest = prev.filter((x) => x.id !== id);
      return saved.on_date >= fromKey && saved.on_date <= toKey ? [...rest, saved] : rest;
    });
    setPanel(null);
  }

  // 失敗は呼び出し元(フォーム)が表示できるよう、そのまま投げる
  async function add(data: EventInput) {
    const created = await api.addEvent(data);
    place(created.id, created);
  }

  async function save(id: number, data: EventInput) {
    place(id, await api.patchEvent(id, data));
  }

  async function remove(id: number) {
    await api.deleteEvent(id);
    setEvents((prev) => prev.filter((x) => x.id !== id));
    setPanel(null);
  }

  const byDate = (key: string) =>
    events
      .filter((e) => e.on_date === key)
      .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

  const title =
    mode === "month"
      ? `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`
      : `${from.toLocaleDateString("ja-JP")} 〜 ${to.toLocaleDateString("ja-JP")}`;

  const chip = (e: Event) => (
    <button
      key={e.id}
      type="button"
      className={`cal-ev${e.is_private ? " cal-ev-private" : ""}${e.user_id === meId ? " cal-mine" : " cal-other"}${dragging?.id === e.id ? " cal-dragging" : ""}`}
      title={`${e.start_time ? e.start_time + " " : ""}${e.title}${e.place ? " / " + e.place : ""} / ${e.user_name}`}
      onPointerDown={(ev) => startDrag(ev, e, false)}
      onClick={(ev) => {
        ev.stopPropagation();
        view(e);
      }}
    >
      {e.start_time && <b>{e.start_time}</b>} {e.title}
      {e.user_id !== meId && <span className="sub-text"> {e.user_name}</span>}
    </button>
  );

  return (
    <>
      <div className="board-bar">
        <div className="row-gap">
          <div className="seg" role="group" aria-label="表示切り替え">
            <button type="button" className={mode === "month" ? "on" : ""} aria-pressed={mode === "month"} onClick={() => switchMode("month")}>月</button>
            <button type="button" className={mode === "week" ? "on" : ""} aria-pressed={mode === "week"} onClick={() => switchMode("week")}>週</button>
          </div>
          <strong className="cal-title">{title}</strong>
        </div>
        <div className="row-gap">
          <button className="btn btn-ghost" onClick={() => move(-1)}>{mode === "month" ? "前の月" : "前の週"}</button>
          <button className="btn btn-ghost" onClick={() => { setPanel(null); setCursor(new Date()); }}>{mode === "month" ? "今月" : "今週"}</button>
          <button className="btn btn-ghost" onClick={() => move(1)}>{mode === "month" ? "次の月" : "次の週"}</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {mode === "month" ? (
        <div className="cal-month card">
          {DAYS.map((d, i) => (
            <div key={d} className={`cal-dow${dayClass(i)}`}>{d}</div>
          ))}
          {days.map((d, i) => {
            const key = iso(d);
            const list = byDate(key);
            const outside = d.getMonth() !== cursor.getMonth();
            return (
              <div
                key={key}
                data-drop="cell"
                data-date={key}
                className={`cal-cell${outside ? " cal-out" : ""}${key === todayKey ? " cal-today" : ""}${target?.kind === "cell" && target.date === key ? " cal-drop" : ""}`}
                onClick={() => addAt(key, "")}
              >
                <button
                  type="button"
                  className={`cal-num${dayClass(i % 7)}`}
                  title="この日の週を表示"
                  onClick={(ev) => { ev.stopPropagation(); switchMode("week", d); }}
                >
                  {d.getDate()}
                </button>
                {list.slice(0, MONTH_CHIPS).map(chip)}
                {list.length > MONTH_CHIPS && (
                  <button
                    type="button"
                    className="cal-more"
                    onClick={(ev) => { ev.stopPropagation(); switchMode("week", d); }}
                  >
                    ほか{list.length - MONTH_CHIPS}件
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="cal-week card">
          <div className="cal-wk-scroll" ref={gridRef}>
            <div className="cal-wk-sticky" ref={stickyRef}>
              <div className="cal-wk-head">
                <div />
                {days.map((d, i) => (
                  <div key={iso(d)} className={`cal-wk-day${iso(d) === todayKey ? " cal-today" : ""}`}>
                    <span className={`cal-num-static${dayClass(i)}`}>{d.getDate()}</span>
                    <span className={`sub-text${dayClass(i)}`}> {DAYS[i]}</span>
                  </div>
                ))}
              </div>
              <div className="cal-wk-allday">
                <div className="cal-gutter">時間未定</div>
                {days.map((d) => {
                  const key = iso(d);
                  return (
                    <div
                      key={key}
                      data-drop="allday"
                      data-date={key}
                      className={`cal-allday-cell${target?.kind === "allday" && target.date === key ? " cal-drop" : ""}`}
                      onClick={() => addAt(key, "")}
                    >
                      {byDate(key).filter((e) => !e.start_time).map(chip)}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="cal-wk-grid" style={{ height: 24 * HOUR_PX }}>
              <div className="cal-hours">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} style={{ height: HOUR_PX }}>{h > 0 && `${h}:00`}</div>
                ))}
              </div>
              {days.map((d) => {
                const key = iso(d);
                const placed = layoutDay(byDate(key).filter((e) => e.start_time));
                return (
                  <div key={key} data-drop="col" data-date={key} className={`cal-col${key === todayKey ? " cal-today" : ""}`}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <div
                        key={h}
                        className="cal-slot"
                        style={{ height: HOUR_PX }}
                        onClick={() => addAt(key, `${pad(h)}:00`)}
                      />
                    ))}
                    {placed.map(({ e, s, end, col, cols }) => (
                      <button
                        key={e.id}
                        type="button"
                        className={`cal-block${e.is_private ? " cal-ev-private" : ""}${e.user_id === meId ? " cal-mine" : " cal-other"}${dragging?.id === e.id ? " cal-dragging" : ""}`}
                        style={{
                          top: (s / 60) * HOUR_PX,
                          height: ((end - s) / 60) * HOUR_PX - 2,
                          left: `calc(${(col / cols) * 100}% + 1px)`,
                          width: `calc(${100 / cols}% - 2px)`,
                        }}
                        title={`${e.start_time}${e.end_time ? "〜" + e.end_time : ""} ${e.title}${e.place ? " / " + e.place : ""} / ${e.user_name}`}
                        onPointerDown={(ev) => startDrag(ev, e, true)}
                        onClick={() => view(e)}
                      >
                        <b>{e.start_time}{e.end_time && `〜${e.end_time}`}</b>
                        <span>{e.title}</span>
                        {e.place && <span className="sub-text">{e.place}</span>}
                        {e.user_id !== meId && <span className="sub-text">{e.user_name}</span>}
                      </button>
                    ))}
                    {dragging && target?.kind === "col" && target.date === key && (() => {
                      const m = moveTo(dragging, target);
                      const s0 = toMin(m.start_time);
                      const e0 = m.end_time ? toMin(m.end_time) : s0 + DEFAULT_MINUTES;
                      return (
                        <div className="cal-block cal-ghost" style={{ top: (s0 / 60) * HOUR_PX, height: ((Math.max(e0, s0 + MIN_MINUTES) - s0) / 60) * HOUR_PX - 2, left: 1, right: 1 }}>
                          <b>{m.start_time}{m.end_time && `〜${m.end_time}`}</b>
                          <span>{dragging.title}</span>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {panel && (
        <Modal label={panel.kind === "add" ? "予定を追加" : "予定の詳細"} onClose={() => setPanel(null)}>
          {panel.kind === "add" ? (
            <EventForm key={`${panel.date}-${panel.start}`} date={panel.date} start={panel.start} onSubmit={add} onCancel={() => setPanel(null)} />
          ) : panel.event.user_id === meId ? (
            <EventForm
              key={panel.event.id}
              event={panel.event}
              date={panel.event.on_date}
              start={panel.event.start_time}
              onSubmit={(data) => save(panel.event.id, data)}
              onCancel={() => setPanel(null)}
              onDelete={() => remove(panel.event.id)}
            />
          ) : (
            <section className="day-form">
              <strong>
                {panel.event.title}
                {panel.event.is_private && <span className="badge">非公開</span>}
              </strong>
              <p className="muted">
                {panel.event.on_date}
                {panel.event.start_time && ` ${panel.event.start_time}`}
                {panel.event.end_time && `〜${panel.event.end_time}`}
                {panel.event.place && ` / ${panel.event.place}`}
                {` / ${panel.event.user_name}`}
              </p>
              <div className="row-gap">
                <span className="sub-text">他の人の予定です(変更・削除はできません)</span>
                <button className="btn btn-ghost auto" onClick={() => setPanel(null)}>閉じる</button>
              </div>
            </section>
          )}
        </Modal>
      )}
    </>
  );
}
