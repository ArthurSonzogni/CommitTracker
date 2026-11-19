// Parses commit messages to extract description length (without trailing
// footers/trailers), a compact bitmask of commit flags, and the primary
// numeric bug ID. Shared between the GraphQL importer (fetch_data.mjs) and
// the local git backfill (backfill_message_meta.mjs).

export const COMMIT_FLAGS = {
  AI:              1 << 0,  // LLM attribution (Co-authored-by / Assisted-by / Generated-by)
  REVERT:          1 << 1,  // Revert / Back out
  RELAND:          1 << 2,  // Reland
  ROLL:            1 << 3,  // Human-authored Roll / Update DEPS (bots already filtered)
  FIX:             1 << 4,  // Explicitly closes a bug (Fixed: / Fixes # / Closes #)
  NO_TRY:          1 << 5,  // No-Try: true / NOTRY=true
  NO_PRESUBMIT:    1 << 6,  // No-Presubmit: true / NOPRESUBMIT=true
  NO_TREE_CHECKS:  1 << 7,  // No-Tree-Checks: true
  OWNERS_OVERRIDE: 1 << 8,  // Owners-Override:
  BYPASS:          1 << 9,  // Bypass-* / Low-Coverage-Reason: / Skip-*
  BOT_COMMIT:      1 << 10, // Bot-Commit: (rubber-stamper / mechanical)
  CO_AUTHORED:     1 << 11, // Human Co-authored-by:
};

// Known trailer prefixes that can appear even without a separating blank line.
const KNOWN_TRAILER_RE = /^(?:Change-Id|Reviewed-on|Reviewed-by|Reviewed By|Commit-Queue|Cr-Commit-Position|Cr-Branched-From|Cr-Original-[A-Za-z0-9-]+|CrOS-[A-Za-z0-9-]+|Bug|Fixed|Fixes|Closes|Resolves|Co-authored-by|Signed-off-by|Acked-by|Tested-by|Reported-by|Suggested-by|Differential Revision|Canonical link|Pull Request|git-svn-id|Auto-Submit|Bot-Commit|No-Try|No-Presubmit|No-Tree-Checks|Owners-Override|Merge-Approval-Bypass|Cq-[A-Za-z0-9-]+|Bypass-[A-Za-z0-9-]+|Low-Coverage-Reason|Skip-[A-Za-z0-9-]+|Include-Ci-Only-Tests|Disable-Rts|Validate-Test-Flakiness|Binary-Size|Fuchsia-Binary-Size|Compile-Size|DanglingUntriaged-notes|AX-Relnotes|Agent-Generated|Claude-Session|AI-Model|AI-Assisted(?:-By)?|Assisted[- ]by\s*|Assisted with|Generated[- ]by|Copilot-Session|Submodule-Gn-Analyze|Override-Tryjobs-For-Automation|Tbr|Original-Reviewed-on|Original-Reviewed-by|Original-Commit-Queue|Original-Cr-Commit-Position|Original-Bug|Original-Change-Id):/i;

const LEGACY_FOOTER_RE = /^(?:BUG|FIXED|R|TBR|TEST|NOTRY|NO_TRY|NOPRESUBMIT|NO_PRESUBMIT|CQ_INCLUDE_TRYBOTS|CQ_EXTRA_TRYBOTS|COMMIT|LANDING|TAG|CONV|NO_IFTTT|NOAUTOREVERT|OBSOLETE_HISTOGRAMS?)=/i;

const GENERIC_TRAILER_RE = /^[A-Za-z][A-Za-z0-9_-]{1,35}:\s/;

const SPECIAL_FOOTER_RE = /^(?:-{5,}|\(cherry picked from commit [0-9a-f]+\))$/;

const isStrictFooterLine = (line) =>
  KNOWN_TRAILER_RE.test(line) ||
  LEGACY_FOOTER_RE.test(line) ||
  SPECIAL_FOOTER_RE.test(line);

