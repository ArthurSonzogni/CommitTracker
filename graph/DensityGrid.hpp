#ifndef DENSITY_GRID_HPP_
#define DENSITY_GRID_HPP_

#include <glm/glm.hpp>
#include <vector>

// A 2D grid of size [0, 1] x [0, 1] that stores a density values.
class DensityGrid {
 public:
  DensityGrid(int size);
  ~DensityGrid() = default;

  // position are expected to be in the [0, 1] range.
  void Add(glm::vec2 position, float weight);
  float Get(glm::vec2 position);

 private:
  const int grid_size_;
  const int radius_ = std::pow(grid_size_, 0.9) / 5;

  using Line = std::vector<float>;
  using Grid = std::vector<Line>;

  Grid density_ = Grid(grid_size_, Line(grid_size_, 0.0f));
  Grid pattern_ = Grid(radius_ * 2 + 1, Line(radius_ * 2 + 1, 0.0f));
};

#endif  // DENSITY_GRID_HPP_
