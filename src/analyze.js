// Pure: commit list in, facts out. No git here, so this is easy to test.

const REVERT_RE = /^Revert\s+"(.+)"/i;
const REVERTS_HASH_RE = /This reverts commit ([0-9a-f]{7,40})/i;
const ISSUE_RE = /(?:^|[\s(])(?:#|GH-)(\d+)\b/g;
const FIX_RE = /\b(fix|fixes|fixed|bug|regression|hotfix|revert|crash|broke|broken|workaround|incident|rollback|flaky)\b/i;
const CONSTRAINT_RE = /\b(must|never|always|do not|don't|because|otherwise|so that|required|invariant|careful|note:|important|gotcha|subtle)\b/i;

export function analyze(commits, { file, blame = null, lineCount = null, now = new Date() } = {}) {
  const selfPaths = new Set([file, ...renameTrail(commits, file)]);
  const byHash = new Map(commits.map((c) => [c.hash, c]));
  const byShort = new Map(commits.map((c) => [c.short, c]));

  // Reverts: either "This reverts commit X" or Revert "<subject>".
  const reverts = [];
  const revertedHashes = new Set();
  for (const c of commits) {
    const h = c.body.match(REVERTS_HASH_RE)?.[1];
    let target = null;
    if (h) target = byHash.get(h) ?? [...byHash.values()].find((x) => x.hash.startsWith(h)) ?? byShort.get(h) ?? null;
    const s = c.subject.match(REVERT_RE)?.[1];
    if (!target && s) target = commits.find((x) => x !== c && x.subject === s) ?? null;
    if (h || s) {
      reverts.push({ revert: c, target });
      if (target) revertedHashes.add(target.hash);
    }
  }

  // Fix-shaped commits: the places where something went wrong before.
  const fixes = commits.filter((c) => !revertedHashes.has(c.hash) && !REVERT_RE.test(c.subject) && FIX_RE.test(c.subject));

  // Issue/PR references.
  const refs = new Map(); // number -> commits
  for (const c of commits) {
    for (const m of `${c.subject}\n${c.body}`.matchAll(ISSUE_RE)) {
      const n = m[1];
      if (!refs.has(n)) refs.set(n, []);
      refs.get(n).push(c);
    }
  }

  // Co-changed files: what else moves when this file moves.
  const co = new Map();
  let withFiles = 0;
  for (const c of commits) {
    if (!c.files.length) continue;
    withFiles += 1;
    for (const f of c.files) {
      if (selfPaths.has(f)) continue;
      co.set(f, (co.get(f) ?? 0) + 1);
    }
  }
  const coChanged = [...co.entries()]
    .filter(([, n]) => n >= 2 && withFiles >= 3)
    .map(([path, n]) => ({ path, count: n, share: n / withFiles }))
    .filter((x) => x.share >= 0.3)
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, 5);

  // Churn: bursts of activity (3+ commits within 7 days) read as "this was hard".
  const sorted = [...commits].sort((a, b) => new Date(a.date) - new Date(b.date));
  const bursts = [];
  let run = [];
  for (const c of sorted) {
    if (run.length && new Date(c.date) - new Date(run[run.length - 1].date) > 7 * 86400e3) {
      if (run.length >= 3) bursts.push(run);
      run = [];
    }
    run.push(c);
  }
  if (run.length >= 3) bursts.push(run);
  // A burst only matters when it reads as struggle, not normal early development:
  // it contains a fix or revert, or an older file suddenly got 4+ commits in 3 days.
  const ageDaysAll = sorted.length ? (now - new Date(sorted[0].date)) / 86400e3 : 0;
  const isFixy = (c) => FIX_RE.test(c.subject) || REVERT_RE.test(c.subject) || REVERTS_HASH_RE.test(c.body);
  const notableBursts = bursts.filter((b) => {
    if (sorted[0] && b[0].hash === sorted[0].hash) return false; // the initial build-out is not a warning
    const span = (new Date(b[b.length - 1].date) - new Date(b[0].date)) / 86400e3;
    return b.some(isFixy) || (ageDaysAll > 30 && b.length >= 4 && span <= 3);
  });

  // Authors.
  const authorCount = new Map();
  for (const c of commits) authorCount.set(c.author, (authorCount.get(c.author) ?? 0) + 1);
  const authors = [...authorCount.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));

  // Lines worth surfacing from bodies: reasons, constraints, warnings.
  const notes = [];
  for (const c of commits) {
    if (revertedHashes.has(c.hash)) continue;
    for (const raw of unwrap(c.body)) {
      const line = raw.replace(/^[-*>\s]+/, "").trim();
      if (line.length < 20 || line.length > 240 || /[,:;]$/.test(line)) continue;
      if (/^(signed-off-by|co-authored-by|reviewed-by|see-also|refs?:|closes|fixes #|resolves|claude-session|https?:\/\/)/i.test(line)) continue;
      if (CONSTRAINT_RE.test(line)) notes.push({ commit: c, line });
      if (notes.length >= 12) break;
    }
    if (notes.length >= 12) break;
  }

  const first = sorted[0] ?? null;
  const last = sorted[sorted.length - 1] ?? null;
  const ageDays = first ? Math.round((now - new Date(first.date)) / 86400e3) : null;
  const quietDays = last ? Math.round((now - new Date(last.date)) / 86400e3) : null;

  // Blame: who owns the current lines, and how much is from one commit.
  let ownership = null;
  if (blame && blame.total > 0) {
    const topAuthors = [...blame.byAuthor.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, lines]) => ({ name, lines, share: lines / blame.total }));
    const topCommits = [...blame.byCommit.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hash, lines]) => ({ commit: byHash.get(hash) ?? { hash, short: hash.slice(0, 7), subject: "(outside the sampled history)" }, lines, share: lines / blame.total }));
    ownership = { total: blame.total, topAuthors, topCommits };
  }

  return {
    file,
    lineCount,
    commitCount: commits.length,
    allCommits: commits,
    first,
    last,
    ageDays,
    quietDays,
    authors,
    reverts,
    fixes,
    refs: [...refs.entries()].map(([number, cs]) => ({ number, commits: cs })).sort((a, b) => Number(b.number) - Number(a.number)),
    coChanged,
    bursts: notableBursts,
    notes,
    ownership,
  };
}

/** Re-join hard-wrapped paragraphs; list items stay separate. */
export function unwrap(body) {
  const out = [];
  for (const para of body.split(/\n\s*\n/)) {
    let cur = "";
    for (const line of para.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      if (/^([-*•]|\d+[.)])\s/.test(t) || !cur) {
        if (cur) out.push(cur);
        cur = t;
      } else cur += " " + t;
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Paths this file lived at before, newest first, from rename records. */
export function renameTrail(commits, file) {
  const trail = [];
  let current = file;
  for (const c of commits) {
    const r = c.renames?.find((x) => x.to === current);
    if (r) {
      trail.push(r.from);
      current = r.from;
    }
  }
  return trail;
}
