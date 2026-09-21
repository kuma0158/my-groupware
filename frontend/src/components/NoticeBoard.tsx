"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { refreshBadges } from "@/lib/badges";
import type { Notice } from "@/lib/types";

export default function NoticeBoard({ initial, meId }: { initial: Notice[]; meId: number }) {
  const [notices, setNotices] = useState(initial);
  const [openId, setOpenId] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState("");

  async function open(n: Notice) {
    const next = openId === n.id ? null : n.id;
    setOpenId(next);
    // 開いたときに既読にする
    if (next !== null && n.unread) {
      await api.readNotice(n.id);
      setNotices((prev) => prev.map((x) => (x.id === n.id ? { ...x, unread: false } : x)));
      refreshBadges();
    }
  }

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const created = await api.addNotice({
        title: String(f.get("title")),
        body: String(f.get("body") ?? ""),
        pinned: f.get("pinned") === "on",
      });
      setNotices((prev) => [created, ...prev].sort((a, b) => Number(b.pinned) - Number(a.pinned)));
      setWriting(false);
      refreshBadges();
    } catch (err) {
      setError(err instanceof Error ? err.message : "投稿できませんでした");
    }
  }

  async function remove(id: number) {
    await api.deleteNotice(id);
    setNotices((prev) => prev.filter((x) => x.id !== id));
    refreshBadges();
  }

  return (
    <>
      <div className="board-bar">
        <p className="muted">未読 {notices.filter((n) => n.unread).length} 件 / 全 {notices.length} 件</p>
        <button className="btn btn-ghost" onClick={() => setWriting((v) => !v)}>
          {writing ? "やめる" : "＋ お知らせを書く"}
        </button>
      </div>

      {writing && (
        <form className="card stack" onSubmit={add}>
          <input name="title" placeholder="件名" required maxLength={200} />
          <textarea name="body" className="memo" placeholder="本文" />
          <label className="check"><input type="checkbox" name="pinned" /> 上部に固定する</label>
          <div><button className="btn auto">投稿する</button></div>
        </form>
      )}
      {error && <p className="error">{error}</p>}

      <ul className="list card">
        {notices.map((n) => (
          <li key={n.id} className="stack-li">
            <div className="row-line">
              {n.pinned && <span className="badge badge-pin">固定</span>}
              {n.unread && <span className="badge">未読</span>}
              <button className="link grow" onClick={() => open(n)}>{n.title}</button>
              <span className="sub-text">{n.author_name}</span>
              <span className="sub-text">{new Date(n.created_at).toLocaleDateString("ja-JP")}</span>
              {n.author_id === meId && <button className="icon" title="削除" onClick={() => remove(n.id)}>✕</button>}
            </div>
            {openId === n.id && <p className="body">{n.body || "(本文なし)"}</p>}
          </li>
        ))}
        {!notices.length && <li className="muted">お知らせはありません</li>}
      </ul>
    </>
  );
}
