#include "MainLogic.hpp"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <format>
#include <fstream>
#include <iostream>
#include <map>
#include <memory>
#include <random>
#include <string>
#include <vector>
#include "Colorize.hpp"
#include "DensityGrid.hpp"
#include "ReadCSV.hpp"
#include "Render.hpp"
#include "Vec.hpp"
#include "Weight.hpp"

namespace {

// Filter out users with invalid characters. Those characters might corrupt the
// SVG document.
bool FilterUserName(const std::string& user) {
  return std::any_of(user.begin(), user.end(), [](char c) {
    return c == '<' || c == '>' || c == ',' || c < 0;
  });
}

// Initial positions: each node is placed randomly around the position of its
// community. Communities are laid out with a small force-directed layout of the
// community graph, so that close communities start next to each other.
std::vector<Vec2> CommunityPositions(
    const std::vector<std::vector<Weight>>& weights,
    const std::vector<int>& clusters) {
  const int count = *std::max_element(clusters.begin(), clusters.end()) + 1;

  // The weight between communities, and their size.
  std::vector<std::vector<float>> between(count, std::vector<float>(count, 0));
  std::vector<float> size(count, 0);
  for (int i = 0; i < weights.size(); ++i) {
    size[clusters[i]] += 1;
    for (const auto& weight : weights[i]) {
      between[clusters[i]][clusters[weight.user_id]] += weight.weight;
    }
  }
  float max_between = 0;
  for (int a = 0; a < count; ++a) {
    for (int b = 0; b < count; ++b) {
      if (a != b) {
        max_between = std::max(max_between, between[a][b]);
      }
    }
  }

  std::mt19937 generator(42);
  std::uniform_real_distribution<float> uniform(0, 1);
  std::vector<Vec2> center(count);
  for (auto& c : center) {
    c = {uniform(generator), uniform(generator)};
  }
  for (int iteration = 0; iteration < 500; ++iteration) {
    const float step = 0.05f * (1.f - iteration / 500.f);
    std::vector<Vec2> force(count, Vec2(0.f));
    for (int a = 0; a < count; ++a) {
      for (int b = 0; b < count; ++b) {
        if (a == b) {
          continue;
        }
        Vec2 diff = center[b] - center[a];
        const float d = std::max(0.01f, Length(diff));
        diff /= d;
        // Repulsion between all communities, attraction between linked ones.
        force[a] -=
            diff * 0.02f / (d * d) * std::sqrt(size[b] / weights.size());
        if (max_between > 0) {
          force[a] += diff * d * between[a][b] / max_between;
        }
      }
    }
    for (int a = 0; a < count; ++a) {
      const float length = Length(force[a]);
      if (length > 0) {
        center[a] += force[a] / length * std::min(length, 1.f) * step;
      }
      center[a] = Clamp(center[a], Vec2(0.15f), Vec2(0.85f));
    }
  }

  std::normal_distribution<float> jitter(0.0, 0.05);
  std::vector<Vec2> positions(weights.size());
  for (int i = 0; i < weights.size(); ++i) {
    positions[i] =
        Clamp(center[clusters[i]] + Vec2(jitter(generator), jitter(generator)),
              Vec2(0.f), Vec2(1.f));
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

Vec4 Interpolate(const std::vector<Vec4>& values, float time) {
  if (values.size() == 1) {
    return values.front();
  }

  // Find the two values to interpolate between.
  size_t i = 0;
  while (i + 2 < values.size() && values[i + 1].x < time) {
    ++i;
  }

  const float span = values[i + 1].x - values[i].x;
  if (span == 0.f) {
    return values[i + 1];
  }

  // Interpolate between the two values.
  const float t = (time - values[i].x) / span;
  return Mix(values[i], values[i + 1], t);
}

std::unique_ptr<DensityGrid> InitializeDensity(
    const std::vector<Vec2>& positions,
    const std::vector<float>& repulsion) {
  auto density = std::make_unique<DensityGrid>(repulsion.size());
  for (int i = 0; i < repulsion.size(); ++i) {
    density->Add(positions[i], repulsion[i]);
  }
  return density;
}

}  // namespace

void MainLogic::CreateUser(const std::string& user) {
  users_id[user] = labels.size();
  labels.push_back(user);
  weights.push_back({});
  weights_incoming.push_back({});
  colors.push_back(0.f);
  clusters.push_back(0);
}

int MainLogic::AddUser(const std::string& user) {
  if (users_id.find(user) == users_id.end()) {
    CreateUser(user);
  }

  return users_id[user];
}

int MainLogic::Main(const std::string& input,
                    const std::string& output,
                    int community_count) {
  ReadCSV(input, [this](std::vector<std::string> row) {
    if (row.size() != 3) {
      return;
    }
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

  Colorize(weights, colors, clusters, community_count);
  positions = CommunityPositions(weights, clusters);
  user_repulsion = UserRepulsions(weights);
  density = InitializeDensity(positions, user_repulsion);

  Planarize();
  AdjustPositions();
  const auto edge_thickness = EdgesThickness(weights_incoming);
  Render(density.get(), labels, positions, label_size, colors, edge_thickness,
         output);

  const std::string json_output = output.substr(0, output.rfind('.')) + ".json";
  RenderJSON(labels, positions, label_size, clusters, edge_thickness,
             json_output);

  return 0;
}

// How much the members of a community are pulled toward its center, relative
// to the pull toward their neighbors.
constexpr float kCommunityCohesion = 0.3f;

void MainLogic::Planarize() {
  // Initialize the random generator from a known seed, so that the results are
  // reproducible.
  std::mt19937 generator(42);

  const int max_iteration = 100;
  for (int iteration = 0; iteration < max_iteration; ++iteration) {
    const float time = (iteration + 1) / float(max_iteration);

    const auto params = Interpolate(
        {
            // Initial contractions
            {0.0f, 1.0f, 0.000f, 0.00f},
            {0.1f, 1.0f, 0.1f, 0.0f},
            {0.1f, 0.99f, 0.005f, 0.0f},
            {0.2f, 0.05f, 0.005f, 0.0f},

            // Alternate phase of contractions and expansions.
            {0.3f, 0.99f, 0.005f, 0.5f},
            {0.4f, 0.05f, 0.005f, 0.6f},
            {0.5f, 0.99f, 0.005f, 0.7f},
            {0.6f, 0.05f, 0.005f, 0.8f},
            {0.7f, 0.99f, 0.01f, 0.9f},
            {0.8f, 0.05f, 0.01f, 0.9f},

            // Finalize
            {0.8f, 0.30f, 0.003f, 4.0f},
            {0.9f, 0.20f, 0.001f, 4.0f},
            {1.0f, 0.10f, 0.002f, 4.0f},
        },
        time);

    const float attractiveness = params.y;
    const float typical_distance = 15.0 / std::pow(labels.size(), 0.5);
    const float exploration_length =
        std::min<float>(0.5f, params.z * 10.0 * typical_distance);
    const float weight_decay = params.w * 0.5f;

    std::normal_distribution<float> exploration(0.0, exploration_length);

    // Progressively cut weight when the distance to the neighbours is too big.
    {
#pragma omp parallel for
      for (int i = 0; i < positions.size(); ++i) {
        for (auto& weight : weights[i]) {
          const Vec2 neighbor_position = positions[weight.user_id];
          const float d = Distance(positions[i], neighbor_position);
          weight.weight *= std::exp(-d * d * weight_decay);
        }
      }
    }

    // The center of each community, to keep them together.
    std::vector<Vec2> community_center;
    {
      std::vector<float> community_weight;
      for (int i = 0; i < positions.size(); ++i) {
        const int c = clusters[i];
        if (c >= community_center.size()) {
          community_center.resize(c + 1, Vec2(0.f));
          community_weight.resize(c + 1, 0.f);
        }
        community_center[c] += positions[i];
        community_weight[c] += 1.f;
      }
      for (int c = 0; c < community_center.size(); ++c) {
        if (community_weight[c] > 0.f) {
          community_center[c] /= community_weight[c];
        }
      }
    }

    for (int i = 0; i < positions.size(); ++i) {
      Vec2& position = positions[i];
      density->Add(position, -user_repulsion[i]);

      // Compute centroid of the neighbors.
      Vec2 centroid(0, 0);
      float weight_sum = 0;

      for (const auto& weight : weights[i]) {
        const Vec2 neighbor_position = positions[weight.user_id];
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
      position += std::min(1.f, kCommunityCohesion * attractiveness) *
                  (community_center[clusters[i]] - position);
      position = Clamp(position, Vec2(0.f), Vec2(1.f));

      for (int attempt = 0; attempt < 2; ++attempt) {
        Vec2 new_position = position;
        new_position += Vec2(exploration(generator), exploration(generator));

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

    std::cout << std::format(
        "Iteration: {:03}/{}, Attractiveness: {:4f} Exploration: {:4f}\n",
        iteration, max_iteration, attractiveness, exploration_length);
  }
}

void MainLogic::AdjustPositions() {
  const std::vector<float> label_size = LabelSize(weights);
  // Adjust the positions, so that the labels do not overlap against each
  // other.
  std::vector<Vec2> speed(positions.size(), Vec2(0.f, 0.f));
  std::vector<uint8_t> inert(positions.size(), 1);
  for (int iteration = 0; iteration < 300; ++iteration) {
    const float sx = 0.50f;
    const float sy = 0.28f;

#pragma omp parallel for
    for (int i = 0; i < positions.size(); ++i) {
      const float a_x1 = positions[i].x - label_size[i] * labels[i].size() * sx;
      const float a_x2 = positions[i].x + label_size[i] * labels[i].size() * sx;
      const float a_y1 = positions[i].y - label_size[i] * sy;
      const float a_y2 = positions[i].y + label_size[i] * sy;
      for (int j = 0; j < positions.size(); ++j) {
        if (i == j) {
          continue;
        }
        const float b_x1 =
            positions[j].x - label_size[j] * labels[j].size() * sx;
        const float b_x2 =
            positions[j].x + label_size[j] * labels[j].size() * sx;
        const float b_y1 = positions[j].y - label_size[j] * sy;
        const float b_y2 = positions[j].y + label_size[j] * sy;

        // Skip boxes that are not colliding.
        if (a_x1 > b_x2 ||  //
            a_x2 < b_x1 ||  //
            a_y1 > b_y2 ||  //
            a_y2 < b_y1) {  //
          continue;
        }

        // Labels are colliding:
        inert[i] = 0;

        // Minimum Translation Vector (MTV) along X and Y to push `i` away from
        // `j`.
        const float dx_right = b_x2 - a_x1;
        const float dx_left = a_x2 - b_x1;
        const float ox = std::min(dx_right, dx_left);

        const float dy_down = b_y2 - a_y1;
        const float dy_up = a_y2 - b_y1;
        const float oy = std::min(dy_down, dy_up);

        if (ox < oy) {
          speed[i].x += (dx_right < dx_left ? ox : -ox) * 0.002f;
        } else {
          speed[i].y += (dy_down < dy_up ? oy : -oy) * 0.002f;
        }
      }
    }

    // Print the percentage of inert labels.
    int inert_count = 0;
    for (int i = 0; i < positions.size(); ++i) {
      inert_count += inert[i];
    }
    std::cout << std::format("Adjusting positions: Inert: {}/{} = {:.2f}%\n",
                             inert_count, positions.size(),
                             100.f * inert_count / positions.size());

    // Job completed if no labels are colliding anymore.
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
      // Stay within the drawing.
      positions[i] = Clamp(positions[i], Vec2(0.f), Vec2(1.f));
      speed[i] *= 0.90f;
      inert[i] = 1;
    }
  }
}
