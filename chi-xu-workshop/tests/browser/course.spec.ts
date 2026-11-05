import { Quaternion, Vector3 } from "three";
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { referenceCase } from "../../src/prediction";
import {
  COURSE_KEY,
  freshCourse,
  advanceCourse,
  moveCourse,
  lessons,
} from "../../src/course";
const m = JSON.parse(
    readFileSync("public/cases/initial/manifest.json", "utf8"),
  ),
  r = JSON.parse(
    readFileSync("public/cases/initial/prediction/reference.json", "utf8"),
  );
const data = referenceCase(
  r,
  m,
  Object.fromEntries(
    Object.entries(m.prepared_assets).map(([id, v]) => [id, (v as any).pivot]),
  ),
);
const b = (p: Page, a: string) => p.locator(`[data-course="${a}"]`);
function fixture(stage: number) {
  let s = freshCourse(data);
  for (let i = 0; i < stage; i++) {
    for (const id of lessons[s.stage].ids) {
      if (s.stage === 3) s.guess[`3:${id}`] = "both";
      for (const tool of ["translate", "rotate"] as const) {
        if (lessons[s.stage].tool && lessons[s.stage].tool !== tool) continue;
        const p = structuredClone(s.poses[id]);
        if (tool === "translate")
          p.translation = structuredClone(data.target[id].translation);
        else p.quaternion = structuredClone(data.target[id].quaternion);
        s = moveCourse(data, s, id, p, tool);
      }
    }
    s = advanceCourse(data, s);
  }
  return s;
}
async function enter(p: Page, stage = 0) {
  await p.goto("/");
  await p.evaluate(
    ({ s, key }) => {
      localStorage.setItem(key, JSON.stringify(s));
      localStorage.setItem("keep-old", "untouched");
    },
    { s: fixture(stage), key: COURSE_KEY },
  );
  await p.evaluate(async () => {
    const path = "/src/scene.ts";
    const { WorkshopScene } = await import(path);
    const load = WorkshopScene.prototype.load;
    WorkshopScene.prototype.load = function (...args: any[]) {
      const result = load.apply(this, args);
      if (this.host.id === "course-viewport")
        (window as any).__courseScene = this;
      return result;
    };
  });
  await p.locator('[data-action="course"]').click();
  await expect(p.locator(".course-dock")).toBeVisible({ timeout: 60000 });
}
const saved = (p: Page) =>
  p.evaluate((k) => localStorage.getItem(k), COURSE_KEY);
