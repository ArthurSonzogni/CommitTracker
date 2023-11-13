#include "MainLogic.hpp"

#include <fmt/core.h>
#include <fmt/ostream.h>
#include <algorithm>
#include <cmath>
#include <fstream>
#include <functional>
#include <glm/glm.hpp>
#include <iostream>
#include <map>
#include <memory>
#include <random>
#include <sstream>
#include <string>
#include <tuple>
#include <vector>
#include "Colorize.hpp"
#include "DensityGrid.hpp"
#include "ReadCSV.hpp"
#include "Render.hpp"
#include "Weight.hpp"

namespace {

// Filter out users with invalid characters. Those characters might corrupt the
// SVG document.
bool FilterUserName(const std::string& user) {
  return std::any_of(user.begin(), user.end(), [](char c) {
    return c == '<' || c == '>' || c == ',' || c < 0;
  });
}

std::vector<glm::vec2> RandomPositions(size_t n) {
  std::vector<glm::vec2> positions;
  std::mt19937 generator(42);
  std::uniform_real_distribution<float> distribution(0, 1);

  positions.resize(n);
  for (int i = 0; i < n; ++i) {
    positions[i] = {
        distribution(generator),
        distribution(generator),
    };
  }
  return positions;
}

// The font-size of each users to display:
std::vector<float> LabelSize(const std::vector<std::vector<Weight>>& weights) {
  std::vector<float> label_size;
  // The size of every label is the sum of the weights of the edges.
  for (int i = 0; i < weights.size(); ++i) {
    float weight_sum = 0;
    for (int j = 0; j < weights[i].size(); ++j) {
      weight_sum += weights[i][j].weight;
    }
    label_size.push_back(weight_sum);
  }

  // Normalize the size of the labels.
  float sum = 0;
  for (int i = 0; i < label_size.size(); ++i) {
    sum += label_size[i];
  }
  float scale = 0.04 / sum;
  for (int i = 0; i < label_size.size(); ++i) {
    label_size[i] *= scale;
  }

  // Take the square root of the size, so that the area is proportional to the
  // size.
  for (int i = 0; i < label_size.size(); ++i) {
    label_size[i] = std::pow(label_size[i], 0.5f);
  }

  return label_size;
}

// The thickness of each edges to display:
std::vector<std::vector<Weight>> EdgesThickness(
    const std::vector<std::vector<Weight>>& w) {
  std::vector<std::vector<Weight>> thickness = w;

  // Normalize edge size.
  float edges_sum_weight = 0.f;
  for (auto& sizes : thickness) {
    for (auto& w : sizes) {
      edges_sum_weight += w.weight;
    }
  }

  // Note: the scale is an heuristic to render well on small and large Graphs.
  const float scale = 0.1 * std::pow(w.size(), 0.5) / edges_sum_weight;

  for (auto& sizes : thickness) {
    for (auto& w : sizes) {
      w.weight *= scale;
    }
  }
  return thickness;
}

// How much the users repulse each other. The absolute value is not important,
// but the relative values are.
std::vector<float> UserRepulsions(
    const std::vector<std::vector<Weight>>& weights) {
  std::vector<float> user_repulsion;
  for (int i = 0; i < weights.size(); ++i) {
    float weight_sum = 0;
    for (int j = 0; j < weights[i].size(); ++j) {
      weight_sum += weights[i][j].weight;
    }
    user_repulsion.push_back(std::pow(weight_sum, 0.8f));
  }

  // Normalize the size of the labels.
  float sum = 0;
  for (int i = 0; i < user_repulsion.size(); ++i) {
    user_repulsion[i] = std::pow(user_repulsion[i], 2.f);
    sum += user_repulsion[i];
  }
  float scale = weights.size() / sum;
  for (int i = 0; i < user_repulsion.size(); ++i) {
    user_repulsion[i] = 0.2f * user_repulsion[i] * scale +  //
                        0.8f / user_repulsion.size();
  }

  return user_repulsion;
}

glm::vec4 Interpolate(const std::vector<glm::vec4>& values, float time) {
  if (values.size() == 1) {
    return values.front();
  }

  // Find the two values to interpolate between.
  int i = 0;
  while (i < values.size() - 1 && values[i + 1].x < time) {
    ++i;
  }

  // Interpolate between the two values.
  const float t = (time - values[i].x) / (values[i + 1].x - values[i].x);
  return glm::mix(values[i], values[i + 1], t);
}

}  // namespace

void MainLogic::CreateUser(const std::string& user) {
  users_id[user] = labels.size();
  labels.push_back(user);
  weights.push_back({});
  weights_incoming.push_back({});
  colors.push_back(0.f);
}

int MainLogic::AddUser(const std::string& user) {
  if (users_id.find(user) == users_id.end()) {
    CreateUser(user);
  }

  return users_id[user];
}

