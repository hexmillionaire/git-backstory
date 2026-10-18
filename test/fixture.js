// Builds a small real git repo with a story in it: a feature, a revert, a fix
// burst, a file that always changes alongside, and a rename.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), "git-backstory-"));
  const g = (...args) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_AUTHOR_NAME: "Ada",
        GIT_AUTHOR_EMAIL: "ada@example.com",
        GIT_COMMITTER_NAME: "Ada",
        GIT_COMMITTER_EMAIL: "ada@example.com",
      },
    }).trim();
  let day = 1;
  const commit = (msg, { author = "Ada", when = null } = {}) => {
    const date = when ?? `2025-01-${String(day++).padStart(2, "0")}T12:00:00Z`;
    g("add", "-A");
    execFileSync("git", ["-c", `user.name=${author}`, "-c", `user.email=${author.toLowerCase()}@example.com`, "commit", "-q", "-m", msg], {
      cwd: dir,
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    });
    return g("rev-parse", "HEAD");
  };

  g("init", "-q", "-b", "main");
  g("remote", "add", "origin", "git@github.com:acme/shop.git");
  mkdirSync(join(dir, "src"), { recursive: true });
  const w = (f, s) => writeFileSync(join(dir, f), s);

  w("src/price.js", "export function price(n) {\n  return n;\n}\n");
  w("src/price.test.js", "test('price');\n");
  commit("Add price helper\n\nFixes #12");

  w("src/price.js", "export function price(n) {\n  return n * 1.15;\n}\n");
  w("src/price.test.js", "test('price with tax');\n");
  commit("Add VAT to price\n\nVAT must be applied before rounding, otherwise totals drift by a cent.");

  w("src/price.js", "export function price(n) {\n  return Math.round(n * 1.15);\n}\n");
  w("src/price.test.js", "test('rounded');\n");
  const rounding = commit("Round prices to whole units", { author: "Bob" });

  // Revert it.
  g("revert", "--no-edit", "--no-commit", rounding);
  commit(`Revert "Round prices to whole units"\n\nThis reverts commit ${rounding}.\nRounding broke the invoice totals (#30).`);

  // A fix burst a month later, two days apart.
  day = 1;
  w("src/price.js", "export function price(n, rate = 0.15) {\n  return n * (1 + rate);\n}\n");
  commit("fix: price ignored custom rate", { when: "2025-03-01T12:00:00Z" });
  w("src/price.js", "export function price(n, rate = 0.15) {\n  if (n < 0) throw new Error('negative');\n  return n * (1 + rate);\n}\n");
  commit("fix: reject negative prices (regression from #44)", { when: "2025-03-02T12:00:00Z" });
  w("src/price.js", "export function price(n, rate = 0.15) {\n  if (n < 0) throw new RangeError('negative');\n  return n * (1 + rate);\n}\n");
  commit("Use RangeError for negatives", { when: "2025-03-03T12:00:00Z" });

  // Rename.
  mkdirSync(join(dir, "src/money"), { recursive: true });
  g("mv", "src/price.js", "src/money/price.js");
  commit("Move price into money/", { when: "2025-04-01T12:00:00Z" });

  return { dir, g };
}
