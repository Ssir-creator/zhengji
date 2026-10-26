import type { Locator, Page } from "@playwright/test";
/** Existing behavior regressions enter the new menus through actual UI clicks. */
export function compactAction(page: Page, action: string): Locator {
  const locator = page.locator(`[data-int-action="${action}"]`);
  const advanced = new Set([
    "translate",
    "rotate",
    "minus",
    "plus",
    "cancel",
    "undo",
    "redo",
    "preview-minus",
    "preview-plus",
    "apply-trial",
  ]);
  const tool = new Set([
    "hint",
    "hold",
    "pair",
    "compare",
    "sound",
    "panel-plans",
    "replay",
    "export",
    "fullscreen",
    "exit",
  ]);
  const view = [
    "view-overview",
    "view-front",
    "view-side",
    "view-occlusal",
    "focus",
    "zoom",
  ].includes(action);
  async function prepare() {
    if (action === "answer") {
      const compare = page.locator('#int-sidebar [data-int-action="original"]');
      if (await compare.count()) {
        if (await compare.isHidden())
          await page.locator("#int-task-line").click();
        const answer = await page.locator("#int-answer").inputValue();
        await compare.click();
        await page.locator('[data-int-action="inspect-reference"]').click();
        await page.locator('[data-int-action="answer-open"]').click();
        await page.selectOption("#int-answer", answer);
      } else if (
        await page.locator('#int-sidebar [data-int-action="A"]').count()
      ) {
        if (await page.locator("#int-task-panel").isHidden())
          await page.locator("#int-task-line").click();
        const answer = await page.locator("#int-answer").inputValue();
        await page.locator('[data-int-action="A"]').click();
        await page.locator('[data-int-action="inspect-reference"]').click();
        await page.locator('[data-int-action="answer-open"]').click();
        await page.selectOption("#int-answer", answer);
      }
    }
    if (
      ["save-attempt", "restore-best", "start-lab"].includes(action) ||
      action.startsWith("view-attempt-") ||
      action.startsWith("restore-attempt-")
    ) {
      if (await page.locator("#int-plans-panel").isHidden()) {
        if (
          !(await page
            .locator("#int-tools")
            .evaluate((e: HTMLDetailsElement) => e.open))
        )
          await page.locator("#int-tools>summary").click();
        await page.locator('[data-int-action="panel-plans"]').click();
      }
    }
    if (advanced.has(action)) {
      const close = page.locator(
        '.int-floating-panel:visible [data-int-action="close-panel"]',
      );
      if (await close.count()) await close.first().click();
      if (await page.locator("#int-adjust-panel").isHidden())
        await page.locator('[data-int-action="adjust"]').click();
      if (
        !(await page
          .locator("#int-adjust-panel details")
          .evaluate((e: HTMLDetailsElement) => e.open))
      )
        await page.locator("#int-adjust-panel details>summary").click();
    }
    if (
      tool.has(action) &&
      !(await page
        .locator("#int-tools")
        .evaluate((e: HTMLDetailsElement) => e.open))
    )
      await page.locator("#int-tools>summary").click();
    if (
      view &&
      !(await page
        .locator("#int-view-menu")
        .evaluate((e: HTMLDetailsElement) => e.open))
    )
      await page.locator("#int-view-menu>summary").click();
    if (
      action.startsWith("select-") &&
      (await page.locator("#int-task-panel").isHidden())
    )
      await page.locator("#int-task-line").click();
  }
  return new Proxy(locator, {
    get(target, prop) {
      if (prop === "constructor") return target.constructor;
      if (prop === "click" || prop === "hover")
        return async (...args: unknown[]) => {
          await prepare();
          const result = await (target[prop] as Function).apply(target, args);
          if (
            view &&
            (await page.locator("#int-answer").count()) &&
            (await page.locator("#int-task-panel").isHidden())
          )
            await page.locator("#int-task-line").click();
          if (
            (action === "A" || action === "B") &&
            (await page.locator("#int-task-panel").isHidden())
          )
            await page.locator('[data-int-action="answer-open"]').click();
          return result;
        };
      const value = Reflect.get(target, prop);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
export async function openFineControls(page: Page) {
  if (await page.locator("#int-adjust-panel").isHidden())
    await page.locator('[data-int-action="adjust"]').click();
  if (
    !(await page
      .locator("#int-adjust-panel details")
      .evaluate((e: HTMLDetailsElement) => e.open))
  )
    await page.locator("#int-adjust-panel details>summary").click();
}