async function tools(p: Page, a: string) {
  await p.locator("#course-tools>summary").click();
  await p.locator(`#course-tools [data-course="${a}"]`).click();
}
test("连续入门：真实按钮完成平移，自动接旋转；只读参考与旧记录不变", async ({
  page,
}) => {
  test.setTimeout(120000);
  await enter(page);
  const before = await saved(page);
  await tools(page, "reference");
  await expect(page.locator("#course-mode")).toContainText("参考");
  expect(await saved(page)).toBe(before);
  await tools(page, "reference");
  await b(page, "adjust").click();
  await expect(b(page, "rotate")).toBeDisabled();
  await page.locator("#course-adjust details>summary").click();
  await page.check("#course-fine");
  for (let i = 0; i < 3; i++) {
    await page.selectOption("#course-axis", ["X", "Y", "Z"][i]);
    const amount = data.target["6"].translation[i];
    for (let n = 0; n < Math.round(Math.abs(amount) / 0.05); n++)
      await b(page, amount > 0 ? "plus" : "minus").click();
  }
  await b(page, "adjust").click();
  await page.screenshot({ path: "docs/screenshots/course-entry.png" });
  await b(page, "check").click();
  await expect(page.locator("#course-chapter")).toContainText("2 / 6");
  await expect(page.locator("#course-success")).toBeHidden();
  const state = JSON.parse((await saved(page))!);
  expect(state.stage).toBe(1);
  expect(state.events.length).toBeGreaterThan(0);
  await b(page, "adjust").click();
  await expect(b(page, "translate")).toBeDisabled();
  await expect(b(page, "rotate")).toBeEnabled();
  expect(await page.evaluate(() => localStorage.getItem("keep-old"))).toBe(
    "untouched",
  );
});
test("找错：不预标错牙，预判后接手原错例；拖动预览取消、提交和撤销", async ({
  page,
}) => {
  test.setTimeout(120000);
  await enter(page, 3);
  await expect(page.locator("#course-guess")).toBeHidden();
  await b(page, "pick-12").click();
  await expect(page.locator("#course-guess")).toBeVisible();
  await b(page, "guess-translate").click();
  const initial = await saved(page);
  await b(page, "adjust").click();
  await page.locator("#course-adjust details>summary").click();
  await b(page, "plus").click();
  await b(page, "plus").click();
  await expect(page.locator("#course-feedback")).toContainText(
    "原本合适的位置",
  );
  await b(page, "undo-step").click();
  await b(page, "undo-step").click();
  expect(await saved(page)).toBe(initial);
  await b(page, "adjust").click();
  await b(page, "guess-rotate").click();
  await page.screenshot({ path: "docs/screenshots/course-find.png" });
  await tools(page, "outline");
  const point = await page.evaluate(() => {
    const s = (window as any).__courseScene,
      mesh = s.teeth.get("12"),
      pos = mesh.geometry.attributes.position,
      r = s.host.getBoundingClientRect();
    for (
      let i = 0;
      i < pos.count;
      i += Math.max(1, Math.floor(pos.count / 600))
    ) {
      const v = mesh.position
        .clone()
        .set(pos.getX(i), pos.getY(i), pos.getZ(i))
        .applyMatrix4(mesh.matrixWorld)
        .project(s.camera);
      const x = r.left + ((v.x + 1) * r.width) / 2,
        y = r.top + ((1 - v.y) * r.height) / 2;
      if (
        y > 200 &&
        y < r.bottom - 210 &&
        s.pick(new PointerEvent("pointermove", { clientX: x, clientY: y })) ===
          "12"
      )
        return { x, y };
    }
    throw Error("no exposed tooth");
  });
  const raw = await saved(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 30, point.y, { steps: 5 });
  expect(await saved(page)).toBe(raw);
  await page.screenshot({ path: "docs/screenshots/course-drag.png" });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await saved(page)).toBe(raw);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 24, point.y, { steps: 5 });
  await page.mouse.up();
  expect(await saved(page)).not.toBe(raw);
  await tools(page, "replay");
  const after = await saved(page);
  await page.locator("#course-timeline").fill("0");
  expect(await saved(page)).toBe(after);
  await b(page, "live").click();
});
test("手机独立复核允许遗漏提交、定位求助、视角入口和无页面溢出", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page, 5);
  await b(page, "check").click();
  await expect(page.locator("#course-feedback")).toContainText("还有遗漏");
  await tools(page, "locate");
  await expect(page.locator("#course-feedback")).toContainText("先检查");
  await page.locator("#course-view>summary").click();
  await b(page, "view-occlusal").click();
  await expect(page.locator(".course-dock")).toBeInViewport();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/screenshots/course-mobile.png" });
});

test("核对完成反馈与下一关连续保存和续玩", async ({ page }) => {
  await page.goto("/");
  let s = fixture(1);
  const pose = structuredClone(s.poses["8"]);
  pose.quaternion = structuredClone(data.target["8"].quaternion);
  s = moveCourse(data, s, "8", pose, "rotate");
  await page.evaluate(
    ({ key, s }) => localStorage.setItem(key, JSON.stringify(s)),
    { key: COURSE_KEY, s },
  );
  await page.locator('[data-action="course"]').click();
  await expect(page.locator(".course-dock")).toBeVisible({ timeout: 60000 });
  await b(page, "check").click();
  await expect(page.locator("#course-success")).toBeVisible();
  await expect(page.locator("#course-success")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "docs/screenshots/course-success.png" });
  await b(page, "next").click();
  await expect(page.locator("#course-chapter")).toContainText("3 / 6");
  const next = JSON.parse((await saved(page))!);
  expect(next.poses["8"]).toEqual(s.poses["8"]);
  await tools(page, "exit");
  await page.locator('[data-action="course"]').click();
  await expect(page.locator("#course-chapter")).toContainText("3 / 6");
});

