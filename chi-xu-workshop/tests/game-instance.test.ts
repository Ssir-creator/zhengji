import { it, expect } from "vitest";
const mod = "../scripts/game-instance.mjs";
const { existingGame, installationID } = await import(mod);
it("只复用已识别的同一安装，其他服务、旧版及无效响应不当作游戏", async () => {
  const root = "/tmp/game",
    request = async () =>
      new Response(
        JSON.stringify({
          app: "chi-xu-workshop",
          installation: installationID(root),
        }),
      );
  expect(await existingGame(root, { request })).toBe(true);
  expect(await existingGame("/tmp/other", { request })).toBe(false);
  expect(
    await existingGame(root, {
      request: async () => new Response("<title>齿序工坊</title>"),
    }),
  ).toBe(false);
  expect(
    await existingGame(root, {
      request: async () => {
        throw Error("offline");
      },
    }),
  ).toBe(false);
});
