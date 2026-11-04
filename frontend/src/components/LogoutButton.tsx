"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (busy) return;
    setBusy(true);
    try {
      await api.logout();
      router.replace("/login");
      router.refresh();
    } catch {
      // APIが失敗した場合はログイン状態を維持する。成功と誤認させない。
      setBusy(false);
      window.alert("ログアウトに失敗しました。再度お試しください。");
    }
  }

  return (
    <button className="btn btn-ghost" onClick={onClick} disabled={busy}>
      ログアウト
    </button>
  );
}
