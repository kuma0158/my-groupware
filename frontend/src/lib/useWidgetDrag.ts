"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const LONG_PRESS_MS = 350; // スマホで長押しと判定するまでの時間
const MOUSE_THRESHOLD = 5; // マウスでドラッグ開始とみなす移動量(px)
const SCROLL_THRESHOLD = 12; // 長押し前にこれ以上動いたらスクロール操作とみなす
const FLIP_MS = 220; // 他のカードが新しい位置へ動くアニメーションの長さ
const DROP_MS = 180; // 離したカードが収まるまでの長さ
const SWAP_COOLDOWN_MS = 180; // 入れ替え直後の再入れ替えを抑える時間

type Drag = {
  id: string;
  /** カード左上から見た、つかんだ位置 */
  grabX: number;
  grabY: number;
  /** 押し始めのポインタ位置(しきい値の判定用) */
  startX: number;
  startY: number;
  /** 最新のポインタ位置 */
  x: number;
  y: number;
  /** 並べ替え後のレイアウト上の左上(transform を除いた位置) */
  baseX: number;
  baseY: number;
  active: boolean;
  timer: number;
  frame: number;
  lastSwap: number;
};

/**
 * ウィジェットの並べ替え。つかんだカードはポインタに追従し、
 * 押しのけられたカードはアニメーションで新しい位置へ移動する。
 *
 * 滑らかさのため、ドラッグ中の位置更新は React の再描画ではなく
 * DOM の style を直接書き換えて行う(毎フレーム再描画すると重い)。
 *
 * @param orderKey 並び順が変わったことを検知するための文字列
 * @param onMove   並べ替えを実際に適用する関数
 */
