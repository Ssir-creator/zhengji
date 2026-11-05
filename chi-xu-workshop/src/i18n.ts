import { english } from "./i18n-catalog";

export type Language = "zh" | "en";
export const LANGUAGE_KEY = "chi-xu-workshop:language:v1";
let language: Language = "zh";
const phrases = Object.keys(english)
  .filter((key) => key.length > 1 && !/[<>]/.test(key))
  .sort((a, b) => b.length - a.length);
const phrasePattern = new RegExp(
  phrases.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "g",
);
/** Translate display copy only; identifiers, persisted events and model data stay unchanged. */
export function translate(source: string, locale: Language = language): string {
  if (locale === "zh" || !/[\u3400-\u9fff]/.test(source)) return source;
  const trimmed = source.trim();
  if (english[trimmed]) return source.replace(trimmed, english[trimmed]);
  const dynamic = source
    .replace(
      /向([左右]?)([上下]?)挪/g,
      (_, h: string, v: string) =>
        `Move ${{ 上: "up", 下: "down" }[v as "上"] ?? ""}${h && v ? " and " : ""}${{ 左: "left", 右: "right" }[h as "左"] ?? ""}`,
    )
    .replace(
      /第\s*(\d+)\s*([步关批])/g,
      (_, n: string, unit: string) =>
        `${({ 步: "Step", 关: "Level", 批: "Batch" } as Record<string, string>)[unit]} ${n}`,
    );
  return dynamic
    .replace(phrasePattern, (key: string, offset: number) => {
      const value = english[key];
      const before = dynamic[offset - 1] ?? "",
        after = dynamic[offset + key.length] ?? "";
      return (
        (/^[A-Za-z]/.test(value) && /[\w\u3400-\u9fff]/.test(before)
          ? " "
          : "") +
        value +
        (/[A-Za-z]$/.test(value) && /[\w\u3400-\u9fff]/.test(after) ? " " : "")
      );
    })
    .replace(/(\d+)\s*颗/g, "$1 teeth")
    .replace(/(\d+)\s*次/g, "$1 times")
    .replace(/(\d+)\s*步/g, "$1 steps")
    .replace(/ {2,}/g, " ");
}

export function languagePickerHTML(): string {
  return `<div class="language-picker" role="group" aria-label="语言选择"><button type="button" data-language-choice="zh" lang="zh-CN" aria-pressed="${language === "zh"}">中文</button><button type="button" data-language-choice="en" lang="en" aria-pressed="${language === "en"}">English</button></div>`;
}

type Copy = { source: string; rendered: string };
const originals = new WeakMap<Node, Copy>();
const attributes = new WeakMap<Element, Map<string, Copy>>();
const translatedAttributes = [
  "aria-label",
  "aria-description",
  "title",
  "placeholder",
  "alt",
];
function localize(root: Node): void {
  const element = root instanceof Element ? root : root.parentElement;
  if (element?.closest("script,style,textarea,code,pre,[data-no-translate]"))
    return;
  if (root.nodeType === Node.TEXT_NODE) {
    const current = root.nodeValue ?? "";
    const previous = originals.get(root);
    const source =
      previous && current === previous.rendered ? previous.source : current;
    const rendered = translate(source);
    originals.set(root, { source, rendered });
    // An implicit option value must remain a stable programmatic value when its label changes.
    const option = root.parentElement;
    if (option instanceof HTMLOptionElement && !option.hasAttribute("value"))
      option.value = source;
    if (current !== rendered) root.nodeValue = rendered;
    return;
  }
  if (root instanceof Element) {
    let saved = attributes.get(root);
    if (!saved) {
      saved = new Map();
      attributes.set(root, saved);
    }
    for (const name of translatedAttributes) {
      const current = root.getAttribute(name);
      if (current === null) continue;
      const previous = saved.get(name);
      const source =
        previous && current === previous.rendered ? previous.source : current;
      const rendered = translate(source);
      saved.set(name, { source, rendered });
      if (current !== rendered) root.setAttribute(name, rendered);
    }
    if (root.matches("[data-language-choice]"))
      root.setAttribute(
        "aria-pressed",
        String(root.getAttribute("data-language-choice") === language),
      );
  }
  for (const child of root.childNodes) localize(child);
}
export function setLanguage(next: Language): void {
  language = next;
  try {
    localStorage.setItem(LANGUAGE_KEY, next);
  } catch {
    /* Session-only choice when storage is unavailable. */
  }
  document.documentElement.lang = next === "en" ? "en" : "zh-CN";
  document.documentElement.dataset.locale = next;
  localize(document.body);
  document.title = next === "en" ? "Chi Xu Workshop" : "齿序工坊";
}
export function initializeLanguage(): void {
  try {
    language = localStorage.getItem(LANGUAGE_KEY) === "en" ? "en" : "zh";
  } catch {
    language = "zh";
  }
  setLanguage(language);
  new MutationObserver((records) => {
    const roots = new Set<Node>();
    for (const record of records) {
      if (record.type === "childList")
        for (const node of record.addedNodes) roots.add(node);
      else roots.add(record.target);
    }
    for (const node of roots) if (node.isConnected) localize(node);
  }).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: translatedAttributes,
  });
  document.addEventListener("click", (event) => {
    const choice = (event.target as Element).closest<HTMLElement>(
      "[data-language-choice]",
    )?.dataset.languageChoice;
    if (choice === "zh" || choice === "en") setLanguage(choice);
  });
  const nativeConfirm = window.confirm.bind(window),
    nativeAlert = window.alert.bind(window);
  window.confirm = (message?: string) =>
    nativeConfirm(translate(String(message ?? "")));
  window.alert = (message?: unknown) =>
    nativeAlert(translate(String(message ?? "")));
}
