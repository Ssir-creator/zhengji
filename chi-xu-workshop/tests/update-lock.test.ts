import { it, expect, afterEach } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readdir,
  rm,
  utimes,
  readFile,
} from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
const mod = "../scripts/update-lock.mjs";
const { acquireUpdateLock, inspectUpdateLock } = await import(mod);
const dirs: string[] = [];
afterEach(async () => {
  for (const p of dirs.splice(0)) await rm(p, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "chixu-lock-"));
  dirs.push(dir);
  return join(dir, "game");
}
it("有PID的失效锁可恢复，有效锁不可抢占；只释放自己的锁", async () => {
  const root = await fixture(),
    lock = root + ".update-lock";
  await mkdir(lock);
  await writeFile(
    join(lock, "owner.json"),
    JSON.stringify({ pid: 999999, host: hostname(), token: "old" }),
  );
  const release = await acquireUpdateLock(root, { isAlive: () => false });
  expect(await inspectUpdateLock(root)).toBe("active");
  await expect(acquireUpdateLock(root)).rejects.toThrow("已有更新任务");
  expect(JSON.parse(await readFile(join(lock, "owner.json"), "utf8")).pid).toBe(
    process.pid,
  );
  await release();
  expect(await inspectUpdateLock(root)).toBe("absent");
  expect((await readdir(dirs[0])).some((n) => n.includes(".recovered-"))).toBe(
    true,
  );
});
it("旧空锁只有超过宽限期且无更新进程时恢复；扫描不确定保持锁", async () => {
  const root = await fixture();
  await mkdir(root + ".update-lock");
  expect(await inspectUpdateLock(root, { scan: async () => false })).toBe(
    "active",
  );
  await utimes(root + ".update-lock", new Date(0), new Date(0));
  expect(await inspectUpdateLock(root, { scan: async () => true })).toBe(
    "active",
  );
  const release = await acquireUpdateLock(root, { scan: async () => false });
  await release();
});
it("并发恢复仅允许一个调用持有有效锁", async () => {
  const root = await fixture();
  await mkdir(root + ".update-lock");
  await utimes(root + ".update-lock", new Date(0), new Date(0));
  const results = await Promise.allSettled([
    acquireUpdateLock(root, { scan: async () => false }),
    acquireUpdateLock(root, { scan: async () => false }),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  for (const r of results) if (r.status === "fulfilled") await r.value();
});
