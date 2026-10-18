import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { brief, parseArgs, splitTarget, UsageError } from "../src/cli.js";
import { makeFixture } from "./fixture.js";

const bin = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "git-brief.js");
const { dir } = makeFixture();
const exitCode = (args) => {
  try {
    run(args, { stdio: "pipe" });
    return 0;
  } catch (e) {
    return e.status;
  }
};
const run = (args, opts = {}) => execFileSync(process.execPath, [bin, ...args], { cwd: dir, encoding: "utf8", ...opts });

test("splitTarget handles files, lines, ranges and Windows drives", () => {
  assert.deepEqual(splitTarget("src/a.js"), { file: "src/a.js", range: null });
  assert.deepEqual(splitTarget("src/a.js:12"), { file: "src/a.js", range: { start: 12, end: 12 } });
  assert.deepEqual(splitTarget("src/a.js:3-9"), { file: "src/a.js", range: { start: 3, end: 9 } });
  assert.deepEqual(splitTarget("C:\\repo\\a.js"), { file: "C:\\repo\\a.js", range: null });
  assert.throws(() => splitTarget("a.js:9-3"), UsageError);
});

test("parseArgs", () => {
  assert.equal(parseArgs(["a.js", "--json", "--max=5"]).max, 5);
  assert.equal(parseArgs(["--since", "2025-01-01", "a.js"]).since, "2025-01-01");
  assert.throws(() => parseArgs(["--bogus"]), UsageError);
  assert.throws(() => parseArgs(["a", "b"]), UsageError);
});

test("full brief on the fixture: revert, fixes, co-change, rename, owners", () => {
  const { facts, markdown } = brief("src/money/price.js", parseArgs(["src/money/price.js"]), dir);
  assert.equal(facts.commitCount, 8);
  assert.equal(facts.reverts.length, 1);
  assert.equal(facts.reverts[0].target.subject, "Round prices to whole units");
  assert.ok(facts.fixes.some((f) => /custom rate/.test(f.subject)));
  assert.ok(facts.bursts.length >= 1, "March fix burst flagged");
  assert.deepEqual(facts.coChanged.map((x) => x.path), ["src/price.test.js"]);
  assert.ok(facts.refs.some((r) => r.number === "30"));
  assert.ok(facts.notes.some((n) => /VAT must be applied/.test(n.line)));
  assert.ok(facts.ownership.total >= 3);
  assert.match(markdown, /Previously at: `src\/price\.js`/);
  assert.match(markdown, /## Be careful/);
  assert.match(markdown, /reverted \[`[0-9a-f]{7}`\]\(https:\/\/github\.com\/acme\/shop\/commit/);
  assert.match(markdown, /## Usually changes together with/);
  assert.match(markdown, /Current lines by author: Ada/);
  assert.ok(markdown.split("\n").length < 60, "brief stays brief");
});

test("line range brief uses git log -L", () => {
  const { facts } = brief("src/money/price.js:2-2", parseArgs(["x"]), dir);
  assert.ok(facts.commitCount >= 1 && facts.commitCount < 8);
});

test("CLI: stdout markdown, --json, --no-links, --out, exit codes", () => {
  const md = run(["src/money/price.js"]);
  assert.match(md, /^# History brief/);
  const plain = run(["src/money/price.js", "--no-links"]);
  assert.doesNotMatch(plain, /github\.com/);
  const j = JSON.parse(run(["src/money/price.js", "--json"]));
  assert.equal(j.commitCount, 8);
  assert.equal(j.reverts.length, 1);
  run(["src/money/price.js", "--out", "BRIEF.md"]);
  assert.match(readFileSync(join(dir, "BRIEF.md"), "utf8"), /History brief/);
  assert.match(run(["--help"]), /Usage/);
  assert.match(run(["--version"]), /^\d+\.\d+\.\d+/);
  assert.equal(exitCode(["--max", "x"]), 2);
});

test("CLI: untracked path gives a readable brief, directory is refused", () => {
  assert.match(run(["does-not-exist.js"]), /No history for this path/);
  assert.equal(exitCode(["src"]), 2);
});

test("works when the temp dir is reached through a symlink (macOS /var -> /private/var)", async () => {
  const { symlinkSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const linkRoot = mkdtempSync(join(tmpdir(), "git-brief-link-"));
  const link = join(linkRoot, "repo");
  try {
    symlinkSync(dir, link, "dir");
  } catch {
    return; // no symlink permission (some Windows runners); nothing to test
  }
  const { facts } = brief("src/money/price.js", parseArgs(["x"]), link);
  assert.equal(facts.commitCount, 8);
});
