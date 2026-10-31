#ifndef DENSITY_GRID_HPP_
#define DENSITY_GRID_HPP_

#include <vector>
#include "Vec.hpp"

// A 2D grid of size [0, 1] x [0, 1] that stores density values.
class DensityGrid {
 public:
  explicit DensityGrid(int size);
  ~DensityGrid() = default;

  // position is expected to be in the [0, 1] range.
  void Add(Vec2 position, float weight);
  float Get(Vec2 position) const;

 private:
  const int grid_size_;
  const int radius_;
  const int pattern_width_;

  std::vector<float> density_;
  std::vector<float> pattern_;
};

#endif  // DENSITY_GRID_HPP_
