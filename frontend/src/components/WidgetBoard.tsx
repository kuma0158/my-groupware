"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useWidgetDrag } from "@/lib/useWidgetDrag";
import type { Summary, Widget } from "@/lib/types";
import { WIDGETS, WIDGET_LIST } from "@/lib/widgets";

const SAVE_DELAY_MS = 700; // 連続操作をまとめて保存するまでの待ち時間

export default function WidgetBoard({ initial, summary }: { initial: Widget[]; summary: Summary }) {
  const router = useRouter();
  const [widgets, setWidgets] = useState<Widget[]>(initial);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const dirty = useRef(false);

  const update = useCallback((next: Widget[] | ((prev: Widget[]) => Widget[])) => {
    dirty.current = true;
    setWidgets(next);
  }, []);

  // 変更のたびに送らず、少し待ってからまとめて保存する
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(async () => {
      dirty.current = false;
      setSaveState("saving");
      try {
        await api.saveLayout(widgets);
        setSaveState("idle");
      } catch {
        setSaveState("error");
      }
    }, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [widgets]);

  const move = useCallback(
    (fromId: string, toId: string) => {
      update((prev) => {
        const from = prev.findIndex((w) => w.id === fromId);
        const to = prev.findIndex((w) => w.id === toId);
        if (from < 0 || to < 0) return prev;
        // 固定カードをまたぐ移動も防ぎ、並べ替えで固定位置がずれないようにする。
        if (prev.slice(Math.min(from, to), Math.max(from, to) + 1).some((w) => w.pinned)) return prev;
        const next = [...prev];
        next.splice(to, 0, ...next.splice(from, 1));
        return next;
      });
    },
    [update],
  );

  // 並び順が変わったことをドラッグ処理に伝えるための文字列
  const orderKey = widgets.map((w) => `${w.id}:${w.span}`).join(",");
  const { draggingId, boardRef, boardHandlers } = useWidgetDrag(orderKey, move);

  function add(type: string) {
    const def = WIDGETS[type];
    const id = `w-${type}-${Date.now().toString(36)}`;
    update((prev) => [...prev, { id, type, span: def.defaultSpan ?? 1, props: {} }]);
    setMenuOpen(false);
  }

  function remove(id: string) {
    update((prev) => prev.filter((w) => w.id !== id || w.pinned));
  }

  function toggleSpan(id: string) {
    update((prev) => prev.map((w) => (w.id === id && !w.pinned ? { ...w, span: w.span === 1 ? 2 : 1 } : w)));
  }

  function togglePin(id: string) {
    update((prev) => prev.map((w) => (w.id === id ? { ...w, pinned: !w.pinned } : w)));
  }

  /** 本文のクリックで詳細画面へ。中の操作や文字の選択は邪魔しない */
  function openDetail(href: string, e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("a, button, input, textarea, select, label")) return;
    if (window.getSelection()?.toString()) return;
    router.push(href);
  }

  function setProps(id: string, props: Record<string, string>) {
    update((prev) => prev.map((w) => (w.id === id ? { ...w, props: { ...w.props, ...props } } : w)));
  }

  return (
    <>
      <div className="board-bar">
        <p className="muted">
          カードは見出しをつかむと並べ替えできます(スマホは長押し)。本文をクリックすると各画面へ移動します
          。ピン止め中は移動・幅変更・削除をロックします
          {saveState === "saving" && " · 保存中…"}
          {saveState === "error" && " · 保存に失敗しました"}
        </p>
        <div className="menu-wrap">
          <button className="btn btn-ghost" onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen}>
            ＋ ウィジェット追加
          </button>
          {menuOpen && (
            <div className="menu">
              {WIDGET_LIST.map((w) => (
                <button key={w.type} onClick={() => add(w.type)}>
                  {w.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="board" ref={boardRef} {...boardHandlers}>
        {widgets.map((w) => {
          const def = WIDGETS[w.type];
          if (!def) return null; // 定義が消えたウィジェットは表示しない
          return (
            <section
              key={w.id}
              className={`card widget${draggingId === w.id ? " dragging" : ""}`}
              style={{ gridColumn: `span ${w.span}` }}
              data-widget-id={w.id}
              data-widget-type={w.type}
              data-pinned={w.pinned ? "true" : "false"}
            >
              <header className="widget-head" data-drag-handle={w.pinned ? undefined : true}>
                <span className="grip" aria-hidden="true">
                  {w.pinned ? "📌" : "⠿"}
                </span>
                <h2>{def.title}</h2>
                <button className="icon pin-toggle" title={w.pinned ? "ピン止めを解除" : "ピン止め"} aria-pressed={!!w.pinned} onClick={() => togglePin(w.id)}>
                  {w.pinned ? "解除" : "固定"}
                </button>
                <button className="icon" title="幅を変える" disabled={!!w.pinned} onClick={() => toggleSpan(w.id)}>
                  ⇔
                </button>
                <button className="icon" title="削除" disabled={!!w.pinned} onClick={() => remove(w.id)}>
                  ✕
                </button>
              </header>
              <div
                className={`widget-body${def.href ? " widget-link" : ""}`}
                {...(def.href && {
                  role: "link",
                  tabIndex: 0,
                  "aria-label": `${def.title}の詳細を開く`,
                  onClick: (e: React.MouseEvent) => openDetail(def.href!, e),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === "Enter") router.push(def.href!);
                  },
                })}
              >
                <def.View widget={w} summary={summary} setProps={(p) => setProps(w.id, p)} />
              </div>
            </section>
          );
        })}
      </div>

      {widgets.length === 0 && <p className="muted">ウィジェットがありません。右上の「＋ ウィジェット追加」から追加してください。</p>}
    </>
  );
}
