#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Counts the number of lines not covered by the -Wunsafe-buffer-usage
warning in the Dawn & Tint codebases, accounting for both GN and CMake builds.

Logic for determining if a line is "uncovered":

1.  A file is considered "covered" by the warning if:
    a. GN enforcement is active (unsafe_buffers_paths.txt exists in root) AND
       the file path is included in the GN path rules.
    b. OR CMake enforcement is active (Tint CMake lists have the flag enabled) AND
       the file resides under `src/tint/`.

2.  If a file is NOT covered in either GN or CMake, 100% of its code lines are
    considered uncovered.

3.  If a file is covered in at least one build:
    a. If the file contains "#pragma allow_unsafe_buffers" (GN opt-out) OR
       "TINT_BEGIN_DISABLE_WARNING(UNSAFE_BUFFER_USAGE)" (CMake opt-out),
       100% of its code lines are considered uncovered.
    b. Otherwise, only lines containing target inline safety macros (like
       "UNSAFE_TODO" or "DAWN_UNSAFE_BUFFERS") are counted as uncovered.
"""

import os
import sys
import subprocess
import re
import argparse

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

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default="dawn", help="The name or directory of the repository")
    parser.add_argument("--summary", action="store_true", help="Print only summary metrics")
    args = parser.parse_args()

    # 1. Detect GN coverage config (isolated for non-chromium repos)
    active_config_path = None
    if args.repo == "chromium":
        if os.path.exists("build/config/unsafe_buffers_paths.txt"):
            active_config_path = "build/config/unsafe_buffers_paths.txt"
    else:
        # Dawn, Skia, Angle, etc. use root config if it exists
        if os.path.exists("unsafe_buffers_paths.txt"):
            active_config_path = "unsafe_buffers_paths.txt"

    gn_config_exists = active_config_path is not None
    gn_included_prefixes, gn_excluded_prefixes = [], []

    if gn_config_exists:
        gn_included_prefixes, gn_excluded_prefixes = parse_config(active_config_path)

    # 2. Detect Tint CMake coverage (looks for compiler options in Tint cmake lists)
    tint_cmake_enforced = False
    tint_cmake_path = "src/tint/CMakeLists.txt"
    if os.path.exists(tint_cmake_path):
        try:
            with open(tint_cmake_path, 'r', encoding='utf-8', errors='ignore') as f:
                cmake_content = f.read()
            for line in cmake_content.splitlines():
                line = line.strip()
                if line.startswith("#"):
                    continue
                if "-Wunsafe-buffer-usage" in line and "-Wno-unsafe-buffer-usage" not in line:
                    tint_cmake_enforced = True
                    break
        except IOError:
            pass

    all_files = get_git_files()

    # Target macros we want to count as "opted-out / uncovered" lines
    if args.repo == "dawn":
        macros_to_check = [
            "TINT_DISABLE_WARNING_UNSAFE_BUFFER_USAGE",
            "TINT_DISABLE_WARNING_UNSAFE_BUFFER_USAGE_IN_CONTAINER",
            "DAWN_UNSAFE_TODO",
            "DAWN_UNSAFE_BUFFERS",
            "UNSAFE_TODO"
        ]
    else:
        macros_to_check = ["UNSAFE_TODO"]

    total_code_lines = 0
    total_uncovered_lines = 0

    for relative_path in all_files:
        if relative_path.startswith('tools/'):
            continue

        _, extension = os.path.splitext(relative_path)
        if extension not in SOURCE_EXTENSIONS:
            continue

        full_path = relative_path

        if os.path.exists(full_path):
            file_code_lines = count_code_lines(file_path=full_path)
            total_code_lines += file_code_lines
        else:
            continue

        # Determine if file is covered by GN or CMake
        path_is_covered_in_gn = False
        if gn_config_exists:
            path_is_covered_in_gn = is_path_covered(relative_path, gn_included_prefixes, gn_excluded_prefixes)

        path_is_covered_in_cmake = False
        if tint_cmake_enforced and relative_path.startswith("src/tint/"):
            path_is_covered_in_cmake = True

        file_is_covered = path_is_covered_in_gn or path_is_covered_in_cmake

        uncovered_lines = 0

        if not file_is_covered:
            # Rule 2: Not covered in either GN or CMake means 100% uncovered
            uncovered_lines = file_code_lines
        else:
            try:
                with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()

                # Rule 3a: Check for file-level opt-outs (GN pragma or Tint CMake macro)
                has_gn_pragma = "#pragma allow_unsafe_buffers" in content
                has_tint_macro = "TINT_BEGIN_DISABLE_WARNING(UNSAFE_BUFFER_USAGE)" in content

                if has_gn_pragma or has_tint_macro:
                    uncovered_lines = file_code_lines
                else:
                    # Rule 3b: Count targeted inline safety macros
                    lines = content.splitlines()
                    for line in lines:
                        if any(macro in line for macro in macros_to_check):
                            uncovered_lines += 1
            except IOError as e:
                print(f"Warning: Could not read file {full_path}: {e}", file=sys.stderr)
                continue

        total_uncovered_lines += uncovered_lines

        if uncovered_lines > 0 and not args.summary:
            print(f"{relative_path}:{uncovered_lines}")

    if args.summary:
        covered_lines = total_code_lines - total_uncovered_lines
        ratio = covered_lines / total_code_lines if total_code_lines > 0 else 0
        print(f"TOTAL_CODE_LINES:{total_code_lines}")
        print(f"UNCOVERED_LINES:{total_uncovered_lines}")
        print(f"COVERED_LINES:{covered_lines}")
        print(f"COVERAGE_RATIO:{ratio:.4f}")

if __name__ == '__main__':
    main()
