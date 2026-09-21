"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Member, Todo, TodoColumn } from "@/lib/types";
import Modal from "./Modal";
import TodoDetail, { type TodoEdit } from "./TodoDetail";

const MOUSE_THRESHOLD = 5; // マウスでドラッグ開始とみなす移動量(px)
const LONG_PRESS_MS = 350; // スマホで長押しと判定するまでの時間
const SCROLL_THRESHOLD = 12; // 長押し前にこれ以上動いたらスクロール操作とみなす
const EDGE_PX = 48; // 画面や盤面の端にこれだけ近づくと自動スクロールする
const SCROLL_STEP = 16;

/** 落とす場所。col の列の、動かしているカードを除いた index 番目の手前 */
type Over = { col: number; index: number };
type Drag = {
  todo: Todo;
  startX: number;
  startY: number;
  grabX: number; // カードの左上から見た、つかんだ位置
  grabY: number;
  x: number; // ポインタの現在位置
  y: number;
  touch: boolean;
  active: boolean;
  timer: number;
  raf: number;
};

const pad = (n: number) => String(n).padStart(2, "0");
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const byPosition = (a: Todo, b: Todo) => a.position - b.position || a.id - b.id;

export default function TodoBoard({
  initialTodos,
  initialColumns,
  members,
  meId,
}: {
  initialTodos: Todo[];
  initialColumns: TodoColumn[];
  members: Member[];
  meId: number;
}) {
  const [todos, setTodos] = useState(initialTodos);
  const [columns, setColumns] = useState(initialColumns);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Todo | null>(null);
  const [composing, setComposing] = useState<number | null>(null); // カードを追加中の列
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [dragging, setDragging] = useState<{ todo: Todo; w: number } | null>(null);
  const [over, setOver] = useState<Over | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const justDragged = useRef(false); // ドラッグ直後のクリックで詳細が開かないように
  const pending = useRef(0); // サーバーへ送信中の移動の数
  const syncSeq = useRef(0);
  const todosRef = useRef(todos);
  const columnsRef = useRef(columns);
  todosRef.current = todos;
  columnsRef.current = columns;
  const today = localToday();

  const cardsOf = (colId: number, list = todos) => list.filter((t) => t.column_id === colId).sort(byPosition);

  /** サーバーの並びで取り直す。移動が全部終わったときだけ反映する */
  async function resync() {
    const seq = ++syncSeq.current;
    try {
      const list = await api.todos(true);
      if (seq === syncSeq.current && pending.current === 0) setTodos(list);
    } catch {}
  }

  // 列のメニューは、外側を押したら閉じる
  useEffect(() => {
    if (menuFor === null) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest("[data-menu]")) {
        setMenuFor(null);
        setConfirmDel(null);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuFor]);

  // ---------- カードのドラッグ ----------

  /** ポインタの位置から落とし先を調べる。列は横位置だけで決め、列の下の余白に落としても末尾になる */
  function overAt(x: number, y: number, dragId: number): Over | null {
    const board = boardRef.current;
    if (!board) return null;
    let hit: HTMLElement | null = null;
    board.querySelectorAll<HTMLElement>("[data-col]").forEach((c) => {
      const r = c.getBoundingClientRect();
      if (x >= r.left && x <= r.right) hit = c;
    });
    if (!hit) return null;
    const col = hit as HTMLElement;
    let index = 0;
    col.querySelectorAll<HTMLElement>("[data-card]").forEach((el) => {
      if (Number(el.dataset.card) === dragId) return;
      const r = el.getBoundingClientRect();
      if (y > r.top + r.height / 2) index++;
    });
    return { col: Number(col.dataset.col), index };
  }

  function refreshOver(d: Drag) {
    const next = overAt(d.x, d.y, d.todo.id);
    setOver((prev) => (prev?.col === next?.col && prev?.index === next?.index ? prev : next));
  }

  function moveGhost(d: Drag) {
    const g = ghostRef.current;
    if (g) g.style.transform = `translate(${d.x - d.grabX}px, ${d.y - d.grabY}px) rotate(2deg)`;
  }
  // ゴーストが描かれた直後に、つかんだ位置へ置く
  useLayoutEffect(() => {
    if (dragging && drag.current) moveGhost(drag.current);
  }, [dragging]);

  async function dropCard(todo: Todo, o: Over) {
    const col = columnsRef.current.find((c) => c.id === o.col);
    if (!col) return;
    const all = cardsOf(o.col, todosRef.current);
    const others = all.filter((t) => t.id !== todo.id);
    // 元の場所と同じなら何もしない
    if (todo.column_id === o.col && all.findIndex((t) => t.id === todo.id) === o.index) return;

    const before = others[o.index] ?? null;
    const position = before ? before.position - 0.5 : others.length ? others[others.length - 1].position + 1 : 0;
    setError("");
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, column_id: o.col, position, done: col.is_done } : t))); // 先に動かして見せる
    pending.current++;
    try {
      await api.moveTodo(todo.id, o.col, before?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "カードを移動できませんでした");
    } finally {
      pending.current--;
      if (pending.current === 0) void resync(); // 成功しても失敗しても、サーバーの並びに揃える
    }
  }

  function startDrag(e: React.PointerEvent<HTMLDivElement>, todo: Todo) {
    if (e.button !== 0 || drag.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.pointerType !== "mouse";
    const d: Drag = {
      todo,
      startX: e.clientX,
      startY: e.clientY,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      x: e.clientX,
      y: e.clientY,
      touch,
      active: false,
      timer: 0,
      raf: 0,
    };
    drag.current = d;

    // 長押しでつかんだあとは、指の動きで画面がスクロールしないよう止める。
    // つかむ前は止めないので、カードの上からでも普通にスクロールできる
    const blockScroll = (t: UIEvent) => t.preventDefault();
    const tick = () => {
      const b = boardRef.current;
      if (b) {
        const r = b.getBoundingClientRect();
        if (d.x > r.right - EDGE_PX) b.scrollLeft += SCROLL_STEP;
        else if (d.x < r.left + EDGE_PX) b.scrollLeft -= SCROLL_STEP;
      }
      if (d.y > window.innerHeight - EDGE_PX) window.scrollBy(0, SCROLL_STEP);
      else if (d.y < EDGE_PX) window.scrollBy(0, -SCROLL_STEP);
      refreshOver(d);
      d.raf = requestAnimationFrame(tick);
    };
    const activate = () => {
      d.active = true;
      if (touch) {
        window.addEventListener("touchmove", blockScroll, { passive: false });
        window.addEventListener("contextmenu", blockScroll); // 長押しメニューを出さない
      }
      document.body.classList.add("kb-dragging");
      setDragging({ todo, w: rect.width });
      d.raf = requestAnimationFrame(tick);
    };
    if (touch) d.timer = window.setTimeout(activate, LONG_PRESS_MS);

    const finish = (commit: boolean) => {
      window.clearTimeout(d.timer);
      cancelAnimationFrame(d.raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchmove", blockScroll);
      window.removeEventListener("contextmenu", blockScroll);
      document.body.classList.remove("kb-dragging");
      drag.current = null;
      if (d.active) {
        justDragged.current = true;
        window.setTimeout(() => (justDragged.current = false), 0);
        const o = commit ? overAt(d.x, d.y, todo.id) : null;
        if (o) void dropCard(todo, o);
      }
      setDragging(null);
      setOver(null);
    };
    const onMove = (m: PointerEvent) => {
      d.x = m.clientX;
      d.y = m.clientY;
      const dist = Math.hypot(d.x - d.startX, d.y - d.startY);
      if (!d.active) {
        if (touch && dist > SCROLL_THRESHOLD) finish(false); // 長押し前に動いた = スクロール
        else if (!touch && dist > MOUSE_THRESHOLD) activate();
        if (!d.active) return;
      }
      m.preventDefault();
      moveGhost(d);
      refreshOver(d);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (k: KeyboardEvent) => k.key === "Escape" && finish(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey);
  }

  function open(t: Todo) {
    if (justDragged.current) return;
    setError("");
    setDetail(t);
  }

  // ---------- カード ----------

  async function addCard(e: React.FormEvent<HTMLFormElement>, colId: number) {
    e.preventDefault();
    const form = e.currentTarget;
    const title = String(new FormData(form).get("title") ?? "").trim();
    if (!title) return;
    setError("");
    try {
      const created = await api.addTodo({ title, column_id: colId });
      setTodos((prev) => [...prev, created]);
      form.reset(); // 続けて入力できるよう、開いたままにする
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録できませんでした");
    }
  }

  async function saveDetail(t: Todo, data: TodoEdit) {
    // 失敗は詳細のフォームが表示できるよう、そのまま投げる
    const saved = await api.patchTodo(t.id, {
      title: data.title,
      note: data.note,
      due_on: data.due_on,
      assignee_id: data.assignee_id,
      ...(data.column_id !== t.column_id && { column_id: data.column_id }),
    });
    // 担当を他の人に渡した結果、自分に関係なくなったカードは盤面から外す
    const mine = saved.owner_id === meId || saved.assignee_id === meId || saved.shared_with.includes(meId);
    setTodos((prev) => (mine ? prev.map((x) => (x.id === t.id ? saved : x)) : prev.filter((x) => x.id !== t.id)));
    setDetail(null);
  }

  async function shareCard(t: Todo, userIds: number[]) {
    const saved = await api.shareTodo(t.id, userIds);
    setTodos((prev) => prev.map((x) => (x.id === t.id ? saved : x)));
    setDetail(saved);
  }

  async function removeCard(t: Todo) {
    await api.deleteTodo(t.id);
    setTodos((prev) => prev.filter((x) => x.id !== t.id));
    setDetail(null);
  }

  // ---------- 列 ----------

  async function addColumn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (!name) return;
    setError("");
    try {
      const col = await api.addTodoColumn(name);
      setColumns((prev) => [...prev, col]);
      setAddingColumn(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "列を追加できませんでした");
    }
  }

  async function rename(col: TodoColumn, name: string) {
    setRenaming(null);
    const next = name.trim();
    if (!next || next === col.name) return;
    setError("");
    try {
      const saved = await api.patchTodoColumn(col.id, { name: next });
      setColumns((prev) => prev.map((c) => (c.id === col.id ? saved : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "名前を変更できませんでした");
    }
  }

  async function toggleDone(col: TodoColumn) {
    setMenuFor(null);
    setError("");
    try {
      const saved = await api.patchTodoColumn(col.id, { is_done: !col.is_done });
      setColumns((prev) => prev.map((c) => (c.id === col.id ? saved : c)));
      void resync(); // 中のカードの完了状態が変わるので取り直す
    } catch (err) {
      setError(err instanceof Error ? err.message : "変更できませんでした");
    }
  }

  async function shift(index: number, dir: -1 | 1) {
    setMenuFor(null);
    const next = [...columns];
    [next[index], next[index + dir]] = [next[index + dir], next[index]];
    const before = columns;
    setColumns(next.map((c, i) => ({ ...c, position: i })));
    try {
      setColumns(await api.orderTodoColumns(next.map((c) => c.id)));
    } catch (err) {
      setColumns(before);
      setError(err instanceof Error ? err.message : "列を動かせませんでした");
    }
  }

  async function removeColumn(col: TodoColumn) {
    setMenuFor(null);
    setConfirmDel(null);
    setError("");
    try {
      await api.deleteTodoColumn(col.id);
      setColumns((prev) => prev.filter((c) => c.id !== col.id).map((c, i) => ({ ...c, position: i })));
      void resync(); // 中のカードは同じ種類の別の列へ移っている
    } catch (err) {
      setError(err instanceof Error ? err.message : "列を削除できませんでした");
    }
  }

  // ---------- 表示 ----------

  const slot = <li key="slot" className="kb-slot" aria-hidden="true" />;

  return (
    <>
      <p className="muted kb-hint">
        カードをドラッグして、列や順番を変えられます(スマホは長押し)。クリックすると詳細を開きます。列はみんなで共有しています。
      </p>
      {error && <p className="error">{error}</p>}

      <div className="kb-board" ref={boardRef}>
        {columns.map((col, ci) => {
          const cards = cardsOf(col.id);
          const sameKind = columns.filter((c) => c.id !== col.id && c.is_done === col.is_done);
          const isOver = over?.col === col.id;
          let seen = 0;
          const items: React.ReactNode[] = [];
          for (const t of cards) {
            const hidden = dragging?.todo.id === t.id;
            if (!hidden) {
              if (isOver && over.index === seen) items.push(slot);
              seen++;
            }
            const late = !!t.due_on && t.due_on < today && !t.done;
            items.push(
              <li key={t.id} data-card={t.id} className={hidden ? "kb-card-hidden" : undefined}>
                <div
                  className={`kb-card${t.done ? " kb-card-done" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${t.title}の詳細を開く`}
                  onPointerDown={(e) => startDrag(e, t)}
                  onClick={() => open(t)}
                  onKeyDown={(e) => e.key === "Enter" && open(t)}
                >
                  <span className="kb-card-title">{t.title}</span>
                  {(t.note || t.due_on || t.assignee_id !== meId || t.shared_with.length > 0) && (
                    <span className="kb-card-meta">
                      {t.due_on && (
                        <span className={`kb-chip${late ? " kb-chip-late" : ""}`} title={late ? "期限を過ぎています" : "期限"}>
                          {new Date(t.due_on).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
                        </span>
                      )}
                      {t.note && <span className="kb-chip" title="メモあり">メモ</span>}
                      {t.assignee_id !== meId && <span className="kb-chip">{t.assignee_name}</span>}
                      {t.shared_with.length > 0 && <span className="kb-chip" title="共有中">共有</span>}
                    </span>
                  )}
                </div>
              </li>,
            );
          }
          if (isOver && over.index >= seen) items.push(slot);

          return (
            <section
              key={col.id}
              className={`kb-col${col.is_done ? " kb-col-done" : ""}${isOver ? " kb-col-over" : ""}`}
              data-col={col.id}
              data-tone={col.is_done ? "done" : columns.slice(0, ci).filter((c) => !c.is_done).length % 4}
              aria-label={col.name}
            >
              <header className="kb-col-head">
                {renaming === col.id ? (
                  <input
                    className="kb-rename"
                    aria-label="列の名前"
                    defaultValue={col.name}
                    maxLength={50}
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={(e) => void rename(col, e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                  />
                ) : (
                  <h2 className="kb-col-title">
                    {col.name}
                    {col.is_done && <span className="kb-done-mark" title="この列に入ると完了になります"> ✓</span>}
                  </h2>
                )}
                <span className="kb-count" aria-label={`${cards.length}件`}>{cards.length}</span>
                <div className="kb-menu-wrap" data-menu>
                  <button
                    type="button"
                    className="icon"
                    aria-label={`${col.name}の操作`}
                    aria-expanded={menuFor === col.id}
                    onClick={() => {
                      setConfirmDel(null);
                      setMenuFor(menuFor === col.id ? null : col.id);
                    }}
                  >
                    ⋯
                  </button>
                  {menuFor === col.id && (
                    <div className="kb-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuFor(null);
                          setRenaming(col.id);
                        }}
                      >
                        名前を変更
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={sameKind.length === 0}
                        title={sameKind.length === 0 ? "完了列と未完了の列は、それぞれ最低1つ必要です" : undefined}
                        onClick={() => void toggleDone(col)}
                      >
                        {col.is_done ? "完了列をやめる" : "完了列にする"}
                      </button>
                      <button type="button" role="menuitem" disabled={ci === 0} onClick={() => void shift(ci, -1)}>
                        ← 左へ移動
                      </button>
                      <button type="button" role="menuitem" disabled={ci === columns.length - 1} onClick={() => void shift(ci, 1)}>
                        右へ移動 →
                      </button>
                      {confirmDel === col.id ? (
                        <>
                          <p className="kb-menu-note">中のカードは「{sameKind[0]?.name}」へ移ります。</p>
                          <button type="button" role="menuitem" className="danger-text" onClick={() => void removeColumn(col)}>
                            本当に削除する
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          className="danger-text"
                          disabled={sameKind.length === 0}
                          title={sameKind.length === 0 ? "完了列と未完了の列は、それぞれ最低1つ必要です" : undefined}
                          onClick={() => setConfirmDel(col.id)}
                        >
                          列を削除
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </header>

              <ul className="kb-cards">{items}</ul>

              {composing === col.id ? (
                <form className="kb-compose" onSubmit={(e) => void addCard(e, col.id)}>
                  <input
                    name="title"
                    placeholder="やることを入力"
                    aria-label="カードの件名"
                    maxLength={200}
                    autoFocus
                    autoComplete="off"
                    onKeyDown={(e) => e.key === "Escape" && setComposing(null)}
                  />
                  <div className="row-gap">
                    <button className="btn auto">追加する</button>
                    <button type="button" className="btn btn-ghost auto" onClick={() => setComposing(null)}>やめる</button>
                  </div>
                </form>
              ) : (
                <button type="button" className="kb-add" onClick={() => setComposing(col.id)}>
                  ＋ カードを追加
                </button>
              )}
            </section>
          );
        })}

        <div className="kb-col kb-col-new">
          {addingColumn ? (
            <form className="kb-compose" onSubmit={(e) => void addColumn(e)}>
              <input
                name="name"
                placeholder="列の名前"
                aria-label="新しい列の名前"
                maxLength={50}
                autoFocus
                autoComplete="off"
                onKeyDown={(e) => e.key === "Escape" && setAddingColumn(false)}
              />
              <div className="row-gap">
                <button className="btn auto">列を追加</button>
                <button type="button" className="btn btn-ghost auto" onClick={() => setAddingColumn(false)}>やめる</button>
              </div>
            </form>
          ) : (
            <button type="button" className="kb-add" onClick={() => setAddingColumn(true)}>
              ＋ 列を追加
            </button>
          )}
        </div>
      </div>

      {dragging && (
        <div ref={ghostRef} className="kb-ghost" style={{ width: dragging.w }} aria-hidden="true">
          {dragging.todo.title}
        </div>
      )}

      {detail && (
        <Modal label="ToDoの詳細" onClose={() => setDetail(null)}>
          <TodoDetail
            key={detail.id}
            todo={detail}
            columns={columns}
            members={members}
            meId={meId}
            onShare={(ids) => shareCard(detail, ids)}
            onSave={(data) => saveDetail(detail, data)}
            onDelete={() => removeCard(detail)}
            onCancel={() => setDetail(null)}
          />
        </Modal>
      )}
    </>
  );
}
