import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze } from "../src/analyze.js";
import { render, humanDays } from "../src/render.js";

const c = (short, subject, date, extra = {}) => ({
  hash: short.padEnd(40, "0"), short, author: "Ada", date, parents: [], subject, body: "", files: [], ...extra,
});

test("detects reverts by hash and by subject", () => {
  const target = c("aaaaaaa", "Round prices", "2025-01-03T00:00:00Z");
  const byHash = c("bbbbbbb", 'Revert "Round prices"', "2025-01-04T00:00:00Z", { body: `This reverts commit ${target.hash}.` });
  const other = c("ccccccc", "Add thing", "2025-01-05T00:00:00Z");
  const bySubject = c("ddddddd", 'Revert "Add thing"', "2025-01-06T00:00:00Z");
  const a = analyze([bySubject, other, byHash, target], { file: "x.js" });
  assert.equal(a.reverts.length, 2);
  assert.equal(a.reverts.find((r) => r.revert.short === "bbbbbbb").target.short, "aaaaaaa");
  assert.equal(a.reverts.find((r) => r.revert.short === "ddddddd").target.short, "ccccccc");
  // reverted commits are not counted as fixes and their notes are dropped
  assert.ok(!a.fixes.some((f) => f.short === "aaaaaaa"));
});

test("co-changed files need a real share, not one coincidence", () => {
  const mk = (i, files) => c(String(i).padStart(7, "0"), `c${i}`, `2025-01-0${i}T00:00:00Z`, { files: ["x.js", ...files] });
  const a = analyze([mk(1, ["x.test.js"]), mk(2, ["x.test.js", "README.md"]), mk(3, ["x.test.js"]), mk(4, [])], { file: "x.js" });
  assert.deepEqual(a.coChanged.map((x) => x.path), ["x.test.js"]);
  assert.equal(a.coChanged[0].count, 3);
});

test("bursts in a young file are not flagged; bursts with fixes are", () => {
  const now = new Date("2025-01-10T00:00:00Z");
  const young = [1, 2, 3, 4].map((i) => c(String(i).padStart(7, "0"), `feature ${i}`, `2025-01-0${i}T00:00:00Z`));
  assert.equal(analyze(young, { file: "x.js", now }).bursts.length, 0);
  const fixy = [c("0000000", "add", "2024-11-01T00:00:00Z"), c("1111111", "more", "2025-01-01T00:00:00Z"), c("2222222", "fix: oops", "2025-01-02T00:00:00Z"), c("3333333", "fix again", "2025-01-03T00:00:00Z")];
  assert.equal(analyze(fixy, { file: "x.js", now }).bursts.length, 1);
});

test("notes pull reasons and constraints out of bodies, skipping trailers", () => {
  const a = analyze([
    c("1111111", "Add VAT", "2025-01-01T00:00:00Z", { body: "VAT must be applied before rounding, otherwise totals drift.\n\nSigned-off-by: Ada <a@b.c>\nCo-Authored-By: Bot <bot@b.c>" }),
  ], { file: "x.js" });
  assert.equal(a.notes.length, 1);
  assert.match(a.notes[0].line, /must be applied/);
});

test("render: sections appear only when there is something to say, and it stays short", () => {
  const md = render(analyze([c("1111111", "Add", "2025-01-01T00:00:00Z")], { file: "x.js" }));
  assert.match(md, /^# History brief: `x\.js`/);
  assert.doesNotMatch(md, /## Be careful/);
  assert.doesNotMatch(md, /## Usually changes together/);
  assert.match(md, /## Timeline/);
  assert.ok(md.split("\n").length < 20);
});

test("render: links use the remote when given", () => {
  const md = render(analyze([c("1111111", "Add #7", "2025-01-01T00:00:00Z")], { file: "x.js" }), { webUrl: "https://github.com/acme/shop" });
  assert.match(md, /https:\/\/github\.com\/acme\/shop\/commit\/1111111/);
  assert.match(md, /\[#7\]\(https:\/\/github\.com\/acme\/shop\/issues\/7\)/);
});

test("humanDays", () => {
  assert.equal(humanDays(0), "today");
  assert.equal(humanDays(1), "1 day");
  assert.equal(humanDays(21), "3 weeks");
  assert.equal(humanDays(400), "13 months");
  assert.equal(humanDays(1000), "2.7 years");
});

test("unwrap re-joins wrapped paragraphs and keeps list items apart", async () => {
  const { unwrap } = await import("../src/analyze.js");
  assert.deepEqual(unwrap("Line one that\nwraps here.\n\n- item a\n- item b\n  continues"), ["Line one that wraps here.", "- item a", "- item b continues"]);
});

test("the initial build-out burst is not flagged, a later fix burst is", () => {
  const now = new Date("2025-06-01T00:00:00Z");
  const initial = [1, 2, 3, 4].map((i) => c(String(i).padStart(7, "0"), i === 2 ? "fix: early" : `build ${i}`, `2025-01-0${i}T00:00:00Z`));
  assert.equal(analyze(initial, { file: "x.js", now }).bursts.length, 0);
  const later = [c("aaaaaaa", "add", "2025-01-01T00:00:00Z"), c("bbbbbbb", "fix: a", "2025-03-01T00:00:00Z"), c("ccccccc", "fix: b", "2025-03-02T00:00:00Z"), c("ddddddd", "fix: c", "2025-03-03T00:00:00Z")];
  assert.equal(analyze(later, { file: "x.js", now }).bursts.length, 1);
});
