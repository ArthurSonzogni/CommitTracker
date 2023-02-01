#include <cmath>
#include <cstdlib>
#include <iostream>
#include "parser.hpp"

int main(int argument_count, char** argument_values) {
  const std::string last_hash = (argument_count > 1) ? argument_values[1] : "";
  (void)argument_count;
  (void)argument_values;

  auto head = ResolveHead();

  std::cout << "time,name,author" << std::endl;
  while (true) {
    auto commit = GetCommit(head);

    for (auto& author : commit.authors) {
      std::cout << commit.timestamp << "," << author << ",1" << std::endl;
    }
    for (auto& reviewer : commit.reviewers) {
      std::cout << commit.timestamp << "," << reviewer << ",0" << std::endl;
    }

    if (commit.parents.size() == 0) {
      break;
    }
    head = commit.parents[0];
  }
  return EXIT_SUCCESS;
}
