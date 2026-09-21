"use client";

import { useState } from "react";
import type { Member, Todo, TodoColumn } from "@/lib/types";

export type TodoEdit = {
  title: string;
  note: string;
  due_on: string | null;
  assignee_id: number;
  column_id: number;
};

/**
 * カードの詳細。件名・メモ・期限・担当者・列を直せる。
 * ドラッグが使えない画面(キーボード操作など)でも、ここの「列」で動かせる。
 */
export default function TodoDetail({
  todo,
  columns,
  members,
  meId,
  onShare,
  onSave,
  onDelete,
  onCancel,
}: {
  todo: Todo;
  columns: TodoColumn[];
  members: Member[];
  meId: number;
  onShare: (userIds: number[]) => Promise<void>;
  onSave: (data: TodoEdit) => Promise<void>;
  onDelete: () => Promise<void>;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false); // 共有の相手を選んでいる最中
  const [picked, setPicked] = useState<number[]>(todo.shared_with);
  const isOwner = todo.owner_id === meId;
  const nameOf = (id: number) => members.find((m) => m.id === id)?.name ?? "退会したユーザー";

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
        onSave({
          title: String(f.get("title")).trim(),
          note: String(f.get("note") ?? ""),
          due_on: String(f.get("due_on") ?? "") || null,
          assignee_id: Number(f.get("assignee_id")),
          column_id: Number(f.get("column_id")),
        }),
      "保存できませんでした",
    );
  }

  // 担当者が退会している場合などで、選択肢から消えないようにする
  const assignees = members.some((m) => m.id === todo.assignee_id)
    ? members
    : [...members, { id: todo.assignee_id, name: todo.assignee_name, department: "", presence: "", presence_note: "" }];

  return (
    <form className="day-form todo-detail" onSubmit={submit}>
      <strong>ToDoの詳細</strong>
      <label className="field-label">
        件名
        <input name="title" required maxLength={200} defaultValue={todo.title} autoFocus />
      </label>
      <label className="field-label">
        メモ
        <textarea name="note" rows={5} defaultValue={todo.note} placeholder="詳しい内容や進め方のメモ" />
      </label>
      <div className="todo-detail-row">
        <label className="field-label">
          期限
          <input name="due_on" type="date" defaultValue={todo.due_on ?? ""} />
        </label>
        <label className="field-label">
          担当者
          <select name="assignee_id" defaultValue={todo.assignee_id}>
            {assignees.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field-label">
        列
        <select name="column_id" defaultValue={todo.column_id}>
          {columns.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.is_done ? "(完了)" : ""}</option>
          ))}
        </select>
      </label>
      <div className="field-label">
        共有
        {!sharing && (
          <span className="row-gap">
            <span className="muted">
              {todo.shared_with.length ? todo.shared_with.map(nameOf).join("、") : "共有していません"}
            </span>
            {isOwner && (
              <button type="button" className="btn btn-ghost auto" disabled={busy} onClick={() => setSharing(true)}>
                共有する
              </button>
            )}
          </span>
        )}
        {sharing && (
          <div className="todo-share">
            <p className="muted">選んだ人に、このカードが見えるようになります(動かしたり直したりもできます)。</p>
            {members.filter((m) => m.id !== meId).map((m) => (
              <label key={m.id} className="todo-share-item">
                <input
                  type="checkbox"
                  checked={picked.includes(m.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.id] : p.filter((x) => x !== m.id)))}
                />
                {m.name}
                {m.department && <span className="muted"> / {m.department}</span>}
              </label>
            ))}
            <span className="row-gap">
              <button
                type="button"
                className="btn auto"
                disabled={busy}
                onClick={() => void run(async () => { await onShare(picked); setSharing(false); setBusy(false); }, "共有を変えられませんでした")}
              >
                共有を保存
              </button>
              <button
                type="button"
                className="btn btn-ghost auto"
                disabled={busy}
                onClick={() => { setPicked(todo.shared_with); setSharing(false); }}
              >
                やめる
              </button>
            </span>
          </div>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="row-gap">
        <button className="btn auto" disabled={busy}>保存する</button>
        <button type="button" className="btn btn-ghost auto" onClick={onCancel} disabled={busy}>やめる</button>
        {confirmDelete ? (
          <button
            type="button"
            className="btn btn-ghost auto danger-text"
            disabled={busy}
            onClick={() => void run(onDelete, "削除できませんでした")}
          >
            本当に削除する
          </button>
        ) : (
          <button type="button" className="btn btn-ghost auto danger-text" disabled={busy} onClick={() => setConfirmDelete(true)}>
            削除する
          </button>
        )}
      </div>
    </form>
  );
}
