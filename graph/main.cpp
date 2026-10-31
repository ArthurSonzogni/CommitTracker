#include <algorithm>
#include <format>
#include <iostream>
#include <string>
#include "MainLogic.hpp"

int main(int argc, char** argv) {
  if (argc < 3) {
    std::cout << std::format(
        "Usage: {} <input> <output> [community count=10]\n", argv[0]);
    return 1;
  }
  const std::string input = argv[1];
  const std::string output = argv[2];
  const int community_count = argc >= 4 ? std::max(1, std::stoi(argv[3])) : 10;

  MainLogic main_logic;
  return main_logic.Main(input, output, community_count);
}