test("终章完成后回看与边界判断可跳过，完成状态不被回放改写", async ({
  page,
}) => {
  await page.goto("/");
  let s = fixture(5);
  for (const id of lessons[5].ids)
    for (const tool of ["translate", "rotate"] as const) {
      const p = structuredClone(s.poses[id]);
      if (tool === "translate")
        p.translation = structuredClone(data.target[id].translation);
      else p.quaternion = structuredClone(data.target[id].quaternion);
      s = moveCourse(data, s, id, p, tool);
    }
  await page.evaluate(
    ({ key, s }) => localStorage.setItem(key, JSON.stringify(s)),
    { key: COURSE_KEY, s },
  );
  await page.locator('[data-action="course"]').click();
  await expect(page.locator(".course-dock")).toBeVisible({ timeout: 60000 });
  await b(page, "check").click();
  await b(page, "next").click();
  await expect(page.locator("#course-reflection")).toBeVisible();
  const before = await saved(page);
  expect(JSON.parse(before!).completed).toBe(true);
  await b(page, "boundary-no").click();
  await expect(page.locator("#course-boundary")).toContainText("真实治疗");
  await page.locator("#course-timeline").fill("0");
  expect(await saved(page)).toBe(before);
  await page.locator('#course-reflection [data-course="exit"]').click();
  await expect(page.locator('[data-action="course"]')).toBeVisible();
});

test("入门任务牙与正确位置无需试点可见；看目标不写进度，点错牙保留指引", async ({
  page,
}) => {
  await enter(page);
  await expect(page.locator("#course-task-callout")).toBeVisible();
  await expect(page.locator("#course-target-callout")).toContainText(
    "蓝色轮廓",
  );
  const before = await saved(page);
  const inspect = () =>
    page.evaluate(() => {
      const s = (window as any).__courseScene;
      const guides = s.scene.children.find((o: any) =>
        o.children.some((c: any) => c.type === "LineSegments"),
      );
      return {
        selected: s.selected,
        blue: guides?.children.some(
          (c: any) => c.type === "LineSegments" && c.visible,
        ),
        camera: s.camera.position.toArray(),
      };
    });
  expect((await inspect()).blue).toBe(true);
  // Use a real pointer on a non-task mesh, instead of calling selection directly.
  const point = await page.evaluate(() => {
    const s = (window as any).__courseScene,
      m = s.teeth.get("10"),
      a = m.geometry.attributes.position,
      r = s.host.getBoundingClientRect();
    for (let i = 0; i < a.count; i += Math.max(1, Math.floor(a.count / 400))) {
      const v = m.position
          .clone()
          .set(a.getX(i), a.getY(i), a.getZ(i))
          .applyMatrix4(m.matrixWorld)
          .project(s.camera),
        x = ((v.x + 1) * r.width) / 2,
        y = ((1 - v.y) * r.height) / 2;
      if (
        y > 150 &&
        y < r.height - 230 &&
        s.pick(new PointerEvent("pointermove", { clientX: x, clientY: y })) ===
          "10"
      )
        return { x, y };
    }
    throw Error("no fixed tooth");
  });
  await page.mouse.click(point.x, point.y);
  expect((await inspect()).selected).toBe("6");
  expect(await saved(page)).toBe(before);
  await page.locator("#course-peek").click();
  await expect(page.locator("#course-mode")).toContainText("参考");
  expect(await saved(page)).toBe(before);
  await page.locator("#course-peek").click();
  await expect(page.locator("#course-task-callout")).toBeVisible();
  await b(page, "check").click();
  await expect(page.locator("#course-feedback")).toContainText("蓝色箭头");
  await page.screenshot({ path: "docs/screenshots/course-guidance.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#course-task-callout")).toBeInViewport();
  await expect(page.locator("#course-peek")).toBeInViewport();
  await page.screenshot({
    path: "docs/screenshots/course-guidance-mobile.png",
  });
});

