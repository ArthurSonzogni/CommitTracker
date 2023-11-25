#include "Render.hpp"
#include <fmt/core.h>
#include <fmt/format.h>
#include <fmt/ostream.h>
#include <fstream>

void Render(DensityGrid* density_grid,
            const std::vector<std::string>& labels,
            const std::vector<glm::vec2>& positions,
            const std::vector<float>& label_size,
            const std::vector<float>& colors,
            const std::vector<std::vector<Weight>>& edge_thickness,
            const std::string& filename) {
  // Output the result.
  std::ofstream output(filename);
  fmt::print(output, R"(<svg )");
  fmt::print(output, R"(width="{}" height="{}")", 4000, 2000);
  fmt::print(output, R"( viewBox="{} {} {} {}")", -0.025, -0.025, 2.05, 1.05);
  fmt::print(output, R"( xmlns="http://www.w3.org/2000/svg">)");
  fmt::print(output, R"(
  <style>
    path {{
      fill: none;
      stroke-linecap: round;
      stroke-opacity: 0.4;
    }}

    text {{
      text-anchor: middle;
      alignment-baseline: hanging;
    }}
  </style>
  )");

  // Draw the density map using rectangles.
  // for (float x = 0.0; x < 1.0; x += 0.01) {
  // for (float y = 0.0; y < 1.0; y += 0.01) {
  // float density =
  // std::max(0.f, std::min(density_grid->Get(glm::vec2(x, y)) * 0.1f, 1.f));
  // output << fmt::format(
  // R"(<rect x="{}" y="{}" width="{}" height="{}" fill="black"
  // opacity="{}"/>)",
  // x * 2, y, 0.01 * 2, 0.01, density);
  //}
  //}

  // Wrap edges as a transparent background
  output << R"(<g opacity="0.4">)" << std::endl;

  // Draw curved edges:
  for (int i = 0; i < labels.size(); ++i) {
    for (const auto& weight : edge_thickness[i]) {
      const int j = weight.user_id;
      glm::vec2 a = positions[i] + glm::vec2(0.f, label_size[i] / 2.f);
      glm::vec2 b = positions[j] + glm::vec2(0.f, label_size[j] / 2.f);
      glm::vec2 diff = b - a;
      glm::vec2 normal(-diff.y, diff.x);

      glm::vec2 middle = (a + b) / 2.f + 0.4f * normal;
      // glm::vec2 start = a + label_size[i] * glm::normalize(middle - a);
      // glm::vec2 end = b + label_size[j] * glm::normalize(middle - b);
      glm::vec2 start = a;
      glm::vec2 end = b;

      const float thickness = weight.weight;

      // Malus for long distance edges. They don't bring much informations.
      const float distance = glm::length(diff);
      const float typical_distance = 15.0 / std::pow(labels.size(), 0.5);
      const float malus =
          1.0 / (1.0 + std::pow(distance / typical_distance, 3));

      if (thickness * malus < 0.00013) {
        continue;
      }

      // float color = int(colors[i] * 111234) % 360;
      float color = int(colors[i] * 360);

      output << fmt::format(
                    R"(<path )"
                    R"(d="M{:.3f} {:.3f} Q{:.3f} {:.3f} {:.3f} {:.3f}" )"
                    R"_(stroke="hsl({:.1f},100%,35%)" )_"
                    R"(stroke-width="{:.5f}")"
                    R"(></path>)",
                    2.0 * start.x, start.y,    //
                    2.0 * middle.x, middle.y,  //
                    2.0 * end.x, end.y, color, thickness)
             << std::endl;
    }
  }

  output << R"(</g>)" << std::endl;

  // Draw the nodes:
  for (int i = 0; i < labels.size(); ++i) {
    // float color = int(colors[i] * 111234) % 360;
    float color = int(colors[i] * 360);

    output << fmt::format(R"(<text x="{:.3f}" y="{:.3f}" )"
                          R"(font-size="{:6f}" )"
                          R"_(fill="hsl({:.1f},100%,20%)")_"
                          R"(>{})"
                          R"(</text>)",
                          2.0 * positions[i].x, positions[i].y, label_size[i],
                          color, labels[i])
           << std::endl;
  }

  output << R"(</svg>)" << std::endl;
}
