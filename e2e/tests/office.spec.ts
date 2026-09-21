import { expect, test } from "@playwright/test";
import { register, uniqueName, uniqueTitle } from "./helpers";

test("在席状況を更新すると反映される", async ({ page }) => {
  const user = await register(page, { name: uniqueName("在席") });

  await page.goto("/dashboard/office");
  await expect(page.getByRole("heading", { name: "伝言・在席" })).toBeVisible();

  await page.locator('select[aria-label="自分の在席状況"]').selectOption("out");
  await page.locator('input[name="presence_note"]').fill("15時に戻ります");
  await page.getByRole("button", { name: "更新する" }).click();

  // メンバー一覧の自分の行に「ひとこと」が反映される(ユニーク名で特定する)
  const myRow = page.locator(".list li").filter({ hasText: user.name });
  await expect(myRow).toContainText("15時に戻ります");
});

test("2ユーザー間で伝言を送受信できる", async ({ browser }) => {
  // ユーザーA と ユーザーB を別々のブラウザコンテキストで作成
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  const userA = await register(a, { name: uniqueName("送信") });
  const userB = await register(b, { name: uniqueName("受信") });
  const caller = uniqueTitle("相手");
  const body = uniqueTitle("用件");

  // A が B へ伝言を残す(B の行にある「伝言」ボタンを押す)
  await a.goto("/dashboard/office");
  await a
    .locator(".list li")
    .filter({ hasText: userB.name })
    .getByRole("button", { name: "伝言" })
    .click();
  await a.locator('input[name="caller"]').fill(caller);
  await a.locator('textarea[name="body"]').fill(body);
  await a.getByRole("button", { name: "伝言を残す" }).click();
  // 送信後はフォームが閉じる
  await expect(a.locator('textarea[name="body"]')).toHaveCount(0);

  // B 側に自分あての伝言が届く
  await b.goto("/dashboard/office");
  const message = b.locator(".list li").filter({ hasText: caller });
  await expect(message).toContainText(body);
  await expect(message).toContainText(userA.name); // 差出人

  // B が対応済みにする
  await message.getByRole("button", { name: "対応済みにする" }).click();
  await expect(b.locator(".list li").filter({ hasText: caller })).toHaveCount(0);

  await ctxA.close();
  await ctxB.close();
});
