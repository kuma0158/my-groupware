"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));

    if (isRegister && password !== String(f.get("confirm"))) {
      setError("パスワードが一致しません");
      return;
    }
    setLoading(true);
    try {
      if (isRegister) await api.register(String(f.get("name")), email, password, String(f.get("department") ?? ""));
      else await api.login(email, password);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={onSubmit}>
        <h1>{isRegister ? "新規登録" : "ログイン"}</h1>
        {isRegister && (
          <div className="field">
            <label htmlFor="name">お名前</label>
            <input id="name" name="name" required maxLength={100} autoComplete="name" />
          </div>
        )}
        {isRegister && (
          <div className="field">
            <label htmlFor="department">部署</label>
            <input id="department" name="department" maxLength={100} autoComplete="organization" />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">メールアドレス</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">パスワード{isRegister && "(8文字以上)"}</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={isRegister ? 8 : undefined}
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
        </div>
        {isRegister && (
          <div className="field">
            <label htmlFor="confirm">パスワード(確認)</label>
            <input id="confirm" name="confirm" type="password" required autoComplete="new-password" />
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={loading}>
          {loading ? "処理中..." : isRegister ? "登録する" : "ログイン"}
        </button>
        {isRegister && (
          <p className="sub">
            アカウントをお持ちの方は <Link href="/login">ログイン</Link>
          </p>
        )}
      </form>
    </div>
  );
}
