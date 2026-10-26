import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { referenceCase } from "../../src/prediction";
import {
  CHALLENGE_KEY,
  freshChallenge,
  observation,
  taskCards,
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
const a = (p: Page, s: string) => p.locator(`[data-int-action="${s}"]`);
async function enter(p: Page, ready = false) {
  await p.goto("/");
  const path = "/src/scene.ts";
  await p.evaluate(async (path) => {
    const { WorkshopScene } = await import(path);
    const load = WorkshopScene.prototype.load;
    WorkshopScene.prototype.load = function (...args: unknown[]) {
      const result = load.apply(this, args);
      if (this.host.id === "int-viewport")
        (window as any).__compactScene = this;
      return result;
    };
  }, path);
  const s = freshChallenge(data);
  if (ready) {
    s.observed = [0];
    s.judgements["2"] = "both";
  }
  await p.evaluate(
    ({ s, key }) => localStorage.setItem(key, JSON.stringify(s)),
    { s, key: CHALLENGE_KEY },
  );
  await p.locator('[data-action="interaction"]').click();
  await expect(p.locator(".compact-dock")).toBeVisible({ timeout: 60000 });
}
async function tools(p: Page, s: string) {
  await p.locator("#int-tools>summary").click();
  await a(p, s).click();
}
async function camera(p: Page, s: string) {
  await p.locator("#int-view-menu>summary").click();
  await a(p, s).click();
}
const raw = (p: Page) =>
  p.evaluate((k) => localStorage.getItem(k), CHALLENGE_KEY);
test("三段式主界面、视角下拉、观察作答与工具内功能保持可用", async ({
  page,
}) => {
  test.setTimeout(120000);
  await enter(page);
  await expect(page.locator(".compact-dock>button")).toHaveCount(2);
  await expect(page.locator(".compact-dock>details")).toHaveCount(1);
  await expect(page.locator(".int-floating-panel:visible")).toHaveCount(0);
  await expect(page.locator("#int-adjust-panel")).toBeHidden();
  await expect(page.locator(".int-panel-tabs,.game-stage-frame")).toHaveCount(
    0,
  );
  const box = await page.locator("#int-viewport>canvas").boundingBox();
  expect(box!.height).toBe(900);
  await page.screenshot({ path: "docs/screenshots/compact-desktop.png" });
  await camera(page, "view-occlusal");
  await camera(page, "view-side");
  await a(page, "panel-task").click();
  await page.selectOption("#int-answer", observation(data, 0));
  await a(page, "answer").click();
  await expect(page.locator("#int-feedback")).toContainText("观察通过");
  await page.selectOption("#int-judgement", "both");
  await a(page, "judge").click();
  await a(page, "close-panel").first().click();
  const before = await raw(page);
  await tools(page, "hint");
  expect(await raw(page)).toBe(before);
  await tools(page, "hint");
  expect(JSON.parse((await raw(page))!).stats.hints).toBe(1);
  await a(page, "check").click();
  await expect(page.locator("#int-feedback")).toContainText("尚未到参考");
  await tools(page, "panel-plans");
  await expect(page.locator("#int-plans-panel")).toBeVisible();
  await a(page, "save-attempt").click();
  await a(page, "close-panel").nth(1).click();
  await tools(page, "replay");
  await expect(page.locator("#int-replay-panel")).toBeVisible();
  await a(page, "current").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".int-floating-panel:visible")).toHaveCount(0);
});
async function toothPoint(p: Page) {
  return await p.evaluate(() => {
    const s = (window as any).__compactScene,
      mesh = s.teeth.get("2"),
      positions = mesh.geometry.attributes.position,
      r = s.renderer.domElement.getBoundingClientRect();
    for (
      let i = 0;
      i < positions.count;
      i += Math.max(1, Math.floor(positions.count / 500))
    ) {
      const v = mesh.position.clone();
      v.set(positions.getX(i), positions.getY(i), positions.getZ(i))
        .applyMatrix4(mesh.matrixWorld)
        .project(s.camera);
      const x = r.left + ((v.x + 1) * r.width) / 2,
        y = r.top + ((1 - v.y) * r.height) / 2;
      if (x < 30 || x > r.right - 30 || y < 160 || y > r.bottom - 180) continue;
      if (
        s.pick(new PointerEvent("pointermove", { clientX: x, clientY: y })) ===
        "2"
      )
        return { x, y };
    }
    throw Error("No exposed tooth point");
  });
}
test("直接拖牙平移和旋转；预览不保存，Esc和指针取消还原，松手提交", async ({
  page,
}) => {
  test.setTimeout(120000);
  await enter(page, true);
  const before = await raw(page);
  let point = await toothPoint(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 35, point.y + 12, { steps: 8 });
  await expect(page.locator("#int-mode-banner")).toContainText("拖动预览");
  expect(await raw(page)).toBe(before);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await raw(page)).toBe(before);
  point = await toothPoint(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 20, point.y + 10, { steps: 5 });
  await page.dispatchEvent("#int-viewport>canvas", "pointercancel", {
    pointerId: 1,
    pointerType: "mouse",
  });
  await page.mouse.up();
  expect(await raw(page)).toBe(before);
  point = await toothPoint(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 28, point.y + 8, { steps: 8 });
  await page.mouse.up();
  const moved = JSON.parse((await raw(page))!);
  expect(moved.stats.moves).toBe(1);
  expect(moved.poses["2"].translation).not.toEqual(
    data.original["2"].translation,
  );
  for (const id of Object.keys(data.original).filter((id) => id !== "2"))
    expect(moved.poses[id]).toEqual(data.original[id]);
  await page.keyboard.press("r");
  point = await toothPoint(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 36, point.y, { steps: 8 });
  await page.mouse.up();
  const turned = JSON.parse((await raw(page))!);
  expect(turned.stats.moves).toBe(2);
  expect(turned.poses["2"].translation).toEqual(moved.poses["2"].translation);
  expect(turned.poses["2"].quaternion).not.toEqual(moved.poses["2"].quaternion);
  await a(page, "adjust").click();
  await expect(page.locator("#int-adjust-panel")).toBeVisible();
  await page.locator("#int-adjust-panel details>summary").click();
  await expect(page.locator("#int-axis")).toBeVisible();
  await a(page, "undo").click();
  expect(JSON.parse((await raw(page))!).poses["2"]).toEqual(moved.poses["2"]);
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "docs/screenshots/compact-dragged.png" });
});
test("手机核心栏和工具菜单可触达，方案与回放只读不改变旧进度", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, true);
  const saved = await raw(page);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/screenshots/compact-mobile.png" });
  await tools(page, "panel-plans");
  await expect(page.locator("#int-plans-panel")).toBeVisible();
  await a(page, "save-attempt").click();
  await a(page, "close-panel").nth(1).click();
  await tools(page, "replay");
  await expect(page.locator("#int-replay-panel")).toBeVisible();
  await a(page, "current").click();
  expect(await raw(page)).toBe(saved);
  await page.keyboard.press("Escape");
  await camera(page, "view-front");
  await a(page, "adjust").click();
  await expect(page.locator("#int-adjust-panel")).toBeInViewport();
});

test("手机直接拖牙提交真实平移；触摸取消不写入进度", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, true);
  const saved = await raw(page),
    cdp = await page.context().newCDPSession(page);
  let point = await toothPoint(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: point.x + 18, y: point.y + 10 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  expect(await raw(page)).toBe(saved);
  point = await toothPoint(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: point.x + 18, y: point.y + 10 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(JSON.parse((await raw(page))!).stats.moves).toBe(1);
  await cdp.detach();
});
