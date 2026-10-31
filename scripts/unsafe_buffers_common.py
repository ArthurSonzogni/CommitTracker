#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Common utility functions for counting C++ code lines and unsafe buffer usage.
"""

import re
import subprocess
import sys

# File extensions to consider for scanning.
SOURCE_EXTENSIONS = {'.c', '.cc', '.cpp', '.h', '.hh', '.hpp'}

_BLOCK_COMMENT_RE = re.compile(r'/\*.*?\*/', re.DOTALL)
_ALLOW_UNSAFE_PRAGMA_RE = re.compile(r'#\s*pragma\s+allow_unsafe_buffers')


def parse_config(config_path):
    """
    Parses the unsafe_buffers_paths.txt file into include and exclude lists.
    """
    included_prefixes = []
    excluded_prefixes = []
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if line.startswith('+'):
                    included_prefixes.append(line[1:])
                elif line.startswith('-'):
                    excluded_prefixes.append(line[1:])
    except OSError as e:
        print(f"Warning: Could not read config file {config_path}: {e}", file=sys.stderr)
    return (
        sorted(included_prefixes, key=len, reverse=True),
        sorted(excluded_prefixes, key=len, reverse=True),
    )


def get_best_match(path, prefixes):
    """
    Finds the longest prefix from a list that matches the given path.
    """
    for prefix in prefixes:
        if path.startswith(prefix):
            return prefix
    return None


def is_path_covered(path, included_prefixes, excluded_prefixes):
    """
    Determines if a file path is covered based on include/exclude rules.
    """
    best_include = get_best_match(path, included_prefixes)
    best_exclude = get_best_match(path, excluded_prefixes)

    include_len = len(best_include) if best_include else 0
    exclude_len = len(best_exclude) if best_exclude else 0

    return exclude_len <= include_len


def iter_code_lines(content):
    """
    Yields non-blank, non-comment, non-preprocessor lines from C++ source text.
    """
    cleaned = _BLOCK_COMMENT_RE.sub('', content)
    for line in cleaned.splitlines():
        line = line.split('//', 1)[0].strip()
        if line and not line.startswith('#'):
            yield line


def count_code_lines(file_path=None, content=None):
    """
    Counts non-blank, non-comment, and non-macro lines in a C++ source file.
    """
    if content is None:
        if file_path is None:
            return 0
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except OSError:
            return 0

    return sum(1 for _ in iter_code_lines(content))


def get_git_files():
    """
    Retrieves a list of all tracked files in the current git checkout.
    """
    try:
        result = subprocess.run(
            ['git', 'ls-files'],
            capture_output=True,
            text=True,
            check=True,
            encoding='utf-8',
        )
        return result.stdout.splitlines()
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print(f"Error: Failed to run 'git ls-files': {e}", file=sys.stderr)
        sys.exit(1)


def has_allow_unsafe_buffers_pragma(content):
    """
    Checks if the content contains '#pragma allow_unsafe_buffers'.
    """
    return bool(_ALLOW_UNSAFE_PRAGMA_RE.search(content))