test("第一关旧进度偏离后，拖动仍沿剩余目标方向，预览可取消且不会吸附", async ({
  page,
}) => {
  await enter(page);
  await b(page, "adjust").click();
  await page.locator("#course-adjust details>summary").click();
  await b(page, "plus").click();
  await b(page, "adjust").click();
  const before = JSON.parse((await saved(page))!);
  const point = await page.evaluate(() => {
    const s = (window as any).__courseScene,
      m = s.teeth.get("6"),
      a = m.geometry.attributes.position,
      r = s.host.getBoundingClientRect();
    for (let i = 0; i < a.count; i += Math.max(1, Math.floor(a.count / 600))) {
      const v = m.position
          .clone()
          .set(a.getX(i), a.getY(i), a.getZ(i))
          .applyMatrix4(m.matrixWorld)
          .project(s.camera),
        x = ((v.x + 1) * r.width) / 2,
        y = ((1 - v.y) * r.height) / 2;
      if (
        y > 200 &&
        y < r.height - 250 &&
        s.pick(new PointerEvent("pointermove", { clientX: x, clientY: y })) ===
          "6" &&
        document.elementFromPoint(x, y)?.tagName === "CANVAS"
      )
        return { x, y };
    }
    throw Error("no task tooth");
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 33, point.y + 11, { steps: 6 });
  expect(JSON.parse((await saved(page))!)).toEqual(before);
  await page.mouse.up();
  const after = JSON.parse((await saved(page))!),
    delta = after.poses["6"].translation.map(
      (v: number, i: number) => v - before.poses["6"].translation[i],
    ),
    remaining = data.target["6"].translation.map(
      (v, i) => v - before.poses["6"].translation[i],
    );
  expect(Math.hypot(...delta)).toBeGreaterThan(0.001);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      expect(delta[i] * remaining[j] - delta[j] * remaining[i]).toBeCloseTo(
        0,
        8,
      );
  expect(after.poses["6"].quaternion).toEqual(before.poses["6"].quaternion);
  expect(after.poses["6"].translation).not.toEqual(
    data.target["6"].translation,
  );
  for (const id of Object.keys(data.original).filter((id) => id !== "6"))
    expect(after.poses[id]).toEqual(before.poses[id]);
});

test("第二关视觉接近即可通过，明显方向偏差仍提示修正", async ({ page }) => {
  await page.goto("/");
  let s = fixture(1);
  const target = data.target["8"];
  const p = {
    ...structuredClone(target),
    quaternion: new Quaternion()
      .setFromAxisAngle(new Vector3(0, 0, 1), (4 * Math.PI) / 180)
      .multiply(new Quaternion(...target.quaternion))
      .toArray() as typeof target.quaternion,
  };
  s = moveCourse(data, s, "8", p, "rotate");
  await page.evaluate(
    ({ key, s }) => localStorage.setItem(key, JSON.stringify(s)),
    { key: COURSE_KEY, s },
  );
  await page.locator('[data-action="course"]').click();
  await expect(page.locator(".course-dock")).toBeVisible({ timeout: 60000 });
  await b(page, "check").click();
  await expect(page.locator("#course-success")).toBeVisible();
  await expect(page.locator("#course-success")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "docs/screenshots/course-rotation-tolerance.png",
  });
  await b(page, "next").click();
  await expect(page.locator("#course-chapter")).toContainText("3 / 6");
  await tools(page, "exit");
  s = fixture(1);
  const bad = {
    ...structuredClone(target),
    quaternion: new Quaternion()
      .setFromAxisAngle(new Vector3(0, 0, 1), (8 * Math.PI) / 180)
      .multiply(new Quaternion(...target.quaternion))
      .toArray() as typeof target.quaternion,
  };
  s = moveCourse(data, s, "8", bad, "rotate");
  await page.evaluate(
    ({ key, s }) => localStorage.setItem(key, JSON.stringify(s)),
    { key: COURSE_KEY, s },
  );
  await page.locator('[data-action="course"]').click();
  await expect(page.locator(".course-dock")).toBeVisible();
  await b(page, "check").click();
  await expect(page.locator("#course-feedback")).toContainText("方向还差一点");
  await expect(page.locator("#course-success")).toBeHidden();
});

