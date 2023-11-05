#include "DensityGrid.hpp"

#include <cmath>
#include <glm/glm.hpp>

DensityGrid::DensityGrid(int size) : grid_size_(10 * std::pow(size, 0.5)) {
  // The density is progressively higher close to the [0,1] border to avoid
  // nodes to exit.
  for (int i = 0; i < grid_size_; ++i) {
    for (int j = 0; j < grid_size_; ++j) {
      const float distance_x =
          std::min(i, grid_size_ - i) / float(grid_size_ - 1);
      const float distance_y =
          std::min(j, grid_size_ - j) / float(grid_size_ - 1);
      const float d = std::pow(1 - distance_x * distance_y, 2.0);
      const float dab = 20 * d - 19;
      const float dd = std::pow(std::max(0.f, dab), 40.0);
      density_[i][j] = std::max(0.f, dd);
    }
  }

  // Pattern is a pyramid.
  for (int i = 0; i < radius_ * 2 + 1; ++i) {
    for (int j = 0; j < radius_ * 2 + 1; ++j) {
      pattern_[i][j] = std::pow(1 - std::abs(i - radius_) / float(radius_), 2) *
                       std::pow(1 - std::abs(j - radius_) / float(radius_), 2);
    }
  }
}

void DensityGrid::Add(glm::vec2 position, float weight) {
  const int x = position.x * grid_size_;
  const int y = position.y * grid_size_;

#pragma omp parallel
#pragma omp for
  for (int i = -radius_; i <= radius_; ++i) {
    const int x2 = x + i;
    if (x2 < 0 || x2 >= grid_size_) {
      continue;
    }
    for (int j = -radius_; j <= radius_; ++j) {
      const int y2 = y + j;
      if (y2 < 0 || y2 >= grid_size_) {
        continue;
      }
      density_[x2][y2] += weight * pattern_[i + radius_][j + radius_];
    }
  }
}

float DensityGrid::Get(glm::vec2 position) {
  int x = position.x * grid_size_;
  int y = position.y * grid_size_;
  if (x < 0 || x >= grid_size_ || y < 0 || y >= grid_size_) {
    return 1.0;
  }
  return density_[x][y];
}