std::unique_ptr<DensityGrid> InitializeDensity(
    const std::vector<glm::vec2>& positions,
    const std::vector<float>& repulsion) {
  auto density = std::make_unique<DensityGrid>(repulsion.size());
  for (int i = 0; i < repulsion.size(); ++i) {
    density->Add(positions[i], repulsion[i]);
  }
  return density;
}

// Interpolate between two values in a list, given a time.
void MainLogic::RenormalizePositions() {
  // Compute the bounding box of the graph.
  glm::vec2 min = positions.front();
  glm::vec2 max = positions.front();
  for (auto& p : positions) {
    min = glm::min(min, p);
    max = glm::max(max, p);
  }

  // Renormalize progressively:
  min = glm::vec2(0) + 0.5f * (min - glm::vec2(0));
  max = glm::vec2(1) - 0.5f * (glm::vec2(1) - max);

  // Compute the size of the bounding box.
  const glm::vec2 size = max - min;

  // Compute the scale to apply to the positions.
  const float scale = 1.f / std::max(size.x, size.y);

  // Apply the scale to the positions.
  for (auto& p : positions) {
    p = (p - min) * scale;
  }

  density = InitializeDensity(positions, user_repulsion);
}

int MainLogic::Main(const std::string& input, const std::string& output) {
  ReadCSV(input, [this](std::vector<std::string> row) {
    assert(row.size() == 3);
    const std::string& user1 = row[0];
    const std::string& user2 = row[1];
    if (FilterUserName(user1) || FilterUserName(user2) || user1 == user2) {
      return;
    }

    int user1_id = AddUser(row[0]);
    int user2_id = AddUser(row[1]);
    float w = std::stof(row[2]);

    weights[user1_id].push_back({.user_id = user2_id, .weight = w});
    weights[user2_id].push_back({.user_id = user1_id, .weight = w});
    weights_incoming[user1_id].push_back({.user_id = user2_id, .weight = w});
  });

  if (weights.empty()) {
    return 0;
  }

  const std::vector<float> label_size = LabelSize(weights);

  Colorize(weights, colors);
  positions = RandomPositions(labels.size());
  user_repulsion = UserRepulsions(weights);
  density = InitializeDensity(positions, user_repulsion);

  Planarize();
  //AdjustPositions();
  Render(density.get(), labels, positions, label_size, colors,
         EdgesThickness(weights_incoming), output);

  return 0;
}

void MainLogic::Planarize() {
  // Initialize the random generator from a known seed, so that the results are
  // reproducible.
  std::mt19937 generator(42);

  const int max_iteration = 100;
  for (int iteration = 0; iteration < max_iteration; ++iteration) {
    const float time_step = 1.0f / float(max_iteration);
    const float time = (iteration + 1) / float(max_iteration);
    const float time_inv = 1.0 - time;
    const float time_step_mul = std::pow(1.0f, 1.0 / float(max_iteration));

    const auto params = Interpolate(
        {
            // Initial contractions
            {0.0f, 1.0f, 0.000f, 0.01f},
            {0.1f, 1.0f, 0.1f, 0.1f},
            {0.1f, 0.99f, 0.005f, 0.4f},
            {0.2f, 0.05f, 0.005f, 0.4f},

            // Alternate phase of contractions and expansions.
            {0.3f, 0.99f, 0.005f, 0.5f},
            {0.4f, 0.05f, 0.005f, 0.6f},
            {0.5f, 0.99f, 0.005f, 0.7f},
            {0.6f, 0.05f, 0.005f, 0.8f},
            {0.7f, 0.99f, 0.01f, 0.9f},
            {0.8f, 0.05f, 0.01f, 0.9f},

            // Finalize
            {0.8f, 0.30f, 0.01f, 4.0f},
            {0.9f, 1.0f, 0.001f, 4.0f},
            {1.0f, 0.0f, 0.01f, 4.0f},
        },
        time);

    const float attractiveness = params.y;
    const float typical_distance = 15.0 / std::pow(labels.size(), 0.5);
    const float exploration_length =
        std::min<float>(0.5f, params.z * 10.0 * typical_distance);
    const float weight_decay = params.w * 0.5f;

    std::normal_distribution<float> exploration(0.0, exploration_length);

    // Renormalize the positions to better fit the screen.
    //RenormalizePositions();

    // Progressively cut weight when the distance to the neighbours it too big.
    {
#pragma omp parallel for
      for (int i = 0; i < positions.size(); ++i) {
        for (auto& weight : weights[i]) {
          const glm::vec2 neighbor_position = positions[weight.user_id];
          const float d = glm::distance(positions[i], neighbor_position);
          weight.weight *= std::exp(-d * d * time_step_mul * weight_decay);
        }
      }
    }

    for (int i = 0; i < positions.size(); ++i) {
      glm::vec2& position = positions[i];
      density->Add(position, -user_repulsion[i]);

      // Compute centroid of the neighbors.
      glm::vec2 centroid(0, 0);
      float weight_sum = 0;

      for (const auto& weight : weights[i]) {
        const glm::vec2 neighbor_position = positions[weight.user_id];
        const float w = weight.weight * weight.weight;
        centroid += neighbor_position * w;
        weight_sum += w;
      }
      if (weight_sum == 0) {
        centroid = position;
      } else {
        centroid *= 1.0f / weight_sum;
      }

      position += attractiveness * (centroid - position);

      for (int i = 0; i < 2; ++i) {
        glm::vec2 new_position = position;
        new_position += (i * 0.5f) * (centroid - new_position);
        new_position +=
            glm::vec2(exploration(generator), exploration(generator));

        if (new_position.x < 0 || new_position.x > 1 ||  //
            new_position.y < 0 || new_position.y > 1) {
          continue;
        }

        float delta_energy =
            density->Get(new_position) - density->Get(position);

        if (delta_energy < 0) {
          position = new_position;
        }
      }

      density->Add(position, user_repulsion[i]);
    }

    fmt::print(
        "Iteration: {:03}/{}, Attractiveness: {:4f} Exploration: {:4f}\n",
        iteration, max_iteration, attractiveness, exploration_length);
  }
}

