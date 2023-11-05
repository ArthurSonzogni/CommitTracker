#ifndef READCSV_H
#define READCSV_H

#include <functional>
#include <string>
#include <vector>

void ReadCSV(const std::string& filename,
             std::function<void(std::vector<std::string>)> AddRow);

#endif /* READCSV_H */
