import { compactAction, openFineControls } from "./compact-actions";
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { referenceCase } from "../../src/prediction";
import {
  CHALLENGE_KEY,
  freshChallenge,
  taskCards,
  observation,
  validateChallenge,
} from "../../src/challenge";
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
const a = (p: Page, s: string) => compactAction(p, s);
async function enter(p: Page, card: number, observed = false, near = false) {
  const s = freshChallenge(data);
  s.card = card;
  for (let i = 0; i < card; i++) {
    s.observed.push(i);
    for (const id of taskCards(data)[i]) {
      s.checked.push(id);
      s.poses[id] = structuredClone(data.target[id]);
    }
  }
  if (observed) {
    s.observed.push(card);
    s.judgements[taskCards(data)[card][0]] = "both";
  }
  if (near) {
    const id = taskCards(data)[card][0];
    s.poses[id] = structuredClone(data.target[id]);
    s.poses[id].translation[0] += 0.2;
  }
  s.replayBase = structuredClone(s.poses);
  validateChallenge(s, data);
  await p.goto("/");
  await p.evaluate(
    ({ s, key }) => localStorage.setItem(key, JSON.stringify(s)),
    { s, key: CHALLENGE_KEY },
  );
  await p.locator('[data-action="interaction"]').click();
  await expect(p.locator("#int-task-line")).toBeVisible({ timeout: 60000 });
  if (!observed) await compactAction(p, "panel-task").click();
}
const raw = (p: Page) =>
  p.evaluate((k) => localStorage.getItem(k), CHALLENGE_KEY);
test("试步轮廓不写进度，Esc取消，确认只应用一次，切换工具取消旧试步", async ({
  page,
}) => {
  test.setTimeout(120000);
  await enter(page, 0, true);
  const saved = await raw(page);
  await a(page, "preview-plus").click();
  await expect(page.locator("#int-feedback")).toContainText("仅试步，未保存");
  await expect(a(page, "apply-trial")).toBeVisible();
  expect(await raw(page)).toBe(saved);
  await expect(page.locator("#int-motion-cue")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/functional-step-preview.png",
  });
  await page.keyboard.press("Escape");
  await expect(a(page, "apply-trial")).toBeHidden();
  expect(await raw(page)).toBe(saved);
  await a(page, "preview-minus").click();
  await a(page, "apply-trial").click();
  const next = JSON.parse((await raw(page))!);
  expect(next.stats.moves).toBe(1);
  expect(next.replay.at(-1).label).toBe("应用试步");
  await expect(a(page, "apply-trial")).toBeHidden();
  await a(page, "preview-plus").click();
  await a(page, "rotate").click();
  await expect(a(page, "apply-trial")).toBeHidden();
  expect(JSON.parse((await raw(page))!).stats.moves).toBe(1);
});
test("错例必须先看，样例与视角不修改28颗实际进度，判断后再解锁", async ({
  page,
}) => {
  test.setTimeout(120000);
  await enter(page, 3);
  const saved = await raw(page);
  await a(page, "view-front").click();
  await a(page, "view-side").click();
  await page.selectOption("#int-answer", "rotate");
  await a(page, "answer").click();
  await expect(page.locator("#int-feedback")).toContainText("先查看只读错例");
  expect(await raw(page)).toBe(saved);
  await a(page, "sample").click();
  await expect(page.locator("#int-mode-banner")).toContainText("只读错例");
  expect(await raw(page)).toBe(saved);
  await expect(a(page, "plus")).toBeDisabled();
  await page.screenshot({ path: "docs/screenshots/functional-diagnosis.png" });
  await page.selectOption("#int-answer", "translate");
  await a(page, "answer").click();
  await expect(page.locator("#int-feedback")).toContainText("再观察一次");
  await page.selectOption("#int-answer", "rotate");
  await a(page, "answer").click();
  await expect(page.locator("#int-feedback")).toContainText("观察通过");
  const s = JSON.parse((await raw(page))!);
  expect(s.observed).toContain(3);
  expect(s.stats.wrong).toBe(1);
  expect(s.poses).toEqual(JSON.parse(saved!).poses);
});
test("顺序试验有六步，读完两个顺序才能答题，进度不被样例覆盖", async ({
  page,
}) => {
  test.setTimeout(120000);
  await enter(page, 7);
  const saved = await raw(page);
  await a(page, "view-front").click();
  await a(page, "view-side").click();
  await a(page, "sample").click();
  await page.selectOption("#int-answer", "same");
  await a(page, "answer").click();
  await expect(page.locator("#int-feedback")).toContainText("先完成六步");
  await a(page, "sample").click();
  for (let i = 0; i < 5; i++) await a(page, "sequence-next").click();
  await expect(page.locator("#int-mode-banner")).toContainText("6/6");
  expect(await raw(page)).toBe(saved);
  await page.selectOption("#int-answer", "same");
  await a(page, "answer").click();
  await expect(page.locator("#int-feedback")).toContainText("终点相同");
  expect(JSON.parse((await raw(page))!).poses).toEqual(
    JSON.parse(saved!).poses,
  );
});

test("开放试验允许中间位姿达成，预览不算达成，可另存尝试", async ({ page }) => {
  test.setTimeout(120000);
  await enter(page, 0, true, true);
  await a(page, "panel-plans").click();
  const saved = await raw(page);
  await page.selectOption("#int-lab-goal", "position");
  await a(page, "start-lab").click();
  expect(await raw(page)).toBe(saved);
  await expect(page.locator("#int-lab-status")).toContainText("尚未达成");
  await a(page, "preview-minus").click();
  await expect(page.locator("#int-lab-status")).toContainText("尚未达成");
  await a(page, "apply-trial").click();
  await expect(page.locator("#int-lab-status")).toContainText("试验目标达成");
  const s = JSON.parse((await raw(page))!);
  expect(s.checked).toHaveLength(0);
  expect(s.poses["2"]).not.toEqual(data.target["2"]);
  await a(page, "save-attempt").click();
  expect(await page.locator(".int-plan").count()).toBeGreaterThan(0);
  const book = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k + ":attempts")!),
    CHALLENGE_KEY,
  );
  expect(book.entries).toHaveLength(1);
  await page.screenshot({
    path: "docs/screenshots/functional-open-experiment.png",
  });
});
