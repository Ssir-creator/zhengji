import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { referenceCase } from "../../src/prediction";
import { COURSE_KEY, freshCourse, moveCourse } from "../../src/course";
import { CHALLENGE_KEY, freshChallenge } from "../../src/challenge";
const m = JSON.parse(
  readFileSync("public/cases/initial/manifest.json", "utf8"),
);
const r = JSON.parse(
  readFileSync("public/cases/initial/prediction/reference.json", "utf8"),
);
const data = referenceCase(
  r,
  m,
  Object.fromEntries(
    Object.entries(m.prepared_assets).map(([id, v]) => [id, (v as any).pivot]),
  ),
);
const a = (p: Page, s: string) => p.locator(`[data-action="${s}"]`);
async function seed(p: Page) {
  await p.goto("/");
  const c = freshCourse(data),
    pose = structuredClone(c.poses["6"]);
  pose.translation = [0.1, 0, 0];
  const saved = moveCourse(data, c, "6", pose, "translate");
  const nine = freshChallenge(data);
  nine.observed = [0];
  nine.judgements["2"] = "both";
  await p.evaluate(
    ({ course, nine, ck, nk }) => {
      localStorage.setItem(ck, JSON.stringify(course));
      localStorage.setItem(nk, JSON.stringify(nine));
      localStorage.setItem(nk + ":attempts", "previous plans");
      localStorage.setItem("keep-other", "untouched");
    },
    { course: saved, nine, ck: COURSE_KEY, nk: CHALLENGE_KEY },
  );
  await p.reload();
  return { course: JSON.stringify(saved), nine: JSON.stringify(nine) };
}
const raw = (p: Page, key: string) =>
  p.evaluate((k) => localStorage.getItem(k), key);
test("saved challenges offer continue and confirmed restart; hidden original entries stay absent", async ({
  page,
}) => {
  test.setTimeout(120000);
  const previous = await seed(page);
  await expect(page.locator("#title-studio")).toHaveAttribute("data-ready","true",{timeout:60000});
  await page.screenshot({path:"docs/screenshots/home-restart-desktop.png"});
  await expect(page.locator("body")).not.toContainText("旧版");
  for (const old of ["new", "continue", "levels"])
    await expect(a(page, old)).toHaveCount(0);
  await expect(a(page, "course")).toHaveText("继续基础挑战");
  await expect(a(page, "restart-course")).toBeVisible();
  await expect(a(page, "restart-interaction")).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await a(page, "restart-course").click();
  expect(await raw(page, COURSE_KEY)).toBe(previous.course);
  await a(page, "course").click();
  await expect(page.locator("[data-course=check]")).toBeVisible({
    timeout: 60000,
  });
  expect(await raw(page, COURSE_KEY)).toBe(previous.course);
  await page.locator("#course-tools > summary").click();
  await page.locator("#course-tools [data-course=exit]").click();
  page.once("dialog", (d) => d.accept());
  await a(page, "restart-course").click();
  await expect(page.locator("[data-course=check]")).toBeVisible({
    timeout: 60000,
  });
  const restarted = JSON.parse((await raw(page, COURSE_KEY))!);
  expect(restarted.stage).toBe(0);
  expect(restarted.events).toEqual([]);
  expect(await raw(page, CHALLENGE_KEY)).toBe(previous.nine);
  await page.locator("#course-tools > summary").click();
  await page.locator("#course-tools [data-course=exit]").click();
  await page.locator("[data-language-choice=en]").click();
  await expect(a(page, "restart-course")).toHaveText(
    "Restart foundation course",
  );
  page.once("dialog", (d) => {
    expect(d.message()).toContain("Restart from the first");
    void d.accept();
  });
  await a(page, "restart-interaction").click();
  await expect(page.locator(".compact-dock")).toBeVisible({ timeout: 60000 });
  const nine = JSON.parse((await raw(page, CHALLENGE_KEY))!);
  expect(nine.card).toBe(0);
  expect(nine.observed).toEqual([]);
  expect(nine.judgements).toEqual({});
  expect(await raw(page, CHALLENGE_KEY + ":attempts")).toBeNull();
  expect(await raw(page, COURSE_KEY)).toBe(JSON.stringify(restarted));
  expect(await raw(page, "keep-other")).toBe("untouched");
});
test("mobile saved menu keeps restart and language choices reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await expect(page.locator("#title-studio")).toHaveAttribute("data-ready","true",{timeout:60000});
  await page.locator("[data-language-choice=en]").click();
  await expect(page.locator('[data-language-choice=en]')).toHaveAttribute('aria-pressed','true');
  await expect(a(page, "restart-course")).toBeVisible();
  await expect(a(page, "restart-interaction")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "docs/screenshots/home-restart-mobile.png",
    fullPage: true, animations:'disabled',
  });
});
