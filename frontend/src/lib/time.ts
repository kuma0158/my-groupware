/** "HH:MM" と、0時からの分数の相互変換 */
export const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** 分数を「1時間30分」のように読みやすくする */
export function durationLabel(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h ? `${h}時間` : ""}${m ? `${m}分` : ""}` || "0分";
}
