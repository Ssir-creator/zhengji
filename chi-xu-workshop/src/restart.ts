import { COURSE_KEY, freshCourse } from "./course";
import { CHALLENGE_KEY, freshChallenge } from "./challenge";
import type { ReferenceCase } from "./prediction";
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
/** Restart only the chosen mode, after confirmation and reference loading. */
export function restartChallenge(
  mode: "course" | "interaction",
  data: ReferenceCase,
  store: Store = localStorage,
) {
  const key = mode === "course" ? COURSE_KEY : CHALLENGE_KEY;
  const changes: Array<[string, string | null]> = [
    [
      key,
      JSON.stringify(
        mode === "course" ? freshCourse(data) : freshChallenge(data),
      ),
    ],
  ];
  if (mode === "interaction")
    changes.push(
      [key + ":attempts", null],
      [key + ":retry", null],
      [key + ":retry:attempts", null],
    );
  const previous = changes.map(
    ([name]) => [name, store.getItem(name)] as const,
  );
  try {
    for (const [name, value] of changes)
      value === null ? store.removeItem(name) : store.setItem(name, value);
  } catch (error) {
    for (const [name, value] of previous) {
      try {
        value === null ? store.removeItem(name) : store.setItem(name, value);
      } catch {
        /* Do not hide the original storage failure. */
      }
    }
    throw error;
  }
}
