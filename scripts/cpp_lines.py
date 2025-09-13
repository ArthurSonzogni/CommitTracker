#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Counts the number of effective lines of code in C++ files within a git
repository.

This script should be run from the root of a git checkout. It lists all
tracked C++ files and counts the lines in each, excluding blank lines,
comments (both single-line and multi-line), and preprocessor macros.

The output is formatted as:
path/to/file.cc:line_count
"""

import os
import sys
import subprocess
import re

# File extensions to consider for scanning.
SOURCE_EXTENSIONS = {'.c', '.cc', '.cpp', '.h', '.hh', '.hpp'}

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
    all_files = get_git_files()

    for relative_path in all_files:
        _, extension = os.path.splitext(relative_path)
        if extension not in SOURCE_EXTENSIONS:
            continue

        line_count = count_code_lines(file_path=relative_path)

        if line_count > 0:
            print(f"{relative_path}:{line_count}")

if __name__ == '__main__':
    main()