void MainLogic::AdjustPositions() {
  const std::vector<float> label_size = LabelSize(weights);
  // Adjust the positions, so that the label do not overlap against each
  // other.
  int iteration = 0;
  std::vector<glm::vec2> speed(positions.size(), glm::vec2(0, 0));
  std::vector<bool> inert(positions.size(), true);
  for (int iteration = 0; iteration < 300; ++iteration) {
    const float sx = 0.50f;
    const float sy = 0.28f;

#pragma omp parallel
#pragma omp for
    for (int i = 0; i < positions.size(); ++i) {
      const float a_x1 = positions[i].x - label_size[i] * labels[i].size() * sx;
      const float a_x2 = positions[i].x + label_size[i] * labels[i].size() * sx;
      const float a_y1 = positions[i].y - label_size[i] * sy;
      const float a_y2 = positions[i].y + label_size[i] * sy;
      for (int j = i + 1; j < positions.size(); ++j) {
        const float b_x1 =
            positions[j].x - label_size[j] * labels[j].size() * sx;
        const float b_x2 =
            positions[j].x + label_size[j] * labels[j].size() * sx;
        const float b_y1 = positions[j].y - label_size[j] * sy;
        const float b_y2 = positions[j].y + label_size[j] * sy;

        // Skip the one not colliding.
        if (a_x1 > b_x2 ||  //
            a_x2 < b_x1 ||  //
            a_y1 > b_y2 ||  //
            a_y2 < b_y1) {  //
          continue;
        }

        // Labels are colliding:
        inert[i] = false;
        inert[j] = false;

        // Find the direction of the minimal non-null overlap.
        const float overlap_left = std::max(0.f, b_x2 - a_x1);
        const float overlap_right = std::max(0.f, a_x2 - b_x1);
        const float overlap_top = std::max(0.f, b_y2 - a_y1);
        const float overlap_bottom = std::max(0.f, a_y2 - b_y1);

        const float overlap_min =
            std::min(std::max(overlap_left, overlap_right),
                     std::max(overlap_top, overlap_bottom));

        if (overlap_left == overlap_min) {
          speed[i].x += overlap_min * label_size[j];
          speed[j].x -= overlap_min * label_size[i];
        } else if (overlap_right == overlap_min) {
          speed[i].x -= overlap_min * label_size[j];
          speed[j].x += overlap_min * label_size[i];
        } else if (overlap_top == overlap_min) {
          speed[i].y -= overlap_min * label_size[j];
          speed[j].y += overlap_min * label_size[i];
        } else if (overlap_bottom == overlap_min) {
          speed[i].y += overlap_min * label_size[j];
          speed[j].y -= overlap_min * label_size[i];
        }
      }
    }

    // Print the percentage of inert labels.
    int inert_count = 0;
    for (int i = 0; i < positions.size(); ++i) {
      inert_count += inert[i];
    }
    fmt::print("Adjusting positions: Inert: {}/{} = {:.2f}%\n", inert_count,
               positions.size(), 100.f * inert_count / positions.size());

    // Job completed if no label are colliding anymore.
    if (inert_count == positions.size()) {
      break;
    }

#pragma omp parallel for
    for (int i = 0; i < positions.size(); ++i) {
      if (inert[i]) {
        speed[i] *= 0.f;
        continue;
      }
      positions[i] += 0.0005f * speed[i] / std::pow(label_size[i], 2.0f);
      speed[i] *= 0.90f;
      inert[i] = true;
    }
  }
}
