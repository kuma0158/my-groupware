import { expect, test } from "@playwright/test";
import { login, logout, register, uniqueEmail } from "./helpers";

test("未ログインで /dashboard にアクセスすると /login にリダイレクトされる", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("新規登録すると自動ログインしてダッシュボードが表示される", async ({ page }) => {
  const user = await register(page, { name: "田中太郎", department: "営業部" });

  await expect(page.getByRole("heading", { name: "ホーム" })).toBeVisible();
  // サイドバーに自分の名前と部署が表示される
  await expect(page.locator(".topbar")).toContainText("田中太郎");
  await expect(page.locator(".topbar")).toContainText("営業部");
  // 認証済みなら API(/auth/me)が自分を返す
  const me = await page.evaluate(async () => {
    const res = await fetch("/api/auth/me");
    return res.json();
  });
  expect(me.email).toBe(user.email);
});

test("ログイン → ログアウト → 再ログイン", async ({ page }) => {
  const user = await register(page, { name: "鈴木花子" });

  await logout(page);
  await expect(page).toHaveURL(/\/login/);

  // ログアウト後は /dashboard に戻れない
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);

  await login(page, user.email, user.password);
  await expect(page.getByRole("heading", { name: "ホーム" })).toBeVisible();
  await expect(page.locator(".topbar")).toContainText("鈴木花子");
});

test("誤ったパスワードではログインできない", async ({ page }) => {
  const user = await register(page);
  await logout(page);

  await page.goto("/login");
  await page.locator('input[name="email"]').fill(user.email);
  await page.locator('input[name="password"]').fill("wrong-password");
  await page.getByRole("button", { name: "ログイン" }).click();

  // 認証エラーは <p class="error" role="alert"> に表示される(Next の route-announcer とは区別する)
  await expect(page.locator("p.error")).toContainText("正しくありません");
  await expect(page).toHaveURL(/\/login/);
});

test("同じメールアドレスでは再登録できない", async ({ page }) => {
  const email = uniqueEmail("dup");
  await register(page, { email });
  await logout(page);

  await page.goto("/register");
  await page.locator('input[name="name"]').fill("別の名前");
  await page.locator('input[name="department"]').fill("総務部");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill("password123");
  await page.locator('input[name="confirm"]').fill("password123");
  await page.getByRole("button", { name: "登録する" }).click();

  await expect(page.locator("p.error")).toContainText("既に登録されています");
});
