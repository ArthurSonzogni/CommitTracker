import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { IsEmailValid } from "../importer/is_email_valid.mjs";
import { ParseReviewers, ParsePhabricatorReviewers } from "../importer/parse_reviewers.mjs";
import {
  COMMIT_FLAGS,
  stripCommitFooters,
  parseCommitMessage,
} from "../importer/parse_commit_message.mjs";

describe("IsEmailValid", () => {
  it("accepts regular contributor emails", () => {
    assert.equal(IsEmailValid("arthursonzogni@chromium.org"), true);
    assert.equal(IsEmailValid("dev@example.com"), true);
  });

  it("rejects bots and malformed addresses", () => {
    assert.equal(IsEmailValid("chromium-autoroll@skia-public.iam.gserviceaccount.com"), false);
    assert.equal(IsEmailValid("dependabot[bot]@users.noreply.github.com"), false);
    assert.equal(IsEmailValid("commit-queue@chromium.org"), false);
    assert.equal(IsEmailValid("no-at-sign"), false);
  });
});

describe("ParseReviewers", () => {
  it("extracts valid Reviewed-by emails and skips bots", () => {
    const msg = [
      "Fix navigation race",
      "",
      "Reviewed-by: Alice <alice@chromium.org>",
      "Reviewed-by: Roller <chromium-autoroll@chromium.org>",
      "Reviewed-by: Missing Brackets",
      "Reviewed-by: Bob <bob@example.com>",
    ].join("\n");

    const reviewers = ParseReviewers(msg);
    assert.deepEqual(reviewers, ["alice@chromium.org", "bob@example.com"]);
  });

  it("parses Phabricator Reviewed By handles and skips project tags", () => {
    const msg = [
      "[libc] Optimize memcpy",
      "",
      "Reviewed By: #libc, alice, @Bob-Dev",
    ].join("\n");

    const reviewers = ParsePhabricatorReviewers(msg);
    assert.deepEqual(reviewers, [
      "alice@users.noreply.github.com",
      "bob-dev@users.noreply.github.com",
    ]);
  });
});

describe("parseCommitMessage & stripCommitFooters", () => {
  it("strips trailing Gerrit/Git trailers while keeping prose", () => {
    const msg = [
      "Improve widget layout",
      "",
      "Ensure the sidebar aligns cleanly on narrow viewports.",
      "",
      "Fixed: 40123456",
      "Change-Id: I1234567890abcdef",
      "Reviewed-on: https://chromium-review.googlesource.com/c/chromium/src/+/123",
      "Reviewed-by: Alice <alice@chromium.org>",
      "Cr-Commit-Position: refs/heads/main@{#123456}",
    ].join("\n");

    assert.equal(
      stripCommitFooters(msg),
      "Improve widget layout\n\nEnsure the sidebar aligns cleanly on narrow viewports.",
    );

    const parsed = parseCommitMessage(msg);
    assert.equal(parsed.bug, 40123456);
    assert.ok(parsed.flags & COMMIT_FLAGS.FIX);
    assert.equal(parsed.flags & COMMIT_FLAGS.REVERT, 0);
  });

  it("detects reverts, relands, rolls, AI attribution, and human co-authors", () => {
    const revertMsg = [
      'Revert "Add feature X"',
      "",
      "This reverts commit 1234567890abcdef.",
      "",
      "No-Try: true",
      "Owners-Override: lead@chromium.org",
      "Co-authored-by: Claude <noreply@anthropic.com>",
      "Co-authored-by: Jane Doe <jane@chromium.org>",
    ].join("\n");

    const parsed = parseCommitMessage(revertMsg);
    assert.ok(parsed.flags & COMMIT_FLAGS.REVERT);
    assert.ok(parsed.flags & COMMIT_FLAGS.NO_TRY);
    assert.ok(parsed.flags & COMMIT_FLAGS.OWNERS_OVERRIDE);
    assert.ok(parsed.flags & COMMIT_FLAGS.AI);
    assert.ok(parsed.flags & COMMIT_FLAGS.CO_AUTHORED);
    assert.equal(parsed.bug, null);

    const reland = parseCommitMessage('Reland "Bug 1890123 - Fix paint"');
    assert.ok(reland.flags & COMMIT_FLAGS.RELAND);
    assert.equal(reland.bug, 1890123);

    const roll = parseCommitMessage("Roll Skia from abc to def");
    assert.ok(roll.flags & COMMIT_FLAGS.ROLL);
  });

  it("ignores Linux-style commit-hash Fixes trailers when extracting bug numbers", () => {
    const msg = "net: fix null deref\n\nFixes: deadbeef1234 (\"net: add thing\")\nCloses #4242";
    const parsed = parseCommitMessage(msg);
    assert.equal(parsed.bug, 4242);
    assert.ok(parsed.flags & COMMIT_FLAGS.FIX);
  });
});
