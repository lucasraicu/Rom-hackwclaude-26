// Isolated replay regressions: no API calls and no writes to repository caches.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

const root = process.cwd();
const replay = path.join(root, "scripts/replay-claude-runs.ts");
const loader = createRequire(path.join(root, "package.json")).resolve("tsx");
const scenarios = ["initial", "after-fix", "scope-of-work"];

async function workspace() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "fundproof-replay-"));
  await fs.mkdir(path.join(directory, "data"));
  for (const name of ["inputs", "claude-runs", "cache"]) {
    await fs.cp(path.join(root, "data", name), path.join(directory, "data", name), { recursive: true });
  }
  await fs.copyFile(path.join(root, "data/expected.json"), path.join(directory, "data/expected.json"));
  return directory;
}

for (const failure of ["wrong final expectation", "missing final expectation"]) {
  test(`replay preserves every existing cache with ${failure}`, async () => {
    const directory = await workspace();
    try {
      const files = scenarios.map((scenario) => path.join(directory, "data/cache", `analysis.${scenario}.json`));
      const before = await Promise.all(files.map((file) => fs.readFile(file)));
      const expectedFile = path.join(directory, "data/expected.json");
      const expected = JSON.parse(await fs.readFile(expectedFile, "utf8"));
      if (failure === "missing final expectation") delete expected.scopeOfWork;
      else expected.scopeOfWork["T-003"] = { status: "needs_evidence", splits: {} };
      await fs.writeFile(expectedFile, JSON.stringify(expected));
      const result = spawnSync(process.execPath, ["--import", loader, replay], { cwd: directory, encoding: "utf8", timeout: 30000 });
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /existing caches preserved/);
      assert.deepEqual(await Promise.all(files.map((file) => fs.readFile(file))), before);
      assert.ok((await fs.readdir(path.join(directory, "data/cache"))).every((file) => !file.endsWith(".tmp")));
    } finally { await fs.rm(directory, { recursive: true, force: true }); }
  });
}

test("valid replay publishes all three checked caches and cleans staging files", async () => {
  const directory = await workspace();
  try {
    const result = spawnSync(process.execPath, ["--import", loader, replay], { cwd: directory, encoding: "utf8", timeout: 30000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal((result.stdout.match(/Published validated cache/g) ?? []).length, 3);
    for (const scenario of scenarios) {
      const cached = JSON.parse(await fs.readFile(path.join(directory, "data/cache", `analysis.${scenario}.json`), "utf8"));
      assert.equal(cached.mode, "cache");
      assert.equal(cached.summary.itemCount, 13);
      assert.equal(cached.summary.citationsVerified, 29);
    }
    assert.ok((await fs.readdir(path.join(directory, "data/cache"))).every((file) => !file.endsWith(".tmp")));
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
