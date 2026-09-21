"use client";

import { durationLabel, hhmm, toMin } from "@/lib/time";

const STEP = 15; // 選べる時刻の刻み(分)
const LAST = 24 * 60 - STEP; // 選べる最後の時刻(23:45)
const SLOTS = Array.from({ length: (24 * 60) / STEP }, (_, i) => i * STEP);
const DURATIONS = [30, 60, 120, 180]; // ワンタッチで終了時刻を決める所要時間(分)

/**
 * 開始〜終了の時刻を選ぶ。
 * - 開始を変えると、終了も同じ長さだけずれる(長さを保つ)
 * - 終了の候補は開始より後ろだけ
 * - 「30分」「1時間」などのボタンで、開始からの長さを一発で決められる
 */
export default function TimeRange({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const s = toMin(start);
  const dur = end ? toMin(end) - s : 0;

  // 刻みに乗っていない値(既存の予定など)も、選択肢から消えないようにする
  const startOptions = SLOTS.includes(s) ? SLOTS : [...SLOTS, s].sort((a, b) => a - b);
  const endOptions = SLOTS.filter((m) => m > s);
  if (end && !endOptions.includes(toMin(end))) endOptions.push(toMin(end));

  function changeStart(next: string) {
    const n = toMin(next);
    if (dur <= 0) return onChange(next, "");
    // 長さを保つ。23:45 を超えるなら、入る範囲に収める
    const e = Math.min(n + dur, LAST);
    onChange(next, e > n ? hhmm(e) : "");
  }

  return (
    <div className="time-range">
      <div className="time-range-row">
        <select aria-label="開始時刻" value={start} onChange={(e) => changeStart(e.target.value)}>
          {startOptions.map((m) => (
            <option key={m} value={hhmm(m)}>{hhmm(m)}</option>
          ))}
        </select>
        <span aria-hidden>〜</span>
        <select aria-label="終了時刻" value={end} onChange={(e) => onChange(start, e.target.value)}>
          <option value="">終了時刻なし</option>
          {endOptions.map((m) => (
            <option key={m} value={hhmm(m)}>{hhmm(m)}</option>
          ))}
        </select>
        {dur > 0 && <span className="sub-text">({durationLabel(dur)})</span>}
      </div>
      <div className="time-range-row" role="group" aria-label="所要時間">
        {DURATIONS.map((d) => (
          <button
            key={d}
            type="button"
            className={`chip-btn${dur === d ? " on" : ""}`}
            aria-pressed={dur === d}
            disabled={s + d > LAST}
            onClick={() => onChange(start, hhmm(s + d))}
          >
            {durationLabel(d)}
          </button>
        ))}
      </div>
    </div>
  );
}
