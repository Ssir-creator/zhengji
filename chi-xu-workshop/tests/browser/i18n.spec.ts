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
test.use({ actionTimeout: 10000 });
async function untranslated(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("body *"))
      .filter(
        (e) =>
          e.getClientRects().length &&
          !e.closest("[data-language-choice],.brand-mark"),
      )
      .flatMap((e) =>
        Array.from(e.childNodes)
          .filter(
            (n) =>
              n.nodeType === 3 && /[\u3400-\u9fff]/.test(n.textContent ?? ""),
          )
          .map((n) => n.textContent?.trim()),
      )
      .filter(Boolean),
  );
}
test("English home, six lesson screens, tools and live feedback; Chinese restores without touching progress", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.evaluate(() => {
    (window as any).__titleCanvas = document.querySelector(
      "#title-studio canvas",
    );
  });
  await page.locator("[data-language-choice=en]").click();
  expect(
    await page.evaluate(
      () =>
        document.querySelector("#title-studio canvas") ===
        (window as any).__titleCanvas,
    ),
  ).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("[data-action=course]")).toHaveText(
    "Start foundation course",
  );
  await expect.poll(() => untranslated(page)).toEqual([]);
  await page.screenshot({ path: "docs/screenshots/language-home-english.png" });
  for (let stage = 0; stage < 6; stage++) {
    console.log(`Checking English lesson ${stage + 1}`);
    await page.evaluate(
      ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
      { key: COURSE_KEY, state: fixture(stage) },
    );
    await page.reload();
    await page.locator("[data-action=course]").click();
    await expect(b(page, "check")).toBeVisible({ timeout: 20000 });
    await expect.poll(() => untranslated(page)).toEqual([]);
    await page.locator("#course-tools > summary").click();
    await expect.poll(() => untranslated(page)).toEqual([]);
    await b(page, "help").click();
    await expect.poll(() => untranslated(page)).toEqual([]);
    await b(page, "close-help").click();
    if (stage >= 2 && stage !== 4) {
      const id = (
        { 2: "10", 3: "12", 4: "14", 5: "19" } as Record<number, string>
      )[stage];
      await b(page, `pick-${id}`).click();
    }
    if (stage === 3) {
      await b(page, "adjust").click();
      await b(page, "rotate").click();
      await b(page, "adjust").click();
    }
    const rawBefore = await page.evaluate(
      (key) => localStorage.getItem(key),
      COURSE_KEY,
    );
    await b(page, "assist").click();
    await expect.poll(() => untranslated(page)).toEqual([]);
    if (stage === 3)
      await page.screenshot({
        path: "docs/screenshots/language-fourth-english.png",
      });
    await b(page, "check").click();
    await expect.poll(() => untranslated(page)).toEqual([]);
    const rawAfter = await page.evaluate(
      (key) => localStorage.getItem(key),
      COURSE_KEY,
    );
    expect(rawAfter).not.toBe(rawBefore);
    await page.locator("#course-tools > summary").click();
    await page.locator("#course-tools [data-course=exit]").click();
    await expect(page.locator("[data-language-choice=zh]")).toBeVisible();
    await page.locator("[data-language-choice=zh]").click();
    expect(
      await page.evaluate((key) => localStorage.getItem(key), COURSE_KEY),
    ).toBe(rawAfter);
    await expect(page.locator("[data-action=course]")).toHaveText(
      "继续基础挑战",
    );
    await page.locator("[data-language-choice=en]").click();
  }
});
test("other play modes and native tool labels also follow the selected language", async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.goto("/");
  await page.locator("[data-language-choice=en]").click();
  for (const mode of ["interaction", "prediction", "practice", "levels"]) {
    await page.goto("/");
    await page.locator(`[data-action=${mode}]`).first().click();
    await page.waitForTimeout(1800);
    await expect.poll(() => untranslated(page)).toEqual([]);
  }
});
test("mobile language picker works, remembers the choice, and does not overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("[data-language-choice=en]").click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("[data-language-choice=en]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "docs/screenshots/language-home-mobile.png" });
  await page.locator("[data-action=course]").click();
  await expect(b(page, "check")).toBeVisible({ timeout: 20000 });
  await expect.poll(() => untranslated(page)).toEqual([]);
  await b(page, "adjust").click();
  await page.locator("#course-adjust summary").click();
  await expect.poll(() => untranslated(page)).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "docs/screenshots/language-course-mobile.png",
  });
});
