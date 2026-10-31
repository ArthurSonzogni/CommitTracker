#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Counts the number of C++ code lines not covered by -Wunsafe-buffer-usage
in Chromium, ANGLE, Dawn/Tint, PDFium, Skia, or WebRTC.
"""

import argparse
import fnmatch
import os
import re
import sys

import unsafe_buffers_common as common

REPO_CONFIGS = {
    'chromium': {
        'config_paths': ('build/config/unsafe_buffers_paths.txt',),
        'config_format': 'paths',
        'require_excluded': True,
        'allow_bare_opt_in': False,
        'macros': ('UNSAFE_TODO',),
        'tint_cmake': False,
        'tint_disable_blocks': False,
        'skip_tools': True,
    },
    'angle': {
        'config_paths': ('unsafe_buffers_paths.txt',),
        'config_format': 'paths',
        'require_excluded': True,
        'allow_bare_opt_in': False,
        'macros': ('ANGLE_UNSAFE_TODO',),
        'tint_cmake': False,
        'tint_disable_blocks': False,
        'skip_tools': True,
    },
    'dawn': {
        'config_paths': ('unsafe_buffers_paths.txt',),
        'config_format': 'paths',
        'require_excluded': False,
        'allow_bare_opt_in': False,
        'macros': (
            'TINT_DISABLE_WARNING_UNSAFE_BUFFER_USAGE',
            'TINT_DISABLE_WARNING_UNSAFE_BUFFER_USAGE_IN_CONTAINER',
            'DAWN_UNSAFE_TODO',
            'DAWN_UNSAFE_BUFFERS',
            'UNSAFE_TODO',
        ),
        'tint_cmake': True,
        'tint_disable_blocks': True,
        'skip_tools': True,
    },
    'pdfium': {
        'config_paths': (
            'unsafe_buffers_paths.txt',
            'pdfium_unsafe_buffers_paths.txt',
        ),
        'config_format': 'paths',
        'require_excluded': True,
        'allow_bare_opt_in': True,
        'macros': ('UNSAFE_TODO',),
        'tint_cmake': False,
        'tint_disable_blocks': False,
        'skip_tools': False,
    },
    'skia': {
        'config_paths': ('tools/unsafe_buffers/unsafe_buffers_mappings.txt',),
        'config_format': 'clang_mappings',
        'require_excluded': False,
        'allow_bare_opt_in': False,
        'macros': ('SK_UNSAFE_TODO',),
        'tint_cmake': False,
        'tint_disable_blocks': False,
        'skip_tools': False,
    },
    'webrtc': {
        'config_paths': ('unsafe_buffers_paths.txt',),
        'config_format': 'paths',
        'require_excluded': True,
        'allow_bare_opt_in': False,
        'macros': ('UNSAFE_TODO',),
        'tint_cmake': False,
        'tint_disable_blocks': False,
        'skip_tools': False,
    },
}

TINT_BEGIN_DISABLE = 'TINT_BEGIN_DISABLE_WARNING(UNSAFE_BUFFER_USAGE)'
TINT_END_DISABLE = 'TINT_END_DISABLE_WARNING(UNSAFE_BUFFER_USAGE)'


def parse_bare_opt_in_prefixes(config_path):
    """
    Parses early opt-in unsafe_buffers_paths.txt files whose lines are bare
    directory/file prefixes without '+', '-', '.', or '$' markers.
    """
    prefixes = []
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith(('#', '+', '-', '.', '$')):
                    continue
                prefixes.append(line)
    except OSError:
        pass
    return sorted(prefixes, key=len, reverse=True)


def parse_clang_mappings(config_path):
    """
    Parses Clang --warning-suppression-mappings rules under
    [unsafe-buffer-usage]. Returns (rules, has_any_emit) where rules is a list
    of (compiled_regex, emit_bool) in file order (last match wins).
    """
    rules = []
    in_section = False
    has_any_emit = False
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith('#'):
                    continue
                if line.startswith('[') and line.endswith(']'):
                    in_section = (line == '[unsafe-buffer-usage]')
                    continue
                if not in_section or not line.startswith('src:'):
                    continue
                spec = line[4:]
                emit = False
                if spec.endswith('=emit'):
                    spec = spec[:-5]
                    emit = True
                    has_any_emit = True
                rules.append((re.compile(fnmatch.translate(spec)), emit))
    except OSError as e:
        print(f"Warning: Could not read mappings file {config_path}: {e}", file=sys.stderr)
    return rules, has_any_emit


def is_covered_by_clang_mappings(path, reversed_rules):
    prefixed_path = '/' + path
    for regex, emit in reversed_rules:
        if regex.match(path) or regex.match(prefixed_path):
            return emit
    return True


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
        help='Target repository configuration.',
    )
    parser.add_argument(
        '--summary',
        action='store_true',
        help='Print only summary metrics instead of per-file counts.',
    )
    args = parser.parse_args()

    cfg = REPO_CONFIGS[args.repo]
    config_path = next((p for p in cfg['config_paths'] if os.path.exists(p)), None)
    config_exists = config_path is not None
    config_format = cfg['config_format']

    included_prefixes, excluded_prefixes = [], []
    bare_opt_in_prefixes = []
    reversed_mapping_rules = []

    if config_exists and config_format == 'paths':
        included_prefixes, excluded_prefixes = common.parse_config(config_path)
        if cfg['require_excluded'] and not excluded_prefixes:
            included_prefixes, excluded_prefixes = [], []
            if cfg['allow_bare_opt_in']:
                bare_opt_in_prefixes = parse_bare_opt_in_prefixes(config_path)
            if not bare_opt_in_prefixes:
                config_exists = False
    elif config_exists and config_format == 'clang_mappings':
        mapping_rules, has_any_emit = parse_clang_mappings(config_path)
        if not has_any_emit:
            config_exists = False
        else:
            reversed_mapping_rules = list(reversed(mapping_rules))

    tint_cmake_enforced = detect_tint_cmake_enforced() if cfg['tint_cmake'] else False
    macros = cfg['macros']
    check_tint_blocks = cfg['tint_disable_blocks']
    skip_tools = cfg['skip_tools']

    total_code_lines = 0
    total_uncovered_lines = 0

    for relative_path in common.get_git_files():
        if skip_tools and relative_path.startswith('tools/'):
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

        if not config_exists:
            covered_in_config = False
        elif config_format == 'clang_mappings':
            covered_in_config = is_covered_by_clang_mappings(relative_path, reversed_mapping_rules)
        elif bare_opt_in_prefixes:
            covered_in_config = common.get_best_match(relative_path, bare_opt_in_prefixes) is not None
        else:
            covered_in_config = common.is_path_covered(
                relative_path, included_prefixes, excluded_prefixes
            )
        covered_in_cmake = tint_cmake_enforced and relative_path.startswith('src/tint/')
        file_is_covered = covered_in_config or covered_in_cmake

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
