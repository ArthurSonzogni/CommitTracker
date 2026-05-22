#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Counts the number of lines not covered by the -Wunsafe-buffer-usage
warning in the Dawn & Tint codebases, accounting for both GN and CMake builds.
"""

import os
import sys
import re
import argparse
import unsafe_buffers_common as common

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default="dawn", help="The name or directory of the repository")
    parser.add_argument("--summary", action="store_true", help="Print only summary metrics")
    args = parser.parse_args()

    # 1. Detect GN coverage config
    active_config_path = None
    if os.path.exists("unsafe_buffers_paths.txt"):
        active_config_path = "unsafe_buffers_paths.txt"

    gn_config_exists = active_config_path is not None
    gn_included_prefixes, gn_excluded_prefixes = [], []

    if gn_config_exists:
        gn_included_prefixes, gn_excluded_prefixes = common.parse_config(active_config_path)

    # 2. Detect Tint CMake coverage
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

    all_files = common.get_git_files()

    macros_to_check = [
        "TINT_DISABLE_WARNING_UNSAFE_BUFFER_USAGE",
        "TINT_DISABLE_WARNING_UNSAFE_BUFFER_USAGE_IN_CONTAINER",
        "DAWN_UNSAFE_TODO",
        "DAWN_UNSAFE_BUFFERS",
        "UNSAFE_TODO"
    ]

    total_code_lines = 0
    total_uncovered_lines = 0

    for relative_path in all_files:
        if relative_path.startswith('tools/'):
            continue

        _, extension = os.path.splitext(relative_path)
        if extension not in common.SOURCE_EXTENSIONS:
            continue

        full_path = relative_path

        if os.path.exists(full_path):
            file_code_lines = common.count_code_lines(file_path=full_path)
            total_code_lines += file_code_lines
        else:
            continue

        # Determine if file is covered by GN or CMake
        path_is_covered_in_gn = False
        if gn_config_exists:
            path_is_covered_in_gn = common.is_path_covered(relative_path, gn_included_prefixes, gn_excluded_prefixes)

        path_is_covered_in_cmake = False
        if tint_cmake_enforced and relative_path.startswith("src/tint/"):
            path_is_covered_in_cmake = True

        file_is_covered = path_is_covered_in_gn or path_is_covered_in_cmake

        uncovered_lines = 0

        if not file_is_covered:
            uncovered_lines = file_code_lines
        else:
            try:
                with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()

                if common.has_allow_unsafe_buffers_pragma(content):
                    # Rule 3a: Pragma makes all code lines uncovered.
                    uncovered_lines = file_code_lines
                else:
                    # Rule 3b: Count targeted inline safety macros and Tint blocks.
                    # Remove multi-line comments first to avoid false matches.
                    content_clean = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
                    lines = content_clean.splitlines()
                    
                    in_disabled_block = False
                    for line in lines:
                        # Remove single-line comments
                        line_clean = line.split('//', 1)[0].strip()
                        
                        # Check if it is code (non-blank, non-preprocessor)
                        is_code = line_clean and not line_clean.startswith('#')
                        
                        if "TINT_BEGIN_DISABLE_WARNING(UNSAFE_BUFFER_USAGE)" in line_clean:
                            in_disabled_block = True
                            
                        if in_disabled_block:
                            if is_code:
                                uncovered_lines += 1
                        else:
                            if is_code and any(macro in line_clean for macro in macros_to_check):
                                uncovered_lines += 1
                                
                        if "TINT_END_DISABLE_WARNING(UNSAFE_BUFFER_USAGE)" in line_clean:
                            in_disabled_block = False
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
