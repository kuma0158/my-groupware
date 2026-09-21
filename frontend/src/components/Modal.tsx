"use client";

import { useEffect, useRef } from "react";

/**
 * 画面中央に開く小窓。<dialog> を使っているので、
 * Esc で閉じる・背面を操作させない・フォーカスを中に留める、が標準で効く。
 */
export default function Modal({
  label,
  onClose,
  children,
}: {
  /** 読み上げ用の名前 */
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOutside = useRef(false);

  useEffect(() => {
    const d = ref.current;
    if (!d || d.open) return;
    d.showModal();
    // showModal は先頭のボタン(閉じる)にフォーカスを移すので、入力欄があればそちらへ移し直す
    d.querySelector<HTMLElement>(".modal-card input:not([type=checkbox]), .modal-card textarea, .modal-card select")?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={label}
      // Esc は cancel → close の順に届くので、close だけで閉じる
      onClose={onClose}
      // 枠の外(背景)で押して離したときだけ閉じる。中の文字を選択しながら外で離しても閉じない
      onPointerDown={(e) => (pressedOutside.current = e.target === ref.current)}
      onClick={(e) => pressedOutside.current && e.target === ref.current && onClose()}
    >
      <div className="modal-card">
        <button type="button" className="icon modal-close" title="閉じる" onClick={onClose}>
          ✕
        </button>
        {children}
      </div>
    </dialog>
  );
}