export function useWidgetDrag(orderKey: string, onMove: (fromId: string, toId: string) => void) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<Drag | null>(null);
  /** 並べ替え直前の各カードの位置。動いた差分を打ち消してからアニメーションさせる */
  const prevRects = useRef<Map<string, DOMRect> | null>(null);

  const items = useCallback(
    () => Array.from(boardRef.current?.querySelectorAll<HTMLElement>("[data-widget-id]") ?? []),
    [],
  );
  const itemOf = useCallback(
    (id: string) => boardRef.current?.querySelector<HTMLElement>(`[data-widget-id="${id}"]`) ?? null,
    [],
  );

  /** つかんでいるカードをポインタの位置へ動かす */
  const paint = useCallback(() => {
    const d = drag.current;
    if (!d?.active) return;
    const el = itemOf(d.id);
    if (!el) return;
    const tx = d.x - d.grabX - d.baseX;
    const ty = d.y - d.grabY - d.baseY;
    // 少し浮かせて傾けると「つかんでいる」感じが出る
    el.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(1.03) rotate(1deg)`;
  }, [itemOf]);

  const schedulePaint = useCallback(() => {
    const d = drag.current;
    if (!d || d.frame) return;
    d.frame = requestAnimationFrame(() => {
      if (drag.current) drag.current.frame = 0;
      paint();
    });
  }, [paint]);

  const begin = useCallback(
    (d: Drag) => {
      const el = itemOf(d.id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      d.baseX = r.left;
      d.baseY = r.top;
      d.grabX = d.startX - r.left;
      d.grabY = d.startY - r.top;
      d.active = true;
      setDraggingId(d.id);
      document.body.classList.add("dragging-active");
      navigator.vibrate?.(20); // 長押しが効いたことを伝える(対応端末のみ)
      paint();
    },
    [itemOf, paint],
  );

  const finish = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    clearTimeout(d.timer);
    cancelAnimationFrame(d.frame);
    if (!d.active) return;

    // 元のマス目へすっと収まるように戻す
    const el = itemOf(d.id);
    if (el) {
      el.style.transition = `transform ${DROP_MS}ms cubic-bezier(.2,.8,.3,1)`;
      el.style.transform = "";
      setTimeout(() => {
        el.style.transition = "";
      }, DROP_MS);
    }
    setDraggingId(null);
    document.body.classList.remove("dragging-active");
  }, [itemOf]);

  // ドラッグ中はページのスクロールを止める(touch-action だけでは
  // ジェスチャー途中からの変更が効かないため、明示的に抑止する)
  useEffect(() => {
    if (!draggingId) return;
    const block = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", block, { passive: false });
    return () => document.removeEventListener("touchmove", block);
  }, [draggingId]);

  // 並び順が変わった直後に、各カードを「元の位置」から新しい位置へ動かす
  useLayoutEffect(() => {
    const prev = prevRects.current;
    prevRects.current = null;
    if (!prev) return;

    const d = drag.current;
    if (d?.active) {
      // つかんでいるカードは、ずれた分だけ基準位置を取り直す
      const el = itemOf(d.id);
      if (el) {
        el.style.transition = "";
        el.style.transform = "";
        const r = el.getBoundingClientRect();
        d.baseX = r.left;
        d.baseY = r.top;
        paint();
      }
    }

    const moved: { el: HTMLElement; dx: number; dy: number }[] = [];
    for (const el of items()) {
      const id = el.dataset.widgetId!;
      if (id === d?.id) continue;
      const before = prev.get(id);
      if (!before) continue;
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (dx || dy) moved.push({ el, dx, dy });
    }
    if (!moved.length) return;

    // いったん元の位置に見せてから、新しい位置へアニメーションさせる
    for (const { el, dx, dy } of moved) {
      el.style.transition = "none";
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    }
    requestAnimationFrame(() => {
      for (const { el } of moved) {
        el.style.transition = `transform ${FLIP_MS}ms cubic-bezier(.2,.8,.3,1)`;
        el.style.transform = "";
        setTimeout(() => {
          el.style.transition = "";
        }, FLIP_MS);
      }
    });
  }, [orderKey, items, itemOf, paint]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      // ボタンや入力欄の操作はドラッグにしない
      if (target.closest("button, a, input, textarea, select")) return;
      // つかめるのは見出し([data-drag-handle])だけ。本文のクリックは画面遷移に使う
      if (!target.closest("[data-drag-handle]")) return;
      const el = target.closest<HTMLElement>("[data-widget-id]");
      if (!el) return;

      const d: Drag = {
        id: el.dataset.widgetId!,
        grabX: 0,
        grabY: 0,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        baseX: 0,
        baseY: 0,
        active: false,
        timer: 0,
        frame: 0,
        lastSwap: 0,
      };
      drag.current = d;
      // ボード側で受け取る。つかんだカードは pointer-events を切るため、
      // カード自身に捕捉させると途中でイベントが届かなくなる
      e.currentTarget.setPointerCapture(e.pointerId);

      if (e.pointerType !== "mouse") {
        d.timer = window.setTimeout(() => begin(d), LONG_PRESS_MS);
      }
    },
    [begin],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d) return;
      d.x = e.clientX;
      d.y = e.clientY;

      if (!d.active) {
        const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
        if (e.pointerType === "mouse") {
          if (moved < MOUSE_THRESHOLD) return;
          begin(d);
        } else {
          if (moved > SCROLL_THRESHOLD) finish(); // 長押し前に動いた = スクロール
          return;
        }
      }
      schedulePaint();

      // 入れ替え直後は少し待つ。待たないと、動いたカードに反応して往復してしまう
      const now = performance.now();
      if (now - d.lastSwap < SWAP_COOLDOWN_MS) return;

      // つかんだカードは pointer-events: none なので、下にあるカードが取れる
      const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const overId = under?.closest<HTMLElement>("[data-widget-id]")?.dataset.widgetId;
      if (!overId || overId === d.id) return;

      // 相手の中心を越えてから入れ替える(境界での細かい揺れを防ぐ)
      const r = itemOf(overId)!.getBoundingClientRect();
      const passed = Math.abs(e.clientX - (r.left + r.width / 2)) < r.width / 4
        || Math.abs(e.clientY - (r.top + r.height / 2)) < r.height / 4;
      if (!passed) return;

      d.lastSwap = now;
      prevRects.current = new Map(items().map((el) => [el.dataset.widgetId!, el.getBoundingClientRect()]));
      onMove(d.id, overId);
    },
    [begin, finish, itemOf, items, onMove, schedulePaint],
  );

  return {
    draggingId,
    boardRef,
    boardHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}
