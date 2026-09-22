"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { onBadgesRefresh } from "@/lib/badges";
import LogoutButton from "./LogoutButton";
import type { Badges, User } from "@/lib/types";

const POLL_MS = 60_000; // 新着を見に行く間隔
const BADGE_MAX = 99; // これを超えたら「99+」と出す

/** アイコンの共通設定。太さと大きさをここで揃えている */
const icon = (path: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

// メニューを増やすときはこの配列に追加する
const NAV = [
  {
    href: "/dashboard",
    label: "ポータル",
    icon: icon(
      <>
        <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
      </>,
    ),
  },
  {
    href: "/dashboard/schedule",
    label: "スケジュール",
    icon: icon(
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>,
    ),
  },
  {
    href: "/dashboard/todos",
    label: "ToDo",
    badge: "todos" as const,
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="m7.5 12.5 3 3 6-6" />
      </>,
    ),
  },
  {
    href: "/dashboard/notices",
    label: "インフォメーション",
    badge: "notices" as const,
    icon: icon(
      <>
        <path d="M18.5 9.5a6.5 6.5 0 0 0-13 0c0 4.5-1.6 6.2-1.6 6.2h16.2s-1.6-1.7-1.6-6.2Z" />
        <path d="M10 19a2 2 0 0 0 4 0" />
      </>,
    ),
  },
  {
    href: "/dashboard/office",
    label: "伝言・在席",
    badge: "messages" as const,
    icon: icon(
      <>
        <path d="M4 4.5h16A1.5 1.5 0 0 1 21.5 6v9a1.5 1.5 0 0 1-1.5 1.5H9.5L5 20.5v-4H4A1.5 1.5 0 0 1 2.5 15V6A1.5 1.5 0 0 1 4 4.5Z" />
        <path d="M7 9h10M7 12.5h6" />
      </>,
    ),
  },
];

// ToDo は「開いている件数」なので、既読の仕組みが無い。画面を開いた時点の件数を
// 「見た分」として覚え、それを超えて増えた分だけをバッジに出す
const SEEN_KEY = (userId: number) => `todos-seen-${userId}`;
const TODO_HREF = "/dashboard/todos";

export default function TopNav({ user }: { user: User }) {
  const path = usePathname();
  const [badges, setBadges] = useState<Badges>({ todos: 0, notices: 0, messages: 0 });
  const [seenTodos, setSeenTodos] = useState(0);
  const onTodos = path.startsWith(TODO_HREF);

  // 前回までに見た件数を戻す(リロードしても消えたままにする)
  useEffect(() => {
    try {
      setSeenTodos(Number(localStorage.getItem(SEEN_KEY(user.id))) || 0);
    } catch {}
  }, [user.id]);

  // 画面を移ったときと一定間隔で数え直す。既読にした直後も画面移動で消える
  useEffect(() => {
    let stale = false;
    const load = () =>
      api.badges().then(
        (b) => {
          if (stale) return;
          setBadges(b);
          // ToDo 画面に居る間は今の件数を見た分とし、完了などで減ったら見た分も減らす
          setSeenTodos((prev) => {
            const next = onTodos ? b.todos : Math.min(prev, b.todos);
            if (next !== prev) {
              try {
                localStorage.setItem(SEEN_KEY(user.id), String(next));
              } catch {}
            }
            return next;
          });
        },
        () => {},
      );
    load();
    const t = setInterval(load, POLL_MS);
    const off = onBadgesRefresh(load); // 投稿・既読など、件数が変わる操作の直後
    return () => {
      stale = true;
      clearInterval(t);
      off();
    };
  }, [path, onTodos, user.id]);

  return (
    <header className="topbar">
      <Link href="/dashboard" className="brand" aria-label="CoreDesk ポータルへ">
        <svg className="brand-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2.5" y="5" width="19" height="14" rx="3" />
          <circle cx="12" cy="12" r="2.8" fill="currentColor" stroke="none" />
        </svg>
        <span className="brand-word">CoreDesk</span>
      </Link>
      <nav className="topnav">
        {NAV.map((n) => {
          // ポータルだけは完全一致。他は配下の画面でも点灯させる
          const active = n.href === "/dashboard" ? path === n.href : path.startsWith(n.href);
          let count = n.badge ? badges[n.badge] : 0;
          // ToDo は画面を開いた瞬間に消す(取得を待たない)。以後は見た分を超えて増えた件数だけ出す
          if (n.badge === "todos") count = onTodos ? 0 : Math.max(0, count - seenTodos);
          return (
            <Link key={n.href} href={n.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
              <span className="topnav-icon">
                {n.icon}
                {count > 0 && (
                  <span className="badge-count" aria-label={`新着${count}件`}>
                    {count > BADGE_MAX ? `${BADGE_MAX}+` : count}
                  </span>
                )}
              </span>
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="me">
        <Link
          href="/dashboard/settings"
          className={`me-link${path.startsWith("/dashboard/settings") ? " active" : ""}`}
          title="設定"
          aria-label="設定"
        >
          {icon(
            <>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z" />
            </>,
          )}
          <span>設定</span>
        </Link>
        <span>
          {user.name}
          {user.department && <span className="sub-text"> / {user.department}</span>}
        </span>
        <LogoutButton />
      </div>
    </header>
  );
}
