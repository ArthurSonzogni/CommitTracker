// Copyright 2021 Arthur Sonzogni. All rights reserved.
// Use of this source code is governed by the MIT license that can be found in
// the LICENSE file.
//
// This file content was copied from:
// https://github.com/ArthurSonzogni/git-tui

#ifndef CHROME_DANGLING_UNTRIAGED_TRACKER_PARSER_HPP
#define CHROME_DANGLING_UNTRIAGED_TRACKER_PARSER_HPP

#include <string>
#include <vector>

struct Line {
  enum Type { Keep, Add, Delete };
  Type type;
  std::string content;
};

struct Hunk {
  int left_start;
  int right_start;
  std::vector<Line> lines;
};

struct File {
  std::string left_file;
  std::string right_file;
  std::vector<Hunk> hunks;
};

struct Commit {
  std::string hash;
  std::string title;
  std::string tree;
  std::string timestamp;
  std::vector<std::string> authors;
  std::vector<std::string> reviewers;
  std::vector<std::string> body;
  std::vector<std::string> committers;
  std::vector<std::string> parents;
};

std::string ResolveHead();
Commit GetCommit(std::string hash);
std::vector<File> GetFiles(const Commit& commit);

#endif  // CHROME_DANGLING_UNTRIAGED_TRACKER_PARSER_HPP
