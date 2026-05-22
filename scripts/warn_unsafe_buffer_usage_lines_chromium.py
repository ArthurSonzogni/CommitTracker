#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Counts the number of lines not covered by the -Wunsafe-buffer-usage
warning in the Chromium codebase.
"""

import os
import sys
import unsafe_buffers_common as common

def main():
    config_path = "build/config/unsafe_buffers_paths.txt"
    config_exists = os.path.exists(config_path)
    included_prefixes, excluded_prefixes = [], []

    if config_exists:
        included_prefixes, excluded_prefixes = common.parse_config(config_path)
        if not excluded_prefixes:
            excluded_prefixes = []
            included_prefixes = []
            config_exists = False

    all_files = common.get_git_files()
    macros_to_check = ["UNSAFE_TODO"]

    for relative_path in all_files:
        if relative_path.startswith('tools/'):
            continue

        _, extension = os.path.splitext(relative_path)
        if extension not in common.SOURCE_EXTENSIONS:
            continue

        full_path = relative_path
        uncovered_lines = 0

        if not config_exists:
            uncovered_lines = common.count_code_lines(file_path=full_path)
        else:
            path_is_covered = common.is_path_covered(relative_path, included_prefixes, excluded_prefixes)
            if not path_is_covered:
                uncovered_lines = common.count_code_lines(file_path=full_path)
            else:
                try:
                    with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()

                    if common.has_allow_unsafe_buffers_pragma(content):
                        uncovered_lines = common.count_code_lines(content=content)
                    else:
                        lines = content.splitlines()
                        for line in lines:
                            if any(macro in line for macro in macros_to_check):
                                uncovered_lines += 1
                except IOError as e:
                    print(f"Warning: Could not read file {full_path}: {e}", file=sys.stderr)
                    continue

        if uncovered_lines > 0:
            print(f"{relative_path}:{uncovered_lines}")

if __name__ == '__main__':
    main()
