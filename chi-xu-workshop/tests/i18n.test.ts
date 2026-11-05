import { describe, expect, it } from "vitest";
import { translate } from "../src/i18n";
describe("bilingual display copy", () => {
  it("translates learning feedback and keeps original Chinese available", () => {
    expect(translate("位置合适，方向还差一点。", "en")).toBe(
      "Position is right. Adjust the orientation.",
    );
    expect(translate("把它挪到轮廓里。", "zh")).toBe("把它挪到轮廓里。");
  });
  it("handles camera-relative directions and numeric runtime copy", () => {
    expect(translate("向右上挪 · 朝向你", "en")).toBe(
      "Move up and right · Toward you",
    );
    expect(translate("位置待调 · 方向 ✓", "en")).toBe(
      "Position needs adjusting · Orientation ✓",
    );
    expect(translate("第 4 步 · 文件 12", "en")).not.toMatch(/[\u3400-\u9fff]/);
  });
  it("preserves filenames, raw unknown errors and numerical values", () => {
    expect(translate("tooth_12.glb SHA-256 1234 0.25 u", "en")).toBe(
      "tooth_12.glb SHA-256 1234 0.25 u",
    );
    expect(translate("未知用户输入", "en")).toBe("未知用户输入");
    expect(translate("3 / 6 · 先看，再动手", "en")).toBe(
      "3 / 6 · Look, then act",
    );
  });
});
