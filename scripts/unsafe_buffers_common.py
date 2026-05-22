#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Common utility functions for counting unsafe buffer usage lines.
"""

import os
import sys
import subprocess
import re

# File extensions to consider for scanning.
SOURCE_EXTENSIONS = {'.c', '.cc', '.cpp', '.h', '.hh', '.hpp'}

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
    except IOError as e:
        print(f"Warning: Could not read config file {config_path}: {e}", file=sys.stderr)
    return sorted(included_prefixes, key=len, reverse=True), \
           sorted(excluded_prefixes, key=len, reverse=True)

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

    if exclude_len > include_len:
        return False
    return True

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
        except IOError:
            return 0

    # Remove multi-line comments /* ... */
    content = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)

    count = 0
    for line in content.splitlines():
        # Remove single-line comments that follow code
        line = line.split('//', 1)[0]
        line = line.strip()

        # If anything is left and it's not a preprocessor macro, it's code.
        if line and not line.startswith('#'):
            count += 1
    return count

def get_git_files():
    """
    Retrieves a list of all C++ source files tracked by git.
    """
    try:
        result = subprocess.run(['git', 'ls-files'],
                                capture_output=True,
                                text=True,
                                check=True,
                                encoding='utf-8')
        return result.stdout.splitlines()
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print("Error: Failed to run 'git ls-files'.", file=sys.stderr)
        sys.exit(1)

def has_allow_unsafe_buffers_pragma(content):
    """
    Checks if the content contains the allow_unsafe_buffers pragma.
    Supports optional spaces, e.g., '#   pragma allow_unsafe_buffers'
    """
    return bool(re.search(r'#\s*pragma\s+allow_unsafe_buffers', content))