test("第三关参考直接可见，选择同步目标，切换参考同镜头只读并收起操作栏", async ({
  page,
}) => {
  await enter(page, 2);
  await expect(page.locator("#course-peek")).toHaveText("查看参考");
  await b(page, "pick-10").click();
  await expect(page.locator("#course-target-callout")).toBeVisible();
  const snap = () =>
    page.evaluate(() => {
      const s = (window as any).__courseScene;
      return {
        camera: s.camera.position.toArray(),
        target: s.orbit.target.toArray(),
        poses: Object.fromEntries(
          [...s.teeth.keys()].map((id) => [id, s.readPose(id)]),
        ),
        edges: s.scene.children.flatMap((g: any) =>
          g.children
            .filter((o: any) => o.type === "LineSegments" && o.visible)
            .map((o: any) => ({
              position: o.position.toArray(),
              quaternion: o.quaternion.toArray(),
            })),
        ),
      };
    });
  const before = await snap(),
    raw = await saved(page);
  expect(before.edges.length).toBe(2);
  const pivot = data.target["10"].pivot,
    translation = data.target["10"].translation;
  before.edges
    .find((edge: any) =>
      edge.position.every(
        (v: number, i: number) =>
          Math.abs(v - (pivot[i] + translation[i])) < 1e-8,
      ),
    )!
    .position.forEach((v: number, i: number) =>
      expect(v).toBeCloseTo(pivot[i] + translation[i], 8),
    );
  await b(page, "adjust").click();
  await b(page, "check").click();
  await expect
    .poll(async () => {
      const feedback = await page.locator("#course-feedback").boundingBox(),
        panel = await page.locator("#course-adjust").boundingBox();
      return feedback!.y + feedback!.height <= panel!.y;
    })
    .toBe(true);
  await page.screenshot({
    path: "docs/screenshots/course-reference-feedback.png",
  });
  await page.locator("#course-peek").click();
  await expect(page.locator("#course-adjust")).toBeHidden();
  await expect(page.locator("#course-peek")).toHaveText("回到操作");
  const reference = await snap();
  reference.camera.forEach((v: number, i: number) =>
    expect(v).toBeCloseTo(before.camera[i], 8),
  );
  for (const id of ["9", "10"])
    expect(reference.poses[id].quaternion).toEqual(data.target[id].quaternion);
  expect(await saved(page)).toBe(raw);
  await page.locator("#course-peek").click();
  expect((await snap()).poses).toEqual(before.poses);
  expect(await saved(page)).toBe(raw);
  await page.screenshot({
    path: "docs/screenshots/course-reference-third.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#course-peek")).toBeInViewport();
  await b(page, "adjust").click();
  await b(page, "check").click();
  await expect
    .poll(async () => {
      const f = await page.locator("#course-feedback").boundingBox(),
        p = await page.locator("#course-adjust").boundingBox();
      return f!.y + f!.height <= p!.y;
    })
    .toBe(true);
  await page.screenshot({
    path: "docs/screenshots/course-reference-third-mobile.png",
  });
});

test("找错与终章不预标答案，但始终有直接参考入口且不改保存", async ({
  page,
}) => {
  for (const stage of [3, 5]) {
    await enter(page, stage);
    await expect(page.locator("#course-task-callout")).toBeHidden();
    await expect(page.locator("#course-peek")).toBeVisible();
    const raw = await saved(page);
    await page.locator("#course-peek").click();
    await expect(page.locator("#course-mode")).toContainText("参考");
    await page.locator("#course-peek").click();
    expect(await saved(page)).toBe(raw);
    await tools(page, "exit");
  }
});

test("第一关近似位置可过关，核对后不吸附并保留到第二关", async ({ page }) => {
  await page.goto("/");
  let s = fixture(0);
  const near = structuredClone(data.target["6"]);
  near.translation[0] += 0.18;
  s = moveCourse(data, s, "6", near, "translate");
  await page.evaluate(
    ({ s, key }) => localStorage.setItem(key, JSON.stringify(s)),
    { s, key: COURSE_KEY },
  );
  await page.locator('[data-action="course"]').click();
  await expect(page.locator(".course-dock")).toBeVisible({ timeout: 60000 });
  await b(page, "check").click();
  await expect(page.locator("#course-chapter")).toContainText("2 / 6");
  const result = JSON.parse((await saved(page))!);
  expect(result.poses["6"]).toEqual(near);
  expect(result.poses["6"]).not.toEqual(data.target["6"]);
});

