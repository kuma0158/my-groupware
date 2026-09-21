"use client";

import { useState } from "react";
import { hhmm, toMin } from "@/lib/time";
import type { Event } from "@/lib/types";
import TimeRange from "./TimeRange";

export type EventInput = Pick<Event, "title" | "on_date" | "start_time" | "end_time" | "place" | "is_private">;

const DEFAULT_START = "09:00";
const DEFAULT_END = "10:00";
const LAST = 24 * 60 - 15; // 選べる最後の時刻(23:45)

/**
 * 予定の入力フォーム。新規と編集で同じ見た目を使う。
 * event を渡すと編集、渡さなければ date/start を初期値にした新規になる。
 * 時間の指定は任意で、指定するときだけ時刻の選択欄を出す。
 */
export default function EventForm({
  event,
  date,
  start,
  onSubmit,
  onCancel,
  onDelete,
}: {
  event?: Event;
  date: string;
  start: string; // 時間枠から開いたときの開始時刻。空なら時間未定で開く
  onSubmit: (data: EventInput) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [timed, setTimed] = useState(event ? event.start_time !== "" : start !== "");
  const [from, setFrom] = useState(event?.start_time || start || DEFAULT_START);
  const [to, setTo] = useState(
    event ? event.end_time : start ? hhmm(Math.min(toMin(start) + 60, LAST)) : DEFAULT_END, // 時間枠から開いたら 1 時間
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<void>, failed: string) {
    setError("");
    setBusy(true);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : failed);
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(
      () =>
        onSubmit({
          title: String(f.get("title")),
          on_date: String(f.get("on_date")),
          start_time: timed ? from : "",
          end_time: timed ? to : "",
          place: String(f.get("place") ?? ""),
          is_private: f.get("is_private") === "on",
        }),
      event ? "保存できませんでした" : "登録できませんでした",
    );
  }

  return (
    <form className="day-form" onSubmit={submit}>
      <strong>{event ? "予定を編集" : "予定を追加"}</strong>
      <input name="title" placeholder="件名" required maxLength={200} autoFocus defaultValue={event?.title ?? ""} />
      <input name="on_date" type="date" aria-label="日付" defaultValue={event?.on_date ?? date} required />
      <label className="check">
        <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} /> 時間を指定する
      </label>
      {timed && (
        <TimeRange
          start={from}
          end={to}
          onChange={(s, e) => {
            setFrom(s);
            setTo(e);
          }}
        />
      )}
      <input name="place" placeholder="場所" maxLength={120} defaultValue={event?.place ?? ""} />
      <label className="check">
        <input type="checkbox" name="is_private" defaultChecked={event?.is_private ?? false} /> 自分だけに表示
      </label>
      {error && <p className="error">{error}</p>}
      <div className="row-gap">
        <button className="btn auto" disabled={busy}>{event ? "保存する" : "登録する"}</button>
        <button type="button" className="btn btn-ghost auto" onClick={onCancel} disabled={busy}>やめる</button>
        {onDelete && (
          <button
            type="button"
            className="btn btn-ghost auto danger-text"
            disabled={busy}
            onClick={() => void run(onDelete, "削除できませんでした")}
          >
            削除する
          </button>
        )}
      </div>
    </form>
  );
}
