// Copyright 2021 Arthur Sonzogni. All rights reserved.
// Use of this source code is governed by the MIT license that can be found in
// the LICENSE file.
//
// This file content was copied from:
// https://github.com/ArthurSonzogni/git-tui

#include "parser.hpp"
#include <cassert>
#include <regex>
#include <sstream>
#include "subprocess/ProcessBuilder.hpp"
#include "subprocess/basic_types.hpp"

std::vector<File> Parse(std::string input) {
  std::stringstream ss(input);
  std::string current;
  auto eat = [&]() -> bool { return !!std::getline(ss, current); };
  auto get = [&] { return current; };
  auto start_with = [&](const char* prefix) {
    return get().rfind(prefix, 0) == 0;
  };

  bool parse_header = true;
  std::vector<File> files;
  while (eat()) {
    if (start_with("diff")) {
      parse_header = true;
      files.emplace_back();
      continue;
    }

    if (start_with("index")) {
      assert(parse_header);
      continue;
    }

    if (start_with("---") && parse_header) {
      assert(files.size() != 0);
      files.back().left_file = get().substr(3);
      continue;
    }

    if (start_with("+++") && parse_header) {
      assert(files.size() != 0);
      files.back().right_file = get().substr(6);
      continue;
    }

    if (start_with("@@")) {
      assert(files.size() != 0);
      files.back().hunks.emplace_back();
      static std::regex regex(R"(@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@.*)");
      std::smatch match;
      bool matched = std::regex_match(current, match, regex);
      assert(matched);
      (void)matched;
      files.back().hunks.back().left_start = std::stoi(match[1].str());
      files.back().hunks.back().right_start = std::stoi(match[2].str());
      parse_header = false;
      continue;
    }

    if (start_with(" ")) {
      files.back().hunks.back().lines.emplace_back();
      files.back().hunks.back().lines.back().type = Line::Keep;
      files.back().hunks.back().lines.back().content = get().substr(1);
      continue;
    }

    if (start_with("+")) {
      files.back().hunks.back().lines.emplace_back();
      files.back().hunks.back().lines.back().type = Line::Add;
      files.back().hunks.back().lines.back().content = get().substr(1);
      continue;
    }

    if (start_with("-")) {
      files.back().hunks.back().lines.emplace_back();
      files.back().hunks.back().lines.back().type = Line::Delete;
      files.back().hunks.back().lines.back().content = get().substr(1);
      continue;
    }
  }
  return files;
}

std::string ResolveHead() {
  auto process = subprocess::run({"git", "rev-list", "HEAD", "-1"},
                                 subprocess::RunBuilder()                 //
                                     .cerr(subprocess::PipeOption::pipe)  //
                                     .cout(subprocess::PipeOption::pipe)  //
                                     .cin(subprocess::PipeOption::close)  //
  );

  std::string out = std::move(process.cout);
  out.erase(std::remove(std::begin(out), std::end(out), '\n'), std::end(out));
  return out;
}

Commit GetCommit(std::string hash) {
  Commit commit;
  commit.hash = hash;

  auto process = subprocess::run(
      {
          "git",
          "cat-file",
          "commit",
          hash,
      },
      subprocess::RunBuilder()                 //
          .cerr(subprocess::PipeOption::pipe)  //
          .cout(subprocess::PipeOption::pipe)  //
          .cin(subprocess::PipeOption::close)  //
  );
  std::stringstream ss(process.cout);

  std::string line;
  while (std::getline(ss, line)) {
    if (line.find("tree ", 0) == 0) {
      commit.tree = line.substr(5);
      continue;
    }

    if (line.find("parent", 0) == 0) {
      commit.parents.push_back(line.substr(7));
      continue;
    }

    if (line.find("author", 0) == 0) {
      size_t pos1 = line.find_last_of('<');
      size_t pos2 = line.find_last_of('@');
      size_t pos3 = line.find(' ', pos2);
      size_t pos4 = line.find(' ', pos3 + 1);
      std::string email = line.substr(pos1 + 1, pos2 - pos1 - 1);
      std::string timestamp = line.substr(pos3 + 1, pos4 - pos3 - 1);
      commit.authors.push_back(email);
      commit.timestamp = timestamp;
      continue;
    }

    if (line.find("committer", 0) == 0) {
      commit.committers.push_back(line.substr(10));
      continue;
    }

    if (line.empty()) {
      int index = -1;
      while (std::getline(ss, line)) {
        ++index;
        if (index == 0)
          commit.title = std::move(line);
        else if (index >= 2) {
          if (line.find("Reviewed-by: ", 0) == 0) {
            size_t pos1 = line.find_last_of('<');
            size_t pos2 = line.find_last_of('@');
            std::string email = line.substr(pos1 + 1, pos2 - pos1 - 1);
            commit.reviewers.push_back(email);
          }
          commit.body.push_back(std::move(line));
        }
      }
      break;
    }
  }
  return commit;
}

std::vector<File> GetFiles(const Commit& commit) {
  auto process = subprocess::run(
      {
          "git",
          "diff",
          "-U1",
          commit.hash + "~..." + commit.hash,
      },
      subprocess::RunBuilder()                 //
          .cerr(subprocess::PipeOption::pipe)  //
          .cout(subprocess::PipeOption::pipe)  //
          .cin(subprocess::PipeOption::close)  //
  );
  return Parse(process.cout);
}
