import { expect, test, type Page } from "@playwright/test";
import { register, uniqueTitle } from "./helpers";

const column = (page: Page, name: string) => page.locator(`[data-col][aria-label="${name}"]`);

async function addCard(page: Page, columnName: string, title: string) {
  const col = column(page, columnName);
  const input = col.locator('input[name="title"]');
  // 追加欄は、1枚追加したあとも続けて入力できるよう開いたままになる
  if (!(await input.isVisible())) await col.getByRole("button", { name: "＋ カードを追加" }).click();
  await input.fill(title);
  await input.press("Enter");
  await expect(col.locator(".kb-card").filter({ hasText: title })).toBeVisible();
}

test("ToDo を追加して、詳細でメモを書ける", async ({ page }) => {
  await register(page);
  await page.goto("/dashboard/todos");
  await expect(page.getByRole("heading", { name: "ToDo" })).toBeVisible();

  // 初期の3列
  await expect(page.locator(".kb-col-title")).toHaveText(["未着手", "進行中", "完了 ✓"]);

  const title = uniqueTitle("タスク");
  await addCard(page, "未着手", title);

  // 詳細を開いてメモを保存すると、カードに「メモ」が付く
  await page.locator(".kb-card").filter({ hasText: title }).click();
  await page.locator('dialog textarea[name="note"]').fill("詳しい内容");
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator(".kb-card").filter({ hasText: title })).toContainText("メモ");
});

test("カードをドラッグして列を移動し、完了にできる", async ({ page }) => {
  await register(page);
  await page.goto("/dashboard/todos");

  const title = uniqueTitle("移動");
  await addCard(page, "未着手", title);

  const card = page.locator(".kb-card").filter({ hasText: title });
  const from = await card.boundingBox();
  const to = await column(page, "完了").boundingBox();
  if (!from || !to) throw new Error("カードまたは列の位置が取得できません");

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 16 });
  await page.mouse.up();

  // 完了列に入り、取り消し線になる
  await expect(column(page, "完了").locator(".kb-card").filter({ hasText: title })).toHaveClass(/kb-card-done/);
  await expect(column(page, "未着手")).not.toContainText(title);

  // 再読み込みしても、置いた場所が保存されている
  await page.reload();
  await expect(column(page, "完了")).toContainText(title);
});

test("同じ列の中でカードを並べ替えられる", async ({ page }) => {
  await register(page);
  await page.goto("/dashboard/todos");

  const first = uniqueTitle("先");
  const second = uniqueTitle("後");
  await addCard(page, "未着手", first);
  await addCard(page, "未着手", second);

  const target = await page.locator(".kb-card").filter({ hasText: first }).boundingBox();
  const moving = await page.locator(".kb-card").filter({ hasText: second }).boundingBox();
  if (!target || !moving) throw new Error("カードの位置が取得できません");

  // 後のカードを、先のカードの上半分へ落とす
  await page.mouse.move(moving.x + moving.width / 2, moving.y + moving.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + 4, { steps: 14 });
  await page.mouse.up();

  await expect(column(page, "未着手").locator(".kb-card-title")).toHaveText([second, first]);
});

test("ToDo を削除できる", async ({ page }) => {
  await register(page);
  await page.goto("/dashboard/todos");

  const title = uniqueTitle("消す");
  await addCard(page, "未着手", title);

  await page.locator(".kb-card").filter({ hasText: title }).click();
  await page.getByRole("button", { name: "削除する" }).click();
  await page.getByRole("button", { name: "本当に削除する" }).click(); // 誤操作を防ぐため2段階
  await expect(page.locator(".kb-board")).not.toContainText(title);
});

test("列を追加・名前変更・削除できる", async ({ page }) => {
  await register(page);
  await page.goto("/dashboard/todos");

  const name = uniqueTitle("列");
  await page.locator(".kb-col-new").getByRole("button", { name: "＋ 列を追加" }).click();
  await page.locator('input[name="name"]').fill(name);
  await page.locator('input[name="name"]').press("Enter");
  await expect(column(page, name)).toBeVisible();

  // 名前を変える
  const renamed = `${name}改`;
  await column(page, name).getByRole("button", { name: `${name}の操作` }).click();
  await page.getByRole("menuitem", { name: "名前を変更" }).click();
  await column(page, name).locator(".kb-rename").fill(renamed);
  await column(page, name).locator(".kb-rename").press("Enter");
  await expect(column(page, renamed)).toBeVisible();

  // 削除(2段階)。列は全員で共有なので、作った列は必ず片付ける
  await column(page, renamed).getByRole("button", { name: `${renamed}の操作` }).click();
  await page.getByRole("menuitem", { name: "列を削除" }).click();
  await page.getByRole("menuitem", { name: "本当に削除する" }).click();
  await expect(column(page, renamed)).toHaveCount(0);
});
