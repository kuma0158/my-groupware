import { expect, test } from "@playwright/test";
import { register, uniqueTitle } from "./helpers";

test("お知らせを投稿すると一覧に表示される", async ({ page }) => {
  await register(page);
  const title = uniqueTitle("お知らせ");
  const body = uniqueTitle("本文");

  await page.goto("/dashboard/notices");
  await expect(page.getByRole("heading", { name: "インフォメーション" })).toBeVisible();

  await page.getByRole("button", { name: "＋ お知らせを書く" }).click();
  await page.locator('input[name="title"]').fill(title);
  await page.locator('textarea[name="body"]').fill(body);
  await page.getByRole("button", { name: "投稿する" }).click();

  // フォームが閉じて一覧に出る
  await expect(page.locator('input[name="title"]')).toHaveCount(0);
  await expect(page.locator(".list")).toContainText(title);

  // クリックで本文が開く
  await page.getByRole("button", { name: title }).click();
  await expect(page.locator(".list")).toContainText(body);
});

test("上部固定のお知らせが先頭に来る", async ({ page }) => {
  await register(page);
  const normal = uniqueTitle("通常");
  const pinned = uniqueTitle("固定");

  await page.goto("/dashboard/notices");

  // 通常のお知らせ
  await page.getByRole("button", { name: "＋ お知らせを書く" }).click();
  await page.locator('input[name="title"]').fill(normal);
  await page.getByRole("button", { name: "投稿する" }).click();

  // 固定のお知らせ
  await page.getByRole("button", { name: "＋ お知らせを書く" }).click();
  await page.locator('input[name="title"]').fill(pinned);
  await page.getByLabel("上部に固定する").check();
  await page.getByRole("button", { name: "投稿する" }).click();

  // 固定バッジが付き、先頭に表示される
  const first = page.locator(".list li").first();
  await expect(first).toContainText(pinned);
  await expect(first.locator(".badge-pin")).toHaveText("固定");
});
