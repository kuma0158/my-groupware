import { expect, type Page } from "@playwright/test";

export interface User {
  name: string;
  email: string;
  password: string;
  department: string;
}

/** テストごとに一意なメールアドレスを作る(DB を汚さない・並列実行で衝突しない) */
export function uniqueEmail(prefix = "user") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

function token() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** メンバー一覧・伝言など全ユーザー横断で表示されるため、名前も一意にする */
export function uniqueName(prefix = "テスト") {
  return `${prefix}${token()}`;
}

/** お知らせ・予定など全員に共有されるため、タイトルも一意にする */
export function uniqueTitle(prefix = "E2E") {
  return `${prefix}${token()}`;
}

/** ローカルタイムゾーンで今日の日付(YYYY-MM-DD)を返す(アプリ側と同ルール) */
export function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function register(
  page: Page,
  opts: Partial<User> = {},
): Promise<User> {
  const user: User = {
    name: opts.name ?? "山田太郎",
    email: opts.email ?? uniqueEmail(),
    password: opts.password ?? "password123",
    department: opts.department ?? "営業部",
  };
  await page.goto("/register");
  await page.locator('input[name="name"]').fill(user.name);
  await page.locator('input[name="department"]').fill(user.department);
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill(user.password);
  await page.locator('input[name="confirm"]').fill(user.password);
  await page.getByRole("button", { name: "登録する" }).click();
  // 登録後は自動ログインして /dashboard へ
  await expect(page).toHaveURL(/\/dashboard$/);
  return user;
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login/);
}
