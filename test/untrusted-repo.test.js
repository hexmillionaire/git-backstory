// The repository being read is untrusted. Its .git/config must not be able
// to make this tool run anything but git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { blame, fileLog, git, isTracked, lineCount, rangeLog, safeEnv } from "../src/git.js";

function hostileRepo() {
  const dir = mkdtempSync(join(tmpdir(), "git-backstory-hostile-"));
  const g = (...args) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
  g("init", "-q", "-b", "main");
  g("config", "user.name", "Mallory");
  g("config", "user.email", "mallory@example.com");
  writeFileSync(join(dir, "a.js"), "export const a = 1;\n");
  g("add", "a.js");
  g("commit", "-q", "-m", "add a");

  // Every "run this program" knob git offers, pointed at a script that leaves a marker.
  const marker = join(dir, "PWNED");
  const script = join(dir, "hook.js");
  writeFileSync(script, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "ran");\nprocess.stdout.write("/");\n`);
  const cmd = `"${process.execPath}" "${script}"`;
  g("config", "core.fsmonitor", cmd);
  g("config", "core.pager", cmd);
  g("config", "diff.external", cmd);
  g("config", "diff.evil.textconv", cmd);
  g("config", "core.sshCommand", cmd);
  g("config", "gpg.program", cmd);
  writeFileSync(join(dir, ".gitattributes"), "*.js diff=evil\n");
  g("add", ".gitattributes");
  g("commit", "-q", "-m", "attributes");
  // Those plain git calls above already ran the hook; prove the setup is live, then reset.
  assert.ok(existsSync(marker), "fixture sanity: unguarded git does run the configured program");
  rmSync(marker);
  return { dir, marker };
}

test("repo-local git config cannot execute programs", () => {
  const { dir, marker } = hostileRepo();
  git(dir, ["status", "--porcelain"]);
  git(dir, ["ls-files"]);
  assert.ok(isTracked(dir, "a.js"));
  assert.equal(fileLog(dir, "a.js").length, 1);
  assert.ok(blame(dir, "a.js").total >= 1);
  assert.equal(rangeLog(dir, "a.js", 1, 1).length, 1);
  assert.equal(lineCount(dir, "a.js"), 1);
  assert.equal(existsSync(marker), false, "a program named in .git/config was executed");
});

test("safeEnv drops GIT_* and disables prompts and system config", () => {
  const env = safeEnv({ PATH: "/usr/bin", GIT_DIR: "/elsewhere", git_work_tree: "/x", HOME: "/h" });
  assert.deepEqual(Object.keys(env).sort(), ["GIT_CONFIG_NOSYSTEM", "GIT_OPTIONAL_LOCKS", "GIT_TERMINAL_PROMPT", "HOME", "PATH"]);
  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
});
