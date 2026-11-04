import { test, expect, type Page } from "@playwright/test";

const PASSWORD = "initial-password-123";
const NEW_PASSWORD = "updated-password-456";

function uniqueEmail(testName: string): string {
  return `e2e-${testName}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@example.com`;
}

async function register(page: Page, email: string) {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "新規登録" })).toBeVisible();
  await page.getByLabel("お名前").fill("E2E テストユーザー");
  await page.getByLabel("部署").fill("品質保証");
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード", { exact: false }).first().fill(PASSWORD);
  await page.getByLabel("パスワード(確認)").fill(PASSWORD);
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/);
}

test("未認証でダッシュボードを開くとログイン画面に移動する", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("heading", { name: "ログイン" })).toBeVisible();
});

test("新規登録からダッシュボードを表示し、HttpOnly Cookieを受け取る", async ({ page, context }) => {
  await register(page, uniqueEmail("register"));
  const cookies = await context.cookies();
  const auth = cookies.find((cookie) => cookie.name === "access_token");
  expect(auth).toBeDefined();
  expect(auth?.httpOnly).toBe(true);
  expect(auth?.sameSite).toBe("Lax");
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/);
});

test("ログアウト後は旧JWTを再利用できず、ログインし直せる", async ({ page, context, request }) => {
  const email = uniqueEmail("logout");
  await register(page, email);
  const oldCookie = (await context.cookies()).find((cookie) => cookie.name === "access_token");
  expect(oldCookie).toBeDefined();
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);

  const replay = await request.get("/api/auth/me", {
    headers: { Cookie: `access_token=${oldCookie!.value}` },
  });
  expect(replay.status()).toBe(401);

  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/);
});

test("パスワード変更後は旧JWTが失効し、新パスワードでログインできる", async ({ page, context, request }) => {
  const email = uniqueEmail("password");
  await register(page, email);
  const oldCookie = (await context.cookies()).find((cookie) => cookie.name === "access_token");
  expect(oldCookie).toBeDefined();

  await page.goto("/dashboard/settings");
  await page.getByLabel("現在のパスワード").fill(PASSWORD);
  await page.getByLabel("新しいパスワード(8文字以上)").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "変更する" }).click();
  await expect(page.getByText("パスワードを変更しました")).toBeVisible();

  const replay = await request.get("/api/auth/me", {
    headers: { Cookie: `access_token=${oldCookie!.value}` },
  });
  expect(replay.status()).toBe(401);
  await page.reload();
  await expect(page).toHaveURL(/\/dashboard\/settings/);

  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page.getByLabel("メールアドレス").fill(email);
  await page.getByLabel("パスワード").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/);
});

test("別オリジンの状態変更リクエストを403で拒否する", async ({ page, request }) => {
  const email = uniqueEmail("csrf");
  await register(page, email);
  const response = await request.post("/api/auth/login", {
    headers: { Origin: "https://untrusted.example" },
    data: { email, password: PASSWORD },
  });
  expect(response.status()).toBe(403);
});
