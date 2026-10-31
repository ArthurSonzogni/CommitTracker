#include "DensityGrid.hpp"

#include <algorithm>
#include <cmath>

DensityGrid::DensityGrid(int size)
    : grid_size_(std::max(2, static_cast<int>(8 * std::pow(size, 0.7)))),
      radius_(std::max(1, static_cast<int>(std::pow(grid_size_, 0.9) / 5))),
      pattern_width_(radius_ * 2 + 1),
      density_(grid_size_ * grid_size_, 0.0f),
      pattern_(pattern_width_ * pattern_width_, 0.0f) {
  // The density is progressively higher close to the [0,1] border to avoid
  // nodes exiting.
  for (int i = 0; i < grid_size_; ++i) {
    for (int j = 0; j < grid_size_; ++j) {
      const float distance_x =
          std::min(i, grid_size_ - i) / float(grid_size_ - 1);
      const float distance_y =
          std::min(j, grid_size_ - j) / float(grid_size_ - 1);
      const float d = std::pow(1 - distance_x * distance_y, 2.0);
      const float dab = 20 * d - 19;
      const float dd = std::pow(std::max(0.f, dab), 40.0);
      density_[i * grid_size_ + j] = 100 * std::max(0.f, dd);
    }
  }

  // Pattern is a pyramid.
  for (int i = 0; i < pattern_width_; ++i) {
    for (int j = 0; j < pattern_width_; ++j) {
      pattern_[i * pattern_width_ + j] =
          std::pow(1 - std::abs(i - radius_) / float(radius_), 1.5) *
          std::pow(1 - std::abs(j - radius_) / float(radius_), 1.5);
    }
  }
}

void DensityGrid::Add(Vec2 position, float weight) {
  const int x = position.x * grid_size_;
  const int y = position.y * grid_size_;

  for (int i = -radius_; i <= radius_; ++i) {
    const int x2 = x + i;
    if (x2 < 0 || x2 >= grid_size_) {
      continue;
    }
    const int density_row = x2 * grid_size_;
    const int pattern_row = (i + radius_) * pattern_width_;
    for (int j = -radius_; j <= radius_; ++j) {
      const int y2 = y + j;
      if (y2 < 0 || y2 >= grid_size_) {
        continue;
      }
      density_[density_row + y2] +=
          weight * pattern_[pattern_row + j + radius_];
    }
  }
}

float DensityGrid::Get(Vec2 position) const {
  const int x = position.x * grid_size_;
  const int y = position.y * grid_size_;
  if (x < 0 || x >= grid_size_ || y < 0 || y >= grid_size_) {
    return 1.0f;
  }
  return density_[x * grid_size_ + y];
}
