#ifndef MAIN_LOGIC_HPP_
#define MAIN_LOGIC_HPP_

#include <functional>
#include "Weight.hpp"
#include <glm/glm.hpp>
#include <map>
#include "DensityGrid.hpp"
#include <memory>
#include <string>
#include <vector>

class MainLogic {
  public:
  // Usage:
  // - input: path to the input CSV file.
  // - output: path to the output SVG file.
  int Main(const std::string& input, const std::string& output);

 private:
  std::unique_ptr<DensityGrid> density;
  std::map<std::string, int> users_id;

  // We use data oriented design to store every properties in differents arrays.
  std::vector<std::string> labels;
  std::vector<float> user_repulsion;
  std::vector<float> colors;  // Hue in HSV.
  std::vector<std::vector<Weight>> weights;
  std::vector<std::vector<Weight>> weights_incoming;
  std::vector<glm::vec2> positions;

  void CreateUser(const std::string& user);
  int AddUser(const std::string& user);
  void RenormalizePositions();

  void Planarize();
  void AdjustPositions();
};

#endif /* MAIN_LOGIC_HPP_ */