const isFooterParagraph = (lines, start, end) => {
  let hasFooter = false;
  for (let i = start; i <= end; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    if (isStrictFooterLine(line) || GENERIC_TRAILER_RE.test(line)) {
      hasFooter = true;
    } else if (/^\s+/.test(line) && hasFooter) {
      // Indented continuation of a multi-line trailer.
    } else {
      return false;
    }
  }
  return hasFooter;
};

// Strips trailing trailer/footer blocks while always preserving the headline.
export const stripCommitFooters = (message) => {
  if (!message) return '';
  const lines = message.replace(/\r\n/g, '\n').split('\n');
  let end = lines.length - 1;

  // Trim trailing blank lines.
  while (end > 0 && lines[end].trim() === '') end--;

  // Peel whole trailing paragraphs made solely of trailers/footers.
  while (end > 0) {
    let paraStart = end;
    while (paraStart > 1 && lines[paraStart - 1].trim() !== '') paraStart--;
    // Never treat the headline (line 0) as a footer paragraph.
    if (paraStart > 0 && isFooterParagraph(lines, paraStart, end)) {
      end = paraStart - 1;
      while (end > 0 && lines[end].trim() === '') end--;
    } else {
      break;
    }
  }

  // Peel strict known trailers attached directly to the end of the last prose paragraph.
  while (end > 0) {
    const line = lines[end];
    if (line.trim() === '' || isStrictFooterLine(line)) {
      end--;
    } else {
      break;
    }
  }

  return lines.slice(0, end + 1).join('\n').trim();
};

const AI_COAUTHOR_RE = /\b(?:claude|anthropic|copilot|gemini|codex|cursor|chatgpt|openai|aider|cline|windsurf|devin|jules|sweep|qwen|deepseek|llama|mistral|ai|llm)\b|noreply@(?:anthropic|openai|pi)\.com|noreply@pi\.dev|gemini@google\.com/i;

const AI_TRAILER_RE = /^(?:(?:Assisted[- ]by\s*|Assisted with|Generated[- ]by|AI-Assisted(?:-By)?|AI-Model|Copilot-Session|Claude-Session):|Agent-Generated:\s*true\b|TAG=agy\b|CONV=[0-9a-f-]{8,}\b|Assisted by\s+(?:Claude|Copilot|GitHub Copilot|Gemini|ChatGPT|OpenAI|Codex|Cursor|AI)\b)/im;

