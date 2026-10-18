import { resolve, relative, sep, isAbsolute } from "node:path";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { analyze, renameTrail } from "./analyze.js";
import { render } from "./render.js";
import { GitError, blame, fileLog, isTracked, lineCount, rangeLog, remoteWebUrl, repoRoot } from "./git.js";

const { version } = createRequire(import.meta.url)("../package.json");

export const HELP = `git-brief ${version} — a history brief for one file, written for whoever has to change it next.

Usage
  git-brief <path>              brief for a file
  git-brief <path>:<line>       brief for one line
  git-brief <path>:<from>-<to>  brief for a line range
  git-brief <path> --json       the facts as JSON instead of markdown

Options
  --max <n>       commits to sample (default 200)
  --since <date>  only commits after this date, e.g. 2025-01-01 or "6 months ago"
  --out <file>    write the brief to a file instead of stdout
  --no-links      plain hashes, no web links
  --version, --help

Reads git only (log, blame, show). Never writes to the repository, never
touches the network. Zero dependencies.`;

export function parseArgs(argv) {
  const o = { target: null, json: false, max: 200, since: null, out: null, links: true, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--version" || a === "-v") o.version = true;
    else if (a === "--json") o.json = true;
    else if (a === "--no-links") o.links = false;
    else if (a === "--max") o.max = Number(argv[++i]);
    else if (a.startsWith("--max=")) o.max = Number(a.slice(6));
    else if (a === "--since") o.since = argv[++i];
    else if (a.startsWith("--since=")) o.since = a.slice(8);
    else if (a === "--out") o.out = argv[++i];
    else if (a.startsWith("--out=")) o.out = a.slice(6);
    else if (a.startsWith("-")) throw new UsageError(`Unknown option: ${a}`);
    else if (o.target) throw new UsageError("Only one path at a time.");
    else o.target = a;
  }
  if (!Number.isInteger(o.max) || o.max < 1) throw new UsageError("--max must be a positive integer.");
  return o;
}

export class UsageError extends Error {}

/** "src/a.ts:10-20" -> { file, range } ; Windows drive letters are left alone. */
export function splitTarget(target) {
  const m = target.match(/^(.*?):(\d+)(?:-(\d+))?$/);
  if (!m || /^[A-Za-z]:$/.test(m[1])) return { file: target, range: null };
  const start = Number(m[2]);
  const end = m[3] ? Number(m[3]) : start;
  if (start < 1 || end < start) throw new UsageError(`Bad line range: ${target}`);
  return { file: m[1], range: { start, end } };
}

export function brief(targetArg, opts, cwd = process.cwd()) {
  const { file: rawFile, range } = splitTarget(targetArg);
  const abs = resolve(cwd, rawFile);
  const root = repoRoot(existsSync(abs) && statSync(abs).isDirectory() ? abs : resolve(abs, ".."));
  let file = relative(root, abs).split(sep).join("/");
  if (!file || file.startsWith("..") || isAbsolute(file)) throw new UsageError(`${rawFile} is outside the repository at ${root}.`);

  if (existsSync(abs) && statSync(abs).isDirectory()) throw new UsageError(`${rawFile} is a directory. git-brief works on one file.`);
  if (!isTracked(root, file) && !existsSync(abs)) {
    // Allow briefs on deleted files: the log still exists.
  }

  const commits = range ? rangeLog(root, file, range.start, range.end, { max: opts.max }) : fileLog(root, file, { max: opts.max, since: opts.since });
  const b = isTracked(root, file) ? blame(root, file, range ? { start: range.start, end: range.end } : {}) : null;
  const lines = isTracked(root, file) ? lineCount(root, file) : null;
  const facts = analyze(commits, { file, blame: b, lineCount: lines });
  facts.sampleLimit = opts.max;
  const previousPaths = range ? [] : renameTrail(commits, file);
  const webUrl = opts.links ? remoteWebUrl(root) : null;
  return { facts, markdown: render(facts, { webUrl, range, previousPaths }), root, file, range };
}

export async function run(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      io.stderr.write(`${e.message}\n\n${HELP}\n`);
      return 2;
    }
    throw e;
  }
  if (opts.version) return io.stdout.write(`${version}\n`), 0;
  if (opts.help || !opts.target) return io.stdout.write(`${HELP}\n`), opts.help ? 0 : 2;

  try {
    const { facts, markdown } = brief(opts.target, opts);
    const out = opts.json ? JSON.stringify(toJson(facts), null, 2) + "\n" : markdown;
    if (opts.out) {
      writeFileSync(opts.out, out);
      io.stderr.write(`Wrote ${opts.out}\n`);
    } else io.stdout.write(out);
    return 0;
  } catch (e) {
    if (e instanceof UsageError || e instanceof GitError) {
      io.stderr.write(`git-brief: ${e.message}\n`);
      return e.code ?? 2;
    }
    throw e;
  }
}

function toJson(f) {
  const c = (x) => x && { hash: x.hash, short: x.short, author: x.author, date: x.date, subject: x.subject };
  return {
    file: f.file,
    lineCount: f.lineCount,
    commitCount: f.commitCount,
    first: c(f.first),
    last: c(f.last),
    ageDays: f.ageDays,
    quietDays: f.quietDays,
    authors: f.authors,
    reverts: f.reverts.map((r) => ({ revert: c(r.revert), target: c(r.target) })),
    fixes: f.fixes.map(c),
    refs: f.refs.map((r) => ({ number: r.number, commits: r.commits.map((x) => x.short) })),
    coChanged: f.coChanged,
    bursts: f.bursts.map((b) => b.map(c)),
    notes: f.notes.map((n) => ({ line: n.line, commit: n.commit.short })),
    ownership: f.ownership && {
      total: f.ownership.total,
      topAuthors: f.ownership.topAuthors,
      topCommits: f.ownership.topCommits.map((x) => ({ commit: c(x.commit), lines: x.lines, share: x.share })),
    },
  };
}
