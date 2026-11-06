import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { referenceCase } from "../src/prediction";
import { COURSE_KEY, freshCourse } from "../src/course";
import { CHALLENGE_KEY, freshChallenge } from "../src/challenge";
import { restartChallenge } from "../src/restart";
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
function storage() {
  const map = new Map<string, string>([
    [COURSE_KEY, "prior course"],
    [CHALLENGE_KEY, "prior nine"],
    [CHALLENGE_KEY + ":attempts", "plans"],
    [CHALLENGE_KEY + ":retry", "retry"],
    ["chi-xu-workshop:language:v1", "en"],
    ["chi-xu-workshop:challenge:v1", "original save"],
  ]);
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}
test("foundation restart replaces only foundation progress with valid first level", () => {
  const s = storage();
  restartChallenge("course", data, s);
  expect(JSON.parse(s.getItem(COURSE_KEY)!)).toEqual(freshCourse(data));
  expect(s.getItem(CHALLENGE_KEY)).toBe("prior nine");
  expect(s.getItem(CHALLENGE_KEY + ":attempts")).toBe("plans");
  expect(s.getItem("chi-xu-workshop:language:v1")).toBe("en");
  expect(s.getItem("chi-xu-workshop:challenge:v1")).toBe("original save");
});
test("nine-task restart clears its attempts and retries, preserving other progress", () => {
  const s = storage();
  restartChallenge("interaction", data, s);
  expect(JSON.parse(s.getItem(CHALLENGE_KEY)!)).toEqual(freshChallenge(data));
  expect(s.getItem(CHALLENGE_KEY + ":attempts")).toBeNull();
  expect(s.getItem(CHALLENGE_KEY + ":retry")).toBeNull();
  expect(s.getItem(COURSE_KEY)).toBe("prior course");
});
test("failure while clearing attempts restores previously stored progress", () => {
  const s = storage(),
    remove = s.removeItem;
  let failed = false;
  s.removeItem = (key: string) => {
    if (!failed) {
      failed = true;
      throw Error("storage blocked");
    }
    remove(key);
  };
  expect(() => restartChallenge("interaction", data, s)).toThrow(
    "storage blocked",
  );
  expect(s.getItem(CHALLENGE_KEY)).toBe("prior nine");
  expect(s.getItem(CHALLENGE_KEY + ":attempts")).toBe("plans");
  expect(s.getItem(CHALLENGE_KEY + ":retry")).toBe("retry");
});
