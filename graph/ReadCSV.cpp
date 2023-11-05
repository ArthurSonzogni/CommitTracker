#include "ReadCSV.hpp"

#include <fstream>
#include <sstream>

void ReadCSV(const std::string& filename,
             std::function<void(std::vector<std::string>)> AddRow) {
  std::ifstream file(filename);
  std::string line;
  while (std::getline(file, line)) {
    std::stringstream ss(line);
    std::string cell;
    std::vector<std::string> row;
    while (std::getline(ss, cell, ',')) {
      row.push_back(cell);
    }
    AddRow(row);
  }
}
