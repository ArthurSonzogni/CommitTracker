#ifndef MAIN_LOGIC_HPP_
#define MAIN_LOGIC_HPP_

#include <map>
#include <memory>
#include <string>
#include <vector>
#include "DensityGrid.hpp"
#include "Vec.hpp"
#include "Weight.hpp"

class MainLogic {
 public:
  // Usage:
  // - input: path to the input CSV file.
  // - output: path to the output SVG file. A JSON file with the same data is
  //   written next to it, with the ".json" extension.
  // - community_count: the number of communities to find.
  int Main(const std::string& input,
           const std::string& output,
           int community_count);

 private:
  std::unique_ptr<DensityGrid> density;
  std::map<std::string, int> users_id;

  // We use data oriented design to store every properties in differents arrays.
  std::vector<std::string> labels;
  std::vector<float> user_repulsion;
  std::vector<float> colors;  // Hue in HSV.
  std::vector<int> clusters;  // Index of the community.
  std::vector<std::vector<Weight>> weights;
  std::vector<std::vector<Weight>> weights_incoming;
  std::vector<Vec2> positions;

  void CreateUser(const std::string& user);
  int AddUser(const std::string& user);

  void Planarize();
  void AdjustPositions();
};

#endif /* MAIN_LOGIC_HPP_ */
