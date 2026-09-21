"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LogoutButton() {
  const router = useRouter();

  async function onClick() {
    await api.logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <button className="btn btn-ghost" onClick={onClick}>
      ログアウト
    </button>
  );
}
