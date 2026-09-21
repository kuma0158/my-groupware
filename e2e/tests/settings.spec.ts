import { expect, test } from "@playwright/test";
import { login, logout, register, uniqueName } from "./helpers";

test("上部の歯車「設定」から設定画面を開ける", async ({ page }) => {
  await register(page);
  await page.getByRole("link", { name: "設定" }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings$/);
  await expect(page.getByRole("heading", { name: "設定", level: 1 })).toBeVisible();
});

test("プロフィール(名前・部署)を変更できる", async ({ page }) => {
  await register(page);
  await page.goto("/dashboard/settings");
  const name = uniqueName("改名");
  await page.locator("#pf-name").fill(name);
  await page.locator("#pf-dept").fill("開発部");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("保存しました")).toBeVisible();
  // 上部の表示にも反映される
  await expect(page.locator(".topbar")).toContainText(name);
  await expect(page.locator(".topbar")).toContainText("開発部");
});

test("パスワードを変更すると新しいパスワードでログインできる", async ({ page }) => {
  const user = await register(page);
  await page.goto("/dashboard/settings");
  await page.locator("#pw-cur").fill("wrong-password");
  await page.locator("#pw-new").fill("newpassword99");
  await page.getByRole("button", { name: "変更する" }).click();
  await expect(page.getByText("現在のパスワードが正しくありません")).toBeVisible();

  await page.locator("#pw-cur").fill(user.password);
  await page.getByRole("button", { name: "変更する" }).click();
  await expect(page.getByText("パスワードを変更しました")).toBeVisible();

  await logout(page);
  await login(page, user.email, "newpassword99");
});

test("カラースキームを切り替えると全体の配色が変わり、再ログイン後も保たれる", async ({ page }) => {
  const user = await register(page);
  const shell = page.locator(".shell");
  await expect(shell).toHaveAttribute("data-scheme", "neutral");
  const bgOf = () => shell.evaluate((el) => getComputedStyle(el).backgroundColor);
  const neutralBg = await bgOf();

  await page.goto("/dashboard/settings");
  await page.getByRole("tab", { name: "カラースキーム" }).click();
  const seen = new Set([neutralBg]);
  for (const [label, key] of [["暖色", "warm"], ["寒色", "cool"], ["ダークモード", "dark"]] as const) {
    await page.getByRole("radio", { name: new RegExp(label) }).click();
    await expect(shell).toHaveAttribute("data-scheme", key);
    seen.add(await bgOf());
  }
  expect(seen.size).toBe(4); // 4つの背景色がすべて違う

  // ダークのまま再ログインしても保たれる(アカウントに保存されている)
  await logout(page);
  await login(page, user.email, user.password);
  await expect(page.locator(".shell")).toHaveAttribute("data-scheme", "dark");
});

test("ユーザー管理は権限に応じて出る・出ない", async ({ page }) => {
  await register(page);
  await page.goto("/dashboard/settings");
  const me = await page.evaluate(async () => (await fetch("/api/auth/me")).json());
  const usersTab = page.getByRole("tab", { name: "ユーザー管理" });
  const status = await page.evaluate(async () => (await fetch("/api/admin/users")).status);

  if (me.role === "power") {
    expect(status).toBe(200);
    await usersTab.click();
    // 自分の行がある。自分自身は無効にできない
    const row = page.locator(".user-table tr", { hasText: me.email });
    await expect(row).toContainText("(自分)");
    await expect(row.getByRole("button")).toBeDisabled();
  } else {
    expect(status).toBe(403);
    await expect(usersTab).toHaveCount(0);
  }
});
