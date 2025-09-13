#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Counts the number of lines not covered by the -Wunsafe-buffer-usage
warning in the Chromium codebase.

This script should be run from the root of the Chromium checkout (e.g., the
'src' directory).

The logic for determining if a line is "uncovered" is as follows:

1.  If `build/config/unsafe_buffers_paths.txt` does not exist, all lines in all
    source files are considered uncovered.

2.  If the config file exists, a file's path is checked against the include (+)
    and exclude (-) rules. The most specific (longest) path prefix wins. If a
    file's path is excluded, all of its lines are uncovered. By default, paths
    are included.

3.  For files on covered paths:
    a. If the file contains the string "#pragma allow_unsafe_buffers", all of
       its lines are considered uncovered.
    b. Otherwise, only lines containing the string "UNSAFE_TODO" are
       considered uncovered.
"""

import os
import sys
import subprocess
import re

# The location of the configuration file, relative to the script's execution path.
CONFIG_FILE_PATH = "build/config/unsafe_buffers_paths.txt"

# File extensions to consider for scanning.
SOURCE_EXTENSIONS = {'.c', '.cc', '.cpp', '.h', '.hh', '.hpp'}

def parse_config(config_path):
    """
    Parses the unsafe_buffers_paths.txt file into include and exclude lists.

    Args:
        config_path (str): The path to the configuration file.

    Returns:
        tuple: A tuple containing two lists: (included_prefixes, excluded_prefixes).
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

    Args:
        path (str): The file path to check.
        prefixes (list): A list of path prefixes.

    Returns:
        str or None: The matching prefix, or None if no match is found.
    """
    for prefix in prefixes:
        if path.startswith(prefix):
            return prefix
    return None

def is_path_covered(path, included_prefixes, excluded_prefixes):
    """
    Determines if a file path is covered based on include/exclude rules.

    The longest matching prefix determines the outcome. By default, all paths
    are considered covered.

    Args:
        path (str): The relative file path.
        included_prefixes (list): A list of included directory prefixes.
        excluded_prefixes (list): A list of excluded directory prefixes.

    Returns:
        bool: True if the path is covered, False otherwise.
    """
    best_include = get_best_match(path, included_prefixes)
    best_exclude = get_best_match(path, excluded_prefixes)

    include_len = len(best_include) if best_include else 0
    exclude_len = len(best_exclude) if best_exclude else 0

    if exclude_len > include_len:
        return False
    # If include_len >= exclude_len, it's covered. This also handles the
    # default case where both are 0.
    return True

def count_code_lines(file_path=None, content=None):
    """
    Counts non-blank, non-comment, and non-macro lines in a C++ source file.
    It can be passed either a file path to read or the content directly.
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
        # Run `git ls-files` to get a list of all tracked files.
        result = subprocess.run(['git', 'ls-files'],
                                capture_output=True,
                                text=True,
                                check=True,
                                encoding='utf-8')
        return result.stdout.splitlines()
    except (subprocess.CalledProcessError, FileNotFoundError) as e:
        print("Error: Failed to run 'git ls-files'. Is git installed and are "
              "you in a git repository?", file=sys.stderr)
        print(f"Details: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    """
    Main function to orchestrate the scanning and counting process.
    """
    if not os.path.isdir('build'):
        print(
            "Error: This script must be run from the root of a Chromium checkout (e.g., 'src/').",
            file=sys.stderr)
        sys.exit(1)

    config_exists = os.path.exists(CONFIG_FILE_PATH)
    included_prefixes, excluded_prefixes = [], []

    if config_exists:
        included_prefixes, excluded_prefixes = parse_config(CONFIG_FILE_PATH)
        if not excluded_prefixes:
            excluded_prefixes = []
            included_prefixes = []
            config_exists = False

    all_files = get_git_files()

    for relative_path in all_files:
        _, extension = os.path.splitext(relative_path)
        if extension not in SOURCE_EXTENSIONS:
            continue

        # In this context, the relative path is also the full path for opening.
        full_path = relative_path

        uncovered_lines = 0

        if not config_exists:
            # Rule 1: No config file means every code line is uncovered.
            uncovered_lines = count_code_lines(file_path=full_path)
        else:
            path_is_covered = is_path_covered(relative_path, included_prefixes, excluded_prefixes)
            if not path_is_covered:
                # Rule 2: Excluded paths have all code lines uncovered.
                uncovered_lines = count_code_lines(file_path=full_path)
            else:
                # Rule 3: Path is covered; inspect file content.
                try:
                    with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()

                    if "#pragma allow_unsafe_buffers" in content:
                        # Rule 3a: Pragma makes all code lines uncovered.
                        uncovered_lines = count_code_lines(content=content)
                    else:
                        # Rule 3b: Count only specific lines.
                        lines = content.splitlines()
                        for line in lines:
                            if "UNSAFE_TODO" in line:
                                uncovered_lines += 1
                except IOError as e:
                    print(f"Warning: Could not read file {full_path}: {e}", file=sys.stderr)
                    continue

        if uncovered_lines > 0:
            print(f"{relative_path}:{uncovered_lines}")

if __name__ == '__main__':
    main()


