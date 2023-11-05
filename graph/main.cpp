#include "MainLogic.hpp"
#include "fmt/format.h"

int main(int argc, char** argv) {
  if (argc < 3) {
    fmt::print("Usage: {} <input> <output>\n", argv[0]);
    return 1;
  }
  const std::string input = argv[1];
  const std::string output = argv[2];

  MainLogic main_logic;
  return main_logic.Main(input, output);
}