const parseBugNumber = (raw) => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || /^(?:none|n\/a|na|null|0)\b/i.test(trimmed)) return null;
  // Match forms like: 448661443, chromium:579016483, b:575939917, b/123456,
  // crbug.com/123456, issues.chromium.org/issues/123456, detail?id=123456, #12345
  const m = trimmed.match(/(?:^|[\s,:(/=;#])(\d{3,11})(?:\b|$)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

const extractPrimaryBug = (headline, text) => {
  // 1. Explicit Bug / Fixed / Fixes / Closes / Resolves / BUG= trailers (line-anchored).
  // Skip Linux-style "Fixes: <git-sha> (...)" which reference a commit, not a bug.
  const trailerRe = /^(?:Bug|Fixed|Fixes|Closes|Resolves|BUG|FIXED)\s*[:=]\s*(.+)$/gim;
  let match;
  while ((match = trailerRe.exec(text)) !== null) {
    if (/^[0-9a-f]{7,40}(?:\s|$)/i.test(match[1].trim())) continue;
    const n = parseBugNumber(match[1]);
    if (n !== null) return n;
  }

  // 2. Firefox / Bugzilla headline: "Bug 2058039 - ..." or 'Revert "Bug 2058039 ...'
  const ff = headline.match(/^(?:(?:Revert|Reland|Back(?:ed)? out)\s+["']?)?Bug\s+(\d{4,10})\b/i);
  if (ff) return Number(ff[1]);

  // 3. Bugzilla / GitHub issue URLs.
  const bz = text.match(/show_bug\.cgi\?id=(\d{3,10})\b/);
  if (bz) return Number(bz[1]);

  const ghUrl = text.match(/https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/(\d{1,10})\b/i);
  if (ghUrl) return Number(ghUrl[1]);

  // 4. GitHub issue closing keywords (LLVM / Carbon / Servo / Ladybird / WPT).
  const gh = text.match(/\b(?:Fixes|Fixed|Closes|Closed|Resolves|Resolved)\s+#(\d{2,10})\b/i);
  if (gh) return Number(gh[1]);

  return null;
};

export const parseCommitMessage = (message) => {
  const normalized = (message || '').replace(/\r\n/g, '\n');
  const firstNl = normalized.indexOf('\n');
  const headline = (firstNl === -1 ? normalized : normalized.slice(0, firstNl)).trim();
  const body = firstNl === -1 ? '' : normalized.slice(firstNl + 1);

  const stripped = stripCommitFooters(normalized);
  const msg = stripped.length;

  let flags = 0;

  if (/^(?:Revert\b|Back(?:ed)? out\b)/i.test(headline) ||
      /^This reverts commit [0-9a-f]{7,40}\b/m.test(body)) {
    flags |= COMMIT_FLAGS.REVERT;
  }
  if (/^Reland\b/i.test(headline)) {
    flags |= COMMIT_FLAGS.RELAND;
  }
  if (/^(?:\[[^\]]+\]\s*)?(?:Roll\s|Auto-?roll\b|Manual roll\b|Update DEPS\b)/i.test(headline)) {
    flags |= COMMIT_FLAGS.ROLL;
  }

  // Co-authored-by and AI attribution.
  const coAuthorRe = /^Co-authored-by:\s*(.+)$/gim;
  let m;
  let hasAi = AI_TRAILER_RE.test(normalized);
  let hasHumanCoAuthor = false;
  while ((m = coAuthorRe.exec(normalized)) !== null) {
    if (AI_COAUTHOR_RE.test(m[1])) {
      hasAi = true;
    } else if (m[1].trim()) {
      hasHumanCoAuthor = true;
    }
  }
  if (hasAi) flags |= COMMIT_FLAGS.AI;
  if (hasHumanCoAuthor) flags |= COMMIT_FLAGS.CO_AUTHORED;

  const bug = extractPrimaryBug(headline, normalized);

  if (bug !== null && (
      /^(?:Fixed|Fixes|Closes|Resolves)\s*[:=]\s*(?!none\b|0\b|n\/a\b|[0-9a-f]{7,40}(?:\s|$))\S/im.test(normalized) ||
      /\b(?:Fixes|Fixed|Closes|Closed|Resolves|Resolved)\s+(?:#|https?:\/\/\S+\/issues\/|crbug\.com\/|b\/)\d+/i.test(normalized))) {
    flags |= COMMIT_FLAGS.FIX;
  }

  if (/^(?:No-Try:\s*true|NOTRY=true)\b/im.test(normalized)) {
    flags |= COMMIT_FLAGS.NO_TRY;
  }
  if (/^(?:No-Presubmit:\s*true|NOPRESUBMIT=true)\b/im.test(normalized)) {
    flags |= COMMIT_FLAGS.NO_PRESUBMIT;
  }
  if (/^No-Tree-Checks:\s*true\b/im.test(normalized)) {
    flags |= COMMIT_FLAGS.NO_TREE_CHECKS;
  }
  if (/^Owners-Override:/im.test(normalized)) {
    flags |= COMMIT_FLAGS.OWNERS_OVERRIDE;
  }
  if (/^(?:Bypass-[A-Za-z0-9-]+:|Low-Coverage-Reason:|Skip-[A-Za-z0-9-]+:)/im.test(normalized)) {
    flags |= COMMIT_FLAGS.BYPASS;
  }
  if (/^Bot-Commit:/im.test(normalized)) {
    flags |= COMMIT_FLAGS.BOT_COMMIT;
  }

  return { msg, flags, bug };
};
