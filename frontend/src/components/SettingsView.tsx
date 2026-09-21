"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { AdminUser, ColorScheme, Role, User } from "@/lib/types";

const SCHEMES: { key: ColorScheme; label: string; note: string; swatch: string[] }[] = [
  { key: "warm", label: "暖色", note: "オレンジ・赤系のやわらかい配色", swatch: ["#fbf3ec", "#b4501f", "#c9862a"] },
  { key: "neutral", label: "中間色", note: "グレーと深緑の落ち着いた配色(標準)", swatch: ["#e8ecee", "#0f6b52", "#64757f"] },
  { key: "cool", label: "寒色", note: "青・水色系のすっきりした配色", swatch: ["#eaf1f8", "#1f5f9e", "#2a8a9c"] },
  { key: "dark", label: "ダークモード", note: "暗い背景で目に優しい配色", swatch: ["#14181d", "#4fc3a1", "#8a97a3"] },
];

const ROLE_LABEL: Record<Role, string> = { power: "パワーユーザー", user: "一般ユーザー" };

type Tab = "profile" | "scheme" | "users";

export default function SettingsView({ me }: { me: User }) {
  const isPower = me.role === "power";
  const [tab, setTab] = useState<Tab>("profile");
  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "プロフィール" },
    { key: "scheme", label: "カラースキーム" },
    ...(isPower ? [{ key: "users" as Tab, label: "ユーザー管理" }] : []),
  ];
  return (
    <div className="settings">
      <div className="seg" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "profile" && <ProfilePanel me={me} />}
      {tab === "scheme" && <SchemePanel me={me} />}
      {tab === "users" && isPower && <UsersPanel meId={me.id} />}
    </div>
  );
}

function ProfilePanel({ me }: { me: User }) {
  const router = useRouter();
  const [name, setName] = useState(me.name);
  const [department, setDepartment] = useState(me.department);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.updateMe({ name, department });
      setMsg({ ok: true, text: "保存しました" });
      router.refresh(); // 上部の名前も更新する
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "保存できませんでした" });
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    try {
      await api.changePassword(cur, next);
      setCur("");
      setNext("");
      setPwMsg({ ok: true, text: "パスワードを変更しました" });
    } catch (err) {
      setPwMsg({ ok: false, text: err instanceof Error ? err.message : "変更できませんでした" });
    }
  }

  return (
    <div className="settings-grid">
      <form className="card" onSubmit={saveProfile}>
        <h2 className="section-head">プロフィール</h2>
        <div className="field">
          <label>メールアドレス</label>
          <input value={me.email} disabled />
        </div>
        <div className="field">
          <label htmlFor="pf-name">名前</label>
          <input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
        </div>
        <div className="field">
          <label htmlFor="pf-dept">部署</label>
          <input id="pf-dept" value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={100} />
        </div>
        <p className="muted">権限: {ROLE_LABEL[me.role]}</p>
        {msg && <p className={msg.ok ? "muted" : "error"} role="status">{msg.text}</p>}
        <button className="btn auto" type="submit">保存</button>
      </form>

      <form className="card" onSubmit={savePassword}>
        <h2 className="section-head">パスワードの変更</h2>
        <div className="field">
          <label htmlFor="pw-cur">現在のパスワード</label>
          <input id="pw-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="pw-new">新しいパスワード(8文字以上)</label>
          <input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
        </div>
        {pwMsg && <p className={pwMsg.ok ? "muted" : "error"} role="status">{pwMsg.text}</p>}
        <button className="btn auto" type="submit">変更する</button>
      </form>
    </div>
  );
}

function SchemePanel({ me }: { me: User }) {
  const router = useRouter();
  const [current, setCurrent] = useState<ColorScheme>(me.color_scheme);
  const [error, setError] = useState("");

  async function pick(key: ColorScheme) {
    if (key === current) return;
    const prev = current;
    setCurrent(key);
    setError("");
    try {
      await api.updateMe({ color_scheme: key });
      router.refresh(); // レイアウトの data-scheme が入れ替わり、全体の色が変わる
    } catch (err) {
      setCurrent(prev);
      setError(err instanceof Error ? err.message : "変更できませんでした");
    }
  }

  return (
    <div className="card">
      <h2 className="section-head">カラースキーム</h2>
      <p className="muted">画面全体の色合いを選びます。あなたのアカウントにだけ反映され、どの端末でも同じになります。</p>
      {error && <p className="error">{error}</p>}
      <div className="scheme-options" role="radiogroup" aria-label="カラースキーム">
        {SCHEMES.map((s) => (
          <button
            key={s.key}
            type="button"
            role="radio"
            aria-checked={current === s.key}
            className={`scheme-option${current === s.key ? " on" : ""}`}
            onClick={() => pick(s.key)}
          >
            <span className="scheme-swatch" aria-hidden="true">
              {s.swatch.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
            <strong>{s.label}</strong>
            <span className="muted">{s.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UsersPanel({ meId }: { meId: number }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    api.adminUsers().then(setUsers, (e) => setError(e instanceof Error ? e.message : "読み込めませんでした"));
  }, []);

  async function patch(u: AdminUser, data: Partial<{ role: Role; is_active: boolean }>) {
    setBusy(u.id);
    setError("");
    try {
      const updated = await api.patchAdminUser(u.id, data);
      setUsers((list) => list?.map((x) => (x.id === u.id ? updated : x)) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "変更できませんでした");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <h2 className="section-head">ユーザー管理</h2>
      <p className="muted">
        パワーユーザーは、この画面でユーザーの権限と有効/無効を変えられます。一般ユーザーは自分のプロフィールと配色だけ変えられます。
        パワーユーザーは常に1人以上必要です。
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {!users ? (
        !error && <p className="muted">読み込み中…</p>
      ) : (
        <div className="table-wrap">
          <table className="user-table">
            <thead>
              <tr><th>名前</th><th>メール</th><th>部署</th><th>権限</th><th>状態</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.is_active ? "" : "inactive"}>
                  <td>{u.name}{u.id === meId && <span className="sub-text"> (自分)</span>}</td>
                  <td>{u.email}</td>
                  <td>{u.department}</td>
                  <td>
                    <select
                      aria-label={`${u.name}の権限`}
                      value={u.role}
                      disabled={busy === u.id}
                      onChange={(e) => patch(u, { role: e.target.value as Role })}
                    >
                      <option value="power">{ROLE_LABEL.power}</option>
                      <option value="user">{ROLE_LABEL.user}</option>
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy === u.id || u.id === meId}
                      title={u.id === meId ? "自分自身は無効にできません" : undefined}
                      onClick={() => patch(u, { is_active: !u.is_active })}
                    >
                      {u.is_active ? "有効(無効にする)" : "無効(有効にする)"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