test("第三关明确方向和分项达标，按提示微调可撤销并以近似结果过关", async ({
  page,
}) => {
  await enter(page, 2);
  await b(page, "pick-10").click();
  await expect(page.locator("#course-direction")).toBeVisible();
  await expect(page.locator("#course-motion-arrow")).not.toHaveAttribute(
    "d",
    "",
  );
  const original = JSON.parse((await saved(page))!);
  await b(page, "assist").click();
  let current = JSON.parse((await saved(page))!);
  expect(current.poses["10"].translation).not.toEqual(
    original.poses["10"].translation,
  );
  expect(current.poses["10"].quaternion).toEqual(
    original.poses["10"].quaternion,
  );
  expect(current.poses["9"]).toEqual(original.poses["9"]);
  await tools(page, "undo");
  expect(JSON.parse((await saved(page))!).poses).toEqual(original.poses);
  for (let i = 0; i < 6 && (await b(page, "assist").isEnabled()); i++)
    await b(page, "assist").click();
  await expect(page.locator("#course-direction small")).toContainText("位置 ✓");
  await b(page, "adjust").click();
  await b(page, "rotate").click();
  await expect(page.locator("#course-direction strong")).toContainText("弧形");
  await expect
    .poll(async () => {
      const a = await page.locator("#course-direction").boundingBox(),
        b = await page.locator("#course-target-callout").boundingBox();
      return (
        a!.x + a!.width <= b!.x ||
        b!.x + b!.width <= a!.x ||
        a!.y + a!.height <= b!.y ||
        b!.y + b!.height <= a!.y
      );
    })
    .toBe(true);
  await page.screenshot({ path: "docs/screenshots/course-clear-cue.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#course-direction")).toBeInViewport();
  await page.screenshot({
    path: "docs/screenshots/course-clear-cue-mobile.png",
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  for (let i = 0; i < 6 && (await b(page, "assist").isEnabled()); i++)
    await b(page, "assist").click();
  await b(page, "adjust").click();
  await b(page, "check").click();
  await expect(page.locator("#course-success")).toBeVisible();
  current = JSON.parse((await saved(page))!);
  expect(current.poses["10"]).not.toEqual(data.target["10"]);
  await expect(page.locator("#course-success")).toHaveCSS("opacity", "1");
  await page.screenshot({
    path: "docs/screenshots/course-approximate-pass.png",
  });
});

test("六关进入即有全部候选目标线，每关按参考微调可用，第四关记录实际工具预判且反馈无遮挡", async ({
  page,
}) => {
  test.setTimeout(180000);
  for (let stage = 0; stage < 6; stage++) {
    await enter(page, stage);
    const count = () =>
      page.evaluate(() => {
        const s = (window as any).__courseScene;
        return s.scene.children.flatMap((g: any) =>
          g.children.filter((o: any) => o.type === "LineSegments" && o.visible),
        ).length;
      });
    await expect.poll(count).toBe(lessons[stage].ids.length);
    const id = ["6", "8", "10", "12", "14", "20"][stage];
    if (stage >= 2 && stage !== 4) await b(page, `pick-${id}`).click();
    if ([1, 3, 5].includes(stage)) {
      await b(page, "adjust").click();
      await b(page, "rotate").click();
      await b(page, "adjust").click();
    }
    await expect(page.locator("#course-direction")).toBeVisible();
    await expect(b(page, "assist")).toBeEnabled();
    const before = JSON.parse((await saved(page))!);
    await b(page, "assist").click();
    const after = JSON.parse((await saved(page))!);
    expect(after.poses[id]).not.toEqual(before.poses[id]);
    for (const other of Object.keys(data.original).filter((x) => x !== id))
      expect(after.poses[other]).toEqual(before.poses[other]);
    if (stage === 3) {
      expect(before.guess["3:12"]).toBeUndefined();
      expect(after.guess["3:12"]).toBe("rotate");
      await expect
        .poll(async () => {
          const feedback = await page.locator("#course-feedback").boundingBox(),
            guess = await page.locator("#course-guess").boundingBox();
          return feedback!.y >= guess!.y + guess!.height;
        })
        .toBe(true);
      await page.screenshot({
        path: "docs/screenshots/course-fourth-reference.png",
      });
    }
    if (stage === 5) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator("#course-direction")).toBeInViewport();
      await page.screenshot({
        path: "docs/screenshots/course-sixth-reference-mobile.png",
      });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  }
});
