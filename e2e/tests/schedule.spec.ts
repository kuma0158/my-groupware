import { expect, test } from "@playwright/test";
import { register, todayISO, uniqueTitle } from "./helpers";

test("スケジュールに予定を登録するとカレンダーに表示される", async ({ page }) => {
  await register(page);
  const title = uniqueTitle("打合");

  await page.goto("/dashboard/schedule");
  await expect(page.getByRole("heading", { name: "スケジュール" })).toBeVisible();

  // 週表示の「時間未定」欄(今日のセル)をクリックして追加フォームを開く
  await page.locator(`.cal-allday-cell[data-date="${todayISO()}"]`).click();
  await page.locator('input[name="title"]').fill(title);
  await page.getByRole("button", { name: "登録する" }).click();

  // フォームが閉じて、今日の「時間未定」欄に予定が並ぶ
  await expect(page.locator('input[name="title"]')).toHaveCount(0);
  await expect(page.locator(".cal-allday-cell").filter({ hasText: title })).toBeVisible();
});

test("登録した予定を削除できる", async ({ page }) => {
  await register(page);
  const title = uniqueTitle("削除");

  await page.goto("/dashboard/schedule");

  // 週表示の時間枠(今日の 10:00)をクリックして追加フォームを開く
  await page
    .locator(`.cal-col[data-date="${todayISO()}"] .cal-slot`)
    .nth(10)
    .click();
  await page.locator('input[name="title"]').fill(title);
  await page.getByRole("button", { name: "登録する" }).click();

  // 時間枠に予定ブロックが表示される
  const block = page.getByRole("button", { name: title });
  await expect(block).toBeVisible();

  // ブロックをクリックして詳細パネルを開き、削除する
  await block.click();
  await page.getByRole("button", { name: "削除する" }).click();
  await expect(page.getByText(title)).toHaveCount(0);
});

test("予定をドラッグすると時間を移動できる", async ({ page }) => {
  await register(page);
  const title = uniqueTitle("移動");

  await page.goto("/dashboard/schedule");
  await page.locator(`.cal-col[data-date="${todayISO()}"] .cal-slot`).nth(9).click();
  await page.locator('input[name="title"]').fill(title);
  await page.getByRole("button", { name: "登録する" }).click();

  const block = page.getByRole("button", { name: title });
  await expect(block).toBeVisible();

  const start = await block.boundingBox();
  const col = page.locator(`.cal-col[data-date="${todayISO()}"]`);
  const drop = await col.boundingBox();
  const view = await page.locator(".cal-wk-scroll").boundingBox();

  if (!start || !drop || !view) throw new Error("予定または落下先の位置が取得できません");

  // 落とす先は、スクロールして見えている範囲の中ほど(列全体の座標は画面の外に出ることがある)
  await block.scrollIntoViewIfNeeded();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(drop.x + 40, view.y + view.height / 2, { steps: 24 });
  await page.mouse.up();

  // 9:00 の予定が別の時刻へ移り、同じ日の列に残っている
  await expect(block).not.toContainText("09:00");
  await expect(page.locator(`.cal-col[data-date="${todayISO()}"]`)).toContainText(title);
});
