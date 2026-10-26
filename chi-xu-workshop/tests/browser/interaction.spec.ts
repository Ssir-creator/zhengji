import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { referenceCase } from "../../src/prediction";
import {
  CHALLENGE_KEY,
  freshChallenge,
  taskCards,
  observation,
  expectedJudgement,
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
const action = (page: import("@playwright/test").Page, a: string) =>
  page.locator(`[data-int-action="${a}"]`);
async function enter(page: import("@playwright/test").Page) {
  await page.goto("/");
  await actionHome(page);
  await expect(page.locator("#int-heading")).toBeVisible({ timeout: 60000 });
}
async function actionHome(page: import("@playwright/test").Page) {
  await page.locator('[data-action="interaction"]').click();
}
test("观察、独立操作、长按、只读参考/回放/滑帘、取消与独立重试", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await enter(page);
  const a = (s: string) => action(page, s);
  await expect(a("plus")).toBeDisabled();
  await a("view-occlusal").click();
  await a("view-side").click();
  await page.selectOption("#int-answer", observation(data, 0));
  await a("answer").click();
  await expect(page.locator("#int-feedback")).toContainText("观察通过");
  await page.selectOption("#int-judgement", "both");
  await a("judge").click();
  await expect(a("plus")).toBeEnabled();
  const oldKeys = [
    "chi-xu-workshop:prediction:v1",
    "chi-xu-workshop:challenge:v1",
  ];
  await page.evaluate(
    (keys) => keys.forEach((k) => localStorage.setItem(k, "untouched")),
    oldKeys,
  );
  await a("plus").click();
  let s = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!),
    CHALLENGE_KEY,
  );
  expect(s.stats.moves).toBe(1);
  await a("plus").hover();
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  s = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!),
    CHALLENGE_KEY,
  );
  expect(s.stats.moves).toBeGreaterThan(2);
  await a("undo").click();
  await a("redo").click();
  const saved = await page.evaluate(
    (k) => localStorage.getItem(k),
    CHALLENGE_KEY,
  );
  await a("hold").hover();
  await page.mouse.down();
  await expect(page.locator("#int-mode-banner")).toContainText("按住查看参考");
  await page.mouse.up();
  await expect(page.locator("#int-mode-banner")).not.toContainText(
    "按住查看参考",
  );
  await a("compare").click();
  await expect(page.locator("#int-curtain")).toBeVisible();
  await page.locator('[aria-label="前后对比滑帘"]').fill("25");
  await page.waitForTimeout(100);
  await expect(page.locator("#int-compare-canvas")).toHaveCSS(
    "clip-path",
    "inset(0px 75% 0px 0px)",
  );
  await page.locator("#int-divider").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#int-divider")).toHaveAttribute(
    "aria-valuenow",
    "30",
  );
  await page.locator("#int-divider").hover();
  const line = await page.locator("#int-divider").boundingBox();
  await page.mouse.down();
  await page.mouse.move(line!.x + 92, line!.y + line!.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(
    Number(await page.locator("#int-divider").getAttribute("aria-valuenow")),
  ).toBeGreaterThan(30);
  await page.screenshot({
    path: "docs/screenshots/interaction-comparison.png",
    fullPage: true,
  });
  await a("compare").click();
  await a("replay").click();
  await expect(a("plus")).toBeDisabled();
  await page.locator("#int-timeline").fill("0");
  await expect(page.locator("#int-replay-label")).toHaveText("回放起点");
  await a("current").first().click();
  expect(
    await page.evaluate((k) => localStorage.getItem(k), CHALLENGE_KEY),
  ).toBe(saved);
  await a("rotate").click();
  await a("focus").click();
  await page.screenshot({
    path: "docs/screenshots/interaction-rotation.png",
    fullPage: true,
  });
  await a("pair").click();
  await a("select-3").click();
  await expect(page.locator("#int-feedback")).toContainText("双牙对照");
  await a("view-front").click();
  await expect(page.locator('[data-int-action="select-2"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await a("retry").click();
  expect(
    await page.evaluate((k) => localStorage.getItem(k), CHALLENGE_KEY),
  ).toBe(saved);
  expect(
    await page.evaluate(
      (k) => localStorage.getItem(k + ":retry"),
      CHALLENGE_KEY,
    ),
  ).not.toBeNull();
  for (const k of oldKeys)
    expect(await page.evaluate((k) => localStorage.getItem(k), k)).toBe(
      "untouched",
    );
  expect(errors).toEqual([]);
});
test("九个短任务连续核对28颗，判断与自评保存，刷新恢复", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/");
  const cards = taskCards(data);
  let s = freshChallenge(data);
  // Start each task near the exact supplied target, then use the real check/save UI.
  for (let i = 0; i < cards.length; i++) {
    if (i) {
      s = await page.evaluate(
        (k) => JSON.parse(localStorage.getItem(k)!),
        CHALLENGE_KEY,
      );
    }
    s.observed.push(i);
    for (const id of cards[i]) {
      s.judgements[id] = expectedJudgement(data, id);
      s.poses[id] = structuredClone(data.target[id]);
      s.poses[id].translation[0] += 0.02;
      s.replay.push({
        id,
        pose: structuredClone(s.poses[id]),
        label: "测试预置：目标附近",
        time: new Date().toISOString(),
      });
    }
    await page.evaluate(
      ({ key, s }) => localStorage.setItem(key, JSON.stringify(s)),
      { key: CHALLENGE_KEY, s },
    );
    await page.reload();
    await actionHome(page);
    await expect(page.locator("#int-heading")).toContainText(
      `短任务 ${i + 1}`,
      { timeout: 60000 },
    );
    for (const id of cards[i]) {
      await action(page, "select-" + id).click();
      await action(page, "check").click();
      await expect(page.locator("#int-feedback")).toContainText("核对通过");
    }
    await page.selectOption("#int-reflection", "observe");
    await action(page, "advance").click();
  }
  await expect(page.locator("#int-heading")).toHaveText("28 颗参考挑战完成");
  s = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!),
    CHALLENGE_KEY,
  );
  expect(s.poses).toEqual(data.target);
  expect(s.checked).toHaveLength(28);
  await page.screenshot({
    path: "docs/screenshots/interaction-completed.png",
    fullPage: true,
  });
});
test("手机短任务可用，存储失败不应用操作，坏记录保留原文", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const s = freshChallenge(data);
  s.observed.push(0);
  s.judgements["2"] = "both";
  await page.goto("/");
  await page.evaluate(
    ({ key, s }) => localStorage.setItem(key, JSON.stringify(s)),
    { key: CHALLENGE_KEY, s },
  );
  await page.reload();
  await actionHome(page);
  await expect(action(page, "plus")).toBeEnabled({ timeout: 60000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const canvas = await page.locator("#int-viewport>canvas").boundingBox();
  expect(canvas?.height).toBeGreaterThanOrEqual(300);
  await page.screenshot({
    path: "docs/screenshots/interaction-mobile.png",
    fullPage: true,
  });
  await action(page, "compare").click();
  await page.locator('[aria-label="前后对比滑帘"]').fill("100");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await action(page, "compare").click();
  const before = await page.evaluate(
    (k) => localStorage.getItem(k),
    CHALLENGE_KEY,
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await action(page, "plus").click();
  await expect(page.locator("#int-feedback")).toContainText("保存失败");
  expect(
    await page.evaluate((k) => localStorage.getItem(k), CHALLENGE_KEY),
  ).toBe(before);
  await page.reload();
  await page.evaluate(
    (k) => localStorage.setItem(k, '{"schema":0}'),
    CHALLENGE_KEY,
  );
  await page.reload();
  await actionHome(page);
  await expect(page.locator("#notice")).toContainText("原记录已保留", {
    timeout: 60000,
  });
  expect(
    await page.evaluate((k) => localStorage.getItem(k), CHALLENGE_KEY),
  ).toBe('{"schema":0}');
});
test("实际3D手柄拖动预览与Esc还原，旋转环松手提交", async ({ page }) => {
  test.setTimeout(120000);
  await page.goto("/");
  const s = freshChallenge(data);
  s.observed.push(0);
  s.judgements["2"] = "both";
  await page.evaluate(
    ({ key, s }) => localStorage.setItem(key, JSON.stringify(s)),
    { key: CHALLENGE_KEY, s },
  );
  // Test-only access to the existing scene lets us locate real rendered handles.
  await page.evaluate(async () => {
    const path = "/src/scene.ts";
    const { WorkshopScene } = await import(path);
    const select = WorkshopScene.prototype.select;
    WorkshopScene.prototype.select = function (...args: unknown[]) {
      (globalThis as any).__testScene = this;
      return select.apply(this, args);
    };
  });
  await actionHome(page);
  await expect(action(page, "plus")).toBeEnabled({ timeout: 60000 });
  await action(page, "focus").click();
  await page.waitForTimeout(400);
  async function handle(tool: string) {
    const candidates = await page.evaluate((tool) => {
      const s = (globalThis as any).__testScene,
        r = s.renderer.domElement.getBoundingClientRect();
      s.scene.updateMatrixWorld(true);
      return s.transform._gizmo.gizmo[tool].children
        .filter((m: any) => ["X", "Y", "Z"].includes(m.name))
        .flatMap((m: any) => {
          const a = m.geometry.getAttribute("position"),
            out = [];
          for (
            let i = 0;
            i < a.count;
            i += Math.max(1, Math.floor(a.count / 12))
          ) {
            const v = m.position
              .clone()
              .fromBufferAttribute(a, i)
              .applyMatrix4(m.matrixWorld)
              .project(s.camera);
            out.push({
              x: r.left + ((v.x + 1) / 2) * r.width,
              y: r.top + ((1 - v.y) / 2) * r.height,
            });
          }
          return out;
        });
    }, tool);
    for (const point of candidates) {
      await page.mouse.move(point.x, point.y);
      if (
        await page.evaluate(
          () => !!(globalThis as any).__testScene.transform.axis,
        )
      )
        return point;
    }
    throw Error("No actual rendered handle could be picked");
  }
  const before = await page.evaluate(
      (k) => localStorage.getItem(k),
      CHALLENGE_KEY,
    ),
    p = await handle("translate");
  await page.mouse.down();
  await page.mouse.move(p.x + 30, p.y + 20, { steps: 8 });
  await expect(page.locator("#int-mode-banner")).toContainText("拖动预览");
  expect(
    await page.evaluate((k) => localStorage.getItem(k), CHALLENGE_KEY),
  ).toBe(before);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(
    await page.evaluate((k) => localStorage.getItem(k), CHALLENGE_KEY),
  ).toBe(before);
  const p2 = await handle("translate");
  await page.mouse.down();
  await page.mouse.move(p2.x + 25, p2.y + 12, { steps: 8 });
  await page.mouse.up();
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).stats.moves,
      CHALLENGE_KEY,
    ),
  ).toBe(1);
  await action(page, "rotate").click();
  const r = await handle("rotate");
  await page.mouse.down();
  await page.mouse.move(r.x + 28, r.y + 25, { steps: 10 });
  await page.mouse.up();
  const moved = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!),
    CHALLENGE_KEY,
  );
  expect(moved.stats.moves).toBe(2);
  expect(moved.poses["2"].quaternion).not.toEqual([0, 0, 0, 1]);
  await page.screenshot({
    path: "docs/screenshots/interaction-dragged.png",
    fullPage: true,
  });
  await action(page, "translate").click();
  const touch = await handle("translate"),
    cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: touch.x, y: touch.y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touch.x + 22, y: touch.y + 15 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(
    await page.evaluate(
      (k) => JSON.parse(localStorage.getItem(k)!).stats.moves,
      CHALLENGE_KEY,
    ),
  ).toBe(3);
  await cdp.detach();
});
test("双方案观察可从只读方案直接提交，答错重试，不改牙齿实际位姿", async ({
  page,
}) => {
  await page.goto("/");
  const s = freshChallenge(data);
  s.card = 1;
  s.observed = [0];
  s.reflections["0"] = "observe";
  for (const id of taskCards(data)[0]) {
    s.checked.push(id);
    s.poses[id] = structuredClone(data.target[id]);
    s.replay.push({
      id,
      pose: structuredClone(s.poses[id]),
      label: "前一任务已核对",
      time: new Date().toISOString(),
    });
  }
  await page.evaluate(
    ({ key, s }) => localStorage.setItem(key, JSON.stringify(s)),
    { key: CHALLENGE_KEY, s },
  );
  await actionHome(page);
  await expect(page.locator("#int-heading")).toContainText("短任务 2", {
    timeout: 60000,
  });
  await action(page, "view-front").click();
  await action(page, "view-side").click();
  const before = await page.evaluate(
    (k) => localStorage.getItem(k),
    CHALLENGE_KEY,
  );
  await action(page, "A").click();
  await action(page, "B").click();
  expect(
    await page.evaluate((k) => localStorage.getItem(k), CHALLENGE_KEY),
  ).toBe(before);
  await page.selectOption("#int-answer", "B");
  await action(page, "answer").click();
  await expect(page.locator("#int-feedback")).toContainText("重合程度");
  await action(page, "A").click();
  await page.selectOption("#int-answer", "A");
  await page.screenshot({
    path: "docs/screenshots/interaction-observation.png",
    fullPage: true,
  });
  await action(page, "answer").click();
  await expect(page.locator("#int-feedback")).toContainText("观察通过");
  const after = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)!),
    CHALLENGE_KEY,
  );
  expect(after.poses).toEqual(s.poses);
  expect(after.stats.wrong).toBe(1);
  expect(after.observed).toEqual([0, 1]);
});
