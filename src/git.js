// Thin, read-only wrapper around the git CLI. Every command here is a read:
// log, blame, show, rev-parse, ls-files, remote. Nothing writes to the repo.
//
// The repository being read is untrusted input. A `.git/config` that arrives
// in a zip, a tarball or a shared drive can name programs for git to run
// (core.fsmonitor, core.hooksPath, diff.external, textconv drivers, pagers,
// ssh and credential helpers). Every invocation below neutralises those
// settings on the command line and scrubs GIT_* from the environment, so the
// only thing this tool ever executes is `git` itself.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// A directory that does not exist: git finds no hooks there. Lives next to
// this file, so the scanned repository cannot create it.
const NO_HOOKS = join(dirname(fileURLToPath(import.meta.url)), "no-hooks");

// `-c` overrides beat anything in the repository's own .git/config.
const SAFE_CONFIG = [
  ["core.quotepath", "off"],
  ["log.showSignature", "false"],
  ["color.ui", "never"],
  ["core.pager", "cat"],
  ["core.fsmonitor", "false"],
  ["core.hooksPath", NO_HOOKS],
  ["diff.external", ""],
  ["core.sshCommand", ""],
  ["core.gitProxy", ""],
  ["core.askPass", ""],
  ["credential.helper", ""],
  ["protocol.allow", "never"],
  ["gpg.program", ""],
].flatMap(([k, v]) => ["-c", `${k}=${v}`]);

/** Child environment: the user's PATH and locale, none of the GIT_* knobs. */
export function safeEnv(base = process.env) {
  const env = {};
  for (const [k, v] of Object.entries(base)) if (!/^GIT_/i.test(k)) env[k] = v;
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_OPTIONAL_LOCKS = "0";
  return env;
}

export class GitError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.name = "GitError";
    this.code = code;
  }
}

export function git(cwd, args, { allowFail = false } = {}) {
  const r = spawnSync("git", [...SAFE_CONFIG, ...args], {
    cwd,
    env: safeEnv(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.error) {
    if (r.error.code === "ENOENT") throw new GitError("git is not installed or not on PATH.", 2);
    throw new GitError(r.error.message, 2);
  }
  if (r.status !== 0 && !allowFail) throw new GitError((r.stderr || "git failed").trim(), 1);
  return r.stdout;
}

export function repoRoot(cwd) {
  const out = git(cwd, ["rev-parse", "--show-toplevel"], { allowFail: true }).trim();
  if (!out) throw new GitError(`Not inside a git repository: ${cwd}`, 1);
  return out;
}

/** Web base URL for the origin remote on GitHub/GitLab/Bitbucket, or null. */
export function remoteWebUrl(cwd) {
  const url = git(cwd, ["remote", "get-url", "origin"], { allowFail: true }).trim();
  if (!url) return null;
  const m = url.match(/(?:[@/])(github\.com|gitlab\.com|bitbucket\.org)[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
  if (!m) return null;
  return `https://${m[1].toLowerCase()}/${m[2]}/${m[3]}`;
}

// Unit/record separators keep multi-line bodies unambiguous.
const US = "\u001f";
const RS = "\u001e";
const FORMAT = ["%H", "%h", "%an", "%aI", "%P", "%s", "%b"].join(US) + RS;

/**
 * Commits touching `file` (following renames), newest first.
 * Each: { hash, short, author, date, parents[], subject, body, files[] }
 * `files` lists every path changed in that commit, for co-change analysis.
 */
export function fileLog(cwd, file, { max = 200, since = null } = {}) {
  const args = ["log", `--max-count=${max}`, "--follow"];
  if (since) args.push(`--since=${since}`);
  const commits = parseLog(git(cwd, ["log", ...args.slice(1), `--format=${FORMAT}`, "--", file], { allowFail: true }));
  if (!commits.length) return commits;
  // A pathspec limits --name-status to the followed file, so list every
  // changed path in a second pass over exactly these commits.
  const status = git(cwd, ["log", "--no-walk=unsorted", "--name-status", "--format=%x01%H", ...commits.map((c) => c.hash)], { allowFail: true });
  const byHash = new Map();
  for (const chunk of status.split("\u0001")) {
    const lines = chunk.split("\n").map((s) => s.trimEnd()).filter(Boolean);
    if (!lines.length) continue;
    const files = [];
    const renames = [];
    for (const l of lines.slice(1)) {
      const parts = l.split("\t");
      const code = parts[0];
      if (/^R/.test(code) && parts.length >= 3) {
        renames.push({ from: parts[1], to: parts[2] });
        files.push(parts[2]);
      } else if (parts[1]) files.push(parts[parts.length - 1]);
    }
    byHash.set(lines[0], { files, renames });
  }
  for (const c of commits) {
    const e = byHash.get(c.hash) ?? { files: [], renames: [] };
    c.files = e.files;
    c.renames = e.renames;
  }
  return commits;
}

/** Commits that touched a line range, via `git log -L`. git forbids --follow with -L. */
export function rangeLog(cwd, file, start, end, { max = 50 } = {}) {
  const out = git(cwd, ["log", `--max-count=${max}`, "--no-patch", `-L${start},${end}:${file}`, `--format=${FORMAT}`], {
    allowFail: true,
  });
  return parseLog(out).map((c) => ({ ...c, files: [], renames: [] }));
}

function parseLog(out) {
  const commits = [];
  for (const chunk of out.split(RS)) {
    const text = chunk.replace(/^\s+/, "");
    if (!text) continue;
    const [hash, short, author, date, parents, subject, body = ""] = text.split(US);
    if (!/^[0-9a-f]{40}$/.test(hash)) continue;
    commits.push({
      hash,
      short,
      author,
      date,
      parents: parents ? parents.split(" ").filter(Boolean) : [],
      subject: subject ?? "",
      body: body.trim(),
      files: [],
      renames: [],
    });
  }
  return commits;
}

/** Blame summary: how many current lines each commit and each author owns. */
export function blame(cwd, file, { start = null, end = null } = {}) {
  const args = ["blame", "--line-porcelain", "--no-textconv"];
  if (start != null) args.push("-L", `${start},${end ?? start}`);
  args.push("--", file);
  const out = git(cwd, args, { allowFail: true });
  const byCommit = new Map();
  const byAuthor = new Map();
  let total = 0;
  let current = null;
  for (const line of out.split("\n")) {
    const head = line.match(/^([0-9a-f]{40}) \d+ \d+(?: \d+)?$/);
    if (head) {
      current = head[1];
      total += 1;
      byCommit.set(current, (byCommit.get(current) ?? 0) + 1);
    } else if (current && line.startsWith("author ")) {
      const a = line.slice(7);
      byAuthor.set(a, (byAuthor.get(a) ?? 0) + 1);
    }
  }
  return { total, byCommit, byAuthor };
}

export function isTracked(cwd, file) {
  return git(cwd, ["ls-files", "--error-unmatch", "--", file], { allowFail: true }).trim().length > 0;
}

export function lineCount(cwd, file) {
  const out = git(cwd, ["show", `HEAD:${file}`], { allowFail: true });
  if (!out) return null;
  return out.split("\n").length - (out.endsWith("\n") ? 1 : 0);
}
