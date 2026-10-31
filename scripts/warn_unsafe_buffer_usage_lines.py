#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Counts the number of C++ code lines not covered by -Wunsafe-buffer-usage
in Chromium, ANGLE, or Dawn/Tint.
"""

import argparse
import os
import sys

import unsafe_buffers_common as common

REPO_CONFIGS = {
    'chromium': {
        'config_path': 'build/config/unsafe_buffers_paths.txt',
        'require_excluded': True,
        'macros': ('UNSAFE_TODO',),
        'tint_cmake': False,
        'tint_disable_blocks': False,
    },
    'angle': {
        'config_path': 'unsafe_buffers_paths.txt',
        'require_excluded': True,
        'macros': ('ANGLE_UNSAFE_TODO',),
        'tint_cmake': False,
        'tint_disable_blocks': False,
    },
    'dawn': {
        'config_path': 'unsafe_buffers_paths.txt',
        'require_excluded': False,
        'macros': (
            'TINT_DISABLE_WARNING_UNSAFE_BUFFER_USAGE',
            'TINT_DISABLE_WARNING_UNSAFE_BUFFER_USAGE_IN_CONTAINER',
            'DAWN_UNSAFE_TODO',
            'DAWN_UNSAFE_BUFFERS',
            'UNSAFE_TODO',
        ),
        'tint_cmake': True,
        'tint_disable_blocks': True,
    },
}

TINT_BEGIN_DISABLE = 'TINT_BEGIN_DISABLE_WARNING(UNSAFE_BUFFER_USAGE)'
TINT_END_DISABLE = 'TINT_END_DISABLE_WARNING(UNSAFE_BUFFER_USAGE)'


def detect_tint_cmake_enforced():
    tint_cmake_path = 'src/tint/CMakeLists.txt'
    if not os.path.exists(tint_cmake_path):
        return False
    try:
        with open(tint_cmake_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                line = line.strip()
                if line.startswith('#'):
                    continue
                if '-Wunsafe-buffer-usage' in line and '-Wno-unsafe-buffer-usage' not in line:
                    return True
    except OSError:
        pass
    return False


def count_uncovered_macro_lines(code_lines, macros, check_tint_blocks):
    uncovered = 0
    in_disabled_block = False
    for line in code_lines:
        if check_tint_blocks and TINT_BEGIN_DISABLE in line:
            in_disabled_block = True

        if in_disabled_block or any(macro in line for macro in macros):
            uncovered += 1

        if check_tint_blocks and TINT_END_DISABLE in line:
            in_disabled_block = False
    return uncovered


def main():
    parser = argparse.ArgumentParser(
        description='Count C++ lines uncovered by -Wunsafe-buffer-usage.'
    )
    parser.add_argument(
        '--repo',
        choices=sorted(REPO_CONFIGS.keys()),
        default='chromium',
        help='Target repository configuration (chromium, angle, dawn).',
    )
    parser.add_argument(
        '--summary',
        action='store_true',
        help='Print only summary metrics instead of per-file counts.',
    )
    args = parser.parse_args()

    cfg = REPO_CONFIGS[args.repo]
    config_path = cfg['config_path']
    config_exists = os.path.exists(config_path)
    included_prefixes, excluded_prefixes = [], []

    if config_exists:
        included_prefixes, excluded_prefixes = common.parse_config(config_path)
        if cfg['require_excluded'] and not excluded_prefixes:
            included_prefixes, excluded_prefixes = [], []
            config_exists = False

    tint_cmake_enforced = detect_tint_cmake_enforced() if cfg['tint_cmake'] else False
    macros = cfg['macros']
    check_tint_blocks = cfg['tint_disable_blocks']

    total_code_lines = 0
    total_uncovered_lines = 0

    for relative_path in common.get_git_files():
        if relative_path.startswith('tools/'):
            continue

        _, extension = os.path.splitext(relative_path)
        if extension not in common.SOURCE_EXTENSIONS:
            continue

        try:
            with open(relative_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except OSError as e:
            if os.path.exists(relative_path):
                print(f"Warning: Could not read file {relative_path}: {e}", file=sys.stderr)
            continue

        covered_in_gn = (
            common.is_path_covered(relative_path, included_prefixes, excluded_prefixes)
            if config_exists
            else False
        )
        covered_in_cmake = tint_cmake_enforced and relative_path.startswith('src/tint/')
        file_is_covered = covered_in_gn or covered_in_cmake

        if not file_is_covered or common.has_allow_unsafe_buffers_pragma(content):
            file_code_lines = sum(1 for _ in common.iter_code_lines(content))
            uncovered_lines = file_code_lines
            total_code_lines += file_code_lines
        elif args.summary:
            code_lines = list(common.iter_code_lines(content))
            total_code_lines += len(code_lines)
            uncovered_lines = count_uncovered_macro_lines(code_lines, macros, check_tint_blocks)
        else:
            uncovered_lines = count_uncovered_macro_lines(
                common.iter_code_lines(content), macros, check_tint_blocks
            )

        total_uncovered_lines += uncovered_lines
        if uncovered_lines > 0 and not args.summary:
            print(f"{relative_path}:{uncovered_lines}")

    if args.summary:
        covered_lines = total_code_lines - total_uncovered_lines
        ratio = covered_lines / total_code_lines if total_code_lines > 0 else 0.0
        print(f"TOTAL_CODE_LINES:{total_code_lines}")
        print(f"UNCOVERED_LINES:{total_uncovered_lines}")
        print(f"COVERED_LINES:{covered_lines}")
        print(f"COVERAGE_RATIO:{ratio:.4f}")


if __name__ == '__main__':
    main()
