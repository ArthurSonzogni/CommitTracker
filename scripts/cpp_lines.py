#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Counts the number of effective lines of code in C++ files within a git
repository, formatted as path/to/file.cc:line_count.
"""

import os

from unsafe_buffers_common import SOURCE_EXTENSIONS, count_code_lines, get_git_files


def main():
    for relative_path in get_git_files():
        _, extension = os.path.splitext(relative_path)
        if extension not in SOURCE_EXTENSIONS:
            continue

        line_count = count_code_lines(file_path=relative_path)
        if line_count > 0:
            print(f"{relative_path}:{line_count}")


if __name__ == '__main__':
    main()
