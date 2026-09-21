"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { refreshBadges } from "@/lib/badges";
import Modal from "./Modal";
import { PRESENCE_LABEL, type Member, type Message } from "@/lib/types";

const OPTIONS = Object.entries(PRESENCE_LABEL);

export default function OfficeBoard({
  members: initialMembers,
  messages: initialMessages,
  meId,
}: {
  members: Member[];
  messages: Message[];
  meId: number;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [messages, setMessages] = useState(initialMessages);
  const [target, setTarget] = useState<Member | null>(null); // 伝言を残す相手
  const [error, setError] = useState("");
  const me = members.find((m) => m.id === meId);

  async function changePresence(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const updated = await api.setPresence(String(f.get("presence")), String(f.get("presence_note") ?? ""));
    setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!target) return;
    const f = new FormData(e.currentTarget);
    try {
      await api.addMessage({
        to_user_id: target.id,
        caller: String(f.get("caller") ?? ""),
        body: String(f.get("body") ?? ""),
      });
      closeTarget();
    } catch (err) {
      setError(err instanceof Error ? err.message : "送れませんでした");
    }
  }

  function closeTarget() {
    setTarget(null);
    setError("");
  }

  async function handled(id: number) {
    await api.handleMessage(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    refreshBadges();
  }

  return (
    <div className="two-col">
      <section>
        <h2 className="section-head">在席状況</h2>
        {me && (
          <form className="card form-row" onSubmit={changePresence}>
            <select name="presence" defaultValue={me.presence} aria-label="自分の在席状況">
              {OPTIONS.map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <input name="presence_note" className="grow" maxLength={120} placeholder="ひとこと(例: 15時に戻ります)" defaultValue={me.presence_note} />
            <button className="btn auto">更新する</button>
          </form>
        )}
        <ul className="list card">
          {members.map((m) => (
            <li key={m.id}>
              <span className={`dot dot-${m.presence}`} aria-hidden="true" />
              <span className="grow">
                {m.name}
                {m.department && <span className="sub-text"> / {m.department}</span>}
              </span>
              <span className="sub-text">{m.presence_note || PRESENCE_LABEL[m.presence]}</span>
              {m.id !== meId && (
                <button className="btn btn-ghost" onClick={() => { setError(""); setTarget(m); }}>伝言</button>
              )}
            </li>
          ))}
        </ul>

        {target && (
          <Modal label={`${target.name} さんへの伝言`} onClose={closeTarget}>
            <form className="stack" onSubmit={send}>
              <p className="section-head">{target.name} さんへの伝言</p>
              <input name="caller" placeholder="相手(例: みなと商事 佐藤様)" maxLength={120} />
              <textarea name="body" className="memo" placeholder="用件" />
              {error && <p className="error">{error}</p>}
              <div className="row-gap">
                <button className="btn auto">伝言を残す</button>
                <button type="button" className="btn btn-ghost" onClick={closeTarget}>やめる</button>
              </div>
            </form>
          </Modal>
        )}
      </section>

      <section>
        <h2 className="section-head">自分あての伝言</h2>
        <ul className="list card">
          {messages.map((m) => (
            <li key={m.id} className="stack-li">
              <div className="row-line">
                <span className="grow"><b>{m.caller || "(相手の記載なし)"}</b></span>
                <span className="sub-text">{m.from_name}</span>
                <span className="sub-text">{new Date(m.created_at).toLocaleString("ja-JP")}</span>
              </div>
              {m.body && <p className="body">{m.body}</p>}
              <div><button className="btn btn-ghost" onClick={() => handled(m.id)}>対応済みにする</button></div>
            </li>
          ))}
          {!messages.length && <li className="muted">未処理の伝言はありません</li>}
        </ul>
      </section>
    </div>
  );
}
