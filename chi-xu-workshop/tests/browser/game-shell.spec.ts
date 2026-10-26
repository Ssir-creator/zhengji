import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { referenceCase } from "../../src/prediction";
import { CHALLENGE_KEY, freshChallenge } from "../../src/challenge";
const m = JSON.parse(
    readFileSync("public/cases/initial/manifest.json", "utf8"),
  ),
  ref = JSON.parse(
    readFileSync("public/cases/initial/prediction/reference.json", "utf8"),
  );
const data = referenceCase(
  ref,
  m,
  Object.fromEntries(
    Object.entries(m.prepared_assets).map(([id, v]) => [
      id,
      (v as { pivot: [number, number, number] }).pivot,
    ]),
  ),
);
const a = (page: import("@playwright/test").Page, s: string) =>
  page.locator(`[data-int-action="${s}"]`);
async function enter(page: import("@playwright/test").Page, badBook = false) {
  await page.goto("/");
  const s = freshChallenge(data);
  s.observed.push(0);
  s.judgements["2"] = "both";
  await page.evaluate(
    ({ key, s, badBook }) => {
      localStorage.setItem(key, JSON.stringify(s));
      if (badBook) localStorage.setItem(key + ":attempts", '{"schema":0}');
    },
    { key: CHALLENGE_KEY, s, badBook },
  );
  await page.reload();
  await page.locator('[data-action="interaction"]').click();
  await expect(page.locator("#int-heading")).toBeVisible({ timeout: 60000 });
}
test("工坊游戏工作台：完整画布、实时匹配、方案试验/恢复/撤销和刷新", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  await expect(page.locator("#int-task-panel")).toBeHidden();
  const canvas = await page.locator("#int-viewport>canvas").boundingBox();
  expect(canvas!.height).toBeGreaterThan(700);
  expect(canvas!.width).toBeGreaterThan(1300);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/game-shell-desktop.png",
    fullPage: true,
  });
  const i = data.target["2"].translation
      .map(Math.abs)
      .indexOf(Math.max(...data.target["2"].translation.map(Math.abs))),
    axis = ["X", "Y", "Z"][i],
    forward = data.target["2"].translation[i] > 0 ? "plus" : "minus",
    back = forward === "plus" ? "minus" : "plus";
  await page.selectOption("#int-axis", axis);
  await a(page, forward).click();
  expect(Number(await page.locator("#int-score").innerText())).toBeGreaterThan(
    0,
  );
  await a(page, "panel-plans").click();
  await a(page, "save-attempt").click();
  let book = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k + ":attempts")!),
    CHALLENGE_KEY,
  );
  const plan = book.entries[0];
  await a(page, back).click();
  await a(page, back).click();
  const before = await page.evaluate(
    (k) => localStorage.getItem(k),
    CHALLENGE_KEY,
  );
  await a(page, "view-attempt-" + plan.id).click();
  await expect(page.locator("#int-mode-banner")).toContainText("只读查看");
  await expect(a(page, "plus")).toBeDisabled();
  expect(
    await page.evaluate((k) => localStorage.getItem(k), CHALLENGE_KEY),
  ).toBe(before);
  await a(page, "restore-attempt-" + plan.id).click();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).poses["2"],
      CHALLENGE_KEY,
    ),
  ).toEqual(plan.poses["2"]);
  await a(page, "undo").click();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).poses["2"],
      CHALLENGE_KEY,
    ),
  ).toEqual(JSON.parse(before!).poses["2"]);
  await a(page, "redo").click();
  await page.screenshot({
    path: "docs/screenshots/game-shell-plans.png",
    fullPage: true,
  });
  await page
    .locator('#int-plans-panel [data-int-action="close-panel"]')
    .click();
  await page.setViewportSize({ width: 390, height: 900 });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/game-shell-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.locator('[data-action="interaction"]').click();
  await expect(page.locator("#int-score")).toBeVisible({ timeout: 60000 });
  await a(page, "panel-plans").click();
  await expect(page.locator("#int-plans")).toContainText("尝试 1");
  await page.locator("#int-score").click();
  await page.keyboard.press("r");
  await expect(a(page, "rotate")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("g");
  await expect(a(page, "translate")).toHaveAttribute("aria-pressed", "true");
  const stored = await page.evaluate(
    (k) => localStorage.getItem(k + ":attempts"),
    CHALLENGE_KEY,
  );
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k.endsWith(":attempts"))
        throw new DOMException("quota", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await a(page, "save-attempt").click();
  await expect(page.locator("#int-book-warning")).toContainText("方案保存失败");
  expect(
    await page.evaluate(
      (k) => localStorage.getItem(k + ":attempts"),
      CHALLENGE_KEY,
    ),
  ).toBe(stored);
  expect(errors).toEqual([]);
});
test("坏方案记录保留，不影响病例操作；手机面板和工具不引起页面滚动", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await enter(page, true);
  await expect(a(page, "plus")).toBeEnabled();
  await a(page, "panel-plans").click();
  await expect(page.locator("#int-book-warning")).toContainText("原文保留");
  await expect(a(page, "save-attempt")).toBeDisabled();
  expect(
    await page.evaluate(
      (k) => localStorage.getItem(k + ":attempts"),
      CHALLENGE_KEY,
    ),
  ).toBe('{"schema":0}');
  await page
    .locator('#int-plans-panel [data-int-action="close-panel"]')
    .click();
  const check = await a(page, "check").boundingBox();
  expect(check!.y).toBeGreaterThan(0);
  expect(check!.y + check!.height).toBeLessThanOrEqual(900);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/game-shell-mobile-storage-warning.png",
    fullPage: true,
  });
  await a(page, "panel-task").click();
  await expect(page.locator("#int-task-panel")).toBeVisible();
  await page.locator('#int-task-panel [data-int-action="close-panel"]').click();
  await expect(page.locator("#int-task-panel")).toBeHidden();
});
