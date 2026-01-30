#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Counts the number of commits per file during the 30 days prior to the current checkout (HEAD).
Safe for blobless clones (disables rename detection to prevent lazy fetching).
Filters out bots and automated patches.
"""

import sys
import subprocess
import collections
import os

# Ported from the provided JavaScript
BOT_PATTERNS = [
    '+robot',
    '-bot',
    'autoroll',
    'buildbot',
    'chrome-',
    'commit-queue',
    'github-actions',
    'gserviceaccount',
    'mdb.',
    'rebaseline',
    'release',
    'roller',
    'wptsync',
    'none@none',
    'css21testsuite',
    'dependabot',
]

def is_email_valid(email):
    """
    Returns True if the email belongs to a human (not a known bot pattern),
    and is a valid-looking email structure.
    """
    if any(pattern in email for pattern in BOT_PATTERNS):
        return False
    if '@' not in email:
        return False
    return True

def get_head_timestamp(env):
    """Gets the Unix timestamp of the current HEAD commit."""
    try:
        # %ct = committer date, UNIX timestamp
        cmd = ["git", "show", "-s", "--format=%ct", "HEAD"]
        result = subprocess.run(
            cmd, capture_output=True, text=True, check=True, env=env
        )
        return int(result.stdout.strip())
    except (subprocess.CalledProcessError, ValueError) as e:
        print(f"Error getting HEAD timestamp: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    # Setup safe environment
    env = os.environ.copy()
    env["GIT_NO_LAZY_FETCH"] = "1"

    # 1. Determine the time window relative to HEAD
    head_ts = get_head_timestamp(env)
    seconds_in_30_days = 30 * 24 * 60 * 60
    since_ts = head_ts - seconds_in_30_days

    # 2. Prepare git log command
    # We add a distinct marker ">>>COMMIT:" followed by the email (%ae)
    delimiter = ">>>COMMIT:"

    cmd = [
        "git",
        "log",
        f"--since={since_ts}",  # Absolute timestamp calculated above
        "--name-only",
        "--no-renames",         # Critical for blobless clones
        f"--pretty=format:{delimiter}%ae",
        "."
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=True,
            encoding='utf-8',
            errors='replace',
            env=env
        )
    except subprocess.CalledProcessError as e:
        print(f"Error running git log: {e}", file=sys.stderr)
        if "lazy fetch" in str(e.stderr) or e.returncode == 128:
            print("Note: Operation failed because it attempted to fetch data.", file=sys.stderr)
        return

    file_counts = collections.defaultdict(int)
    current_commit_is_valid = False

    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue

        if line.startswith(delimiter):
            email = line.split(delimiter, 1)[1]
            current_commit_is_valid = is_email_valid(email)
        else:
            if current_commit_is_valid:
                file_counts[line] += 1

    for filename, count in sorted(file_counts.items(), key=lambda x: x[1], reverse=True):

        # Filter out non C++ files or objective-C files
        if not (filename.endswith('.cpp') or filename.endswith('.cc') or
                filename.endswith('.cxx') or filename.endswith('.h') or
                filename.endswith('.hpp') or filename.endswith('.m') or
                filename.endswith('.mm')):
            continue

        print(f"{filename}:{count}")

if __name__ == "__main__":
    main()
