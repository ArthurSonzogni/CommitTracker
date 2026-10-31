#include "Render.hpp"
#include <cmath>
#include <format>
#include <fstream>
#include <string>

namespace {

// Long distance edges with a low weight are not drawn. They don't bring much
// information.
bool IsEdgeVisible(const std::vector<Vec2>& positions,
                   size_t node_count,
                   int i,
                   int j,
                   float thickness) {
  const float distance = Distance(positions[i], positions[j]);
  const float typical_distance = 15.0 / std::pow(node_count, 0.5);
  const float malus = 1.0 / (1.0 + std::pow(distance / typical_distance, 3));
  return thickness * malus >= 0.00013;
}

std::string EscapeXML(const std::string& text) {
  std::string out;
  out.reserve(text.size());
  for (char c : text) {
    switch (c) {
      case '&':
        out += "&amp;";
        break;
      case '"':
        out += "&quot;";
        break;
      case '<':
        out += "&lt;";
        break;
      case '>':
        out += "&gt;";
        break;
      default:
        out += c;
        break;
    }
  }
  return out;
}

std::string EscapeJSON(const std::string& text) {
  std::string out;
  out.reserve(text.size());
  for (char c : text) {
    const auto uc = static_cast<unsigned char>(c);
    if (c == '"' || c == '\\') {
      out += '\\';
      out += c;
    } else if (uc < 0x20) {
      out += std::format("\\u{:04x}", uc);
    } else {
      out += c;
    }
  }
  return out;
}

}  // namespace

void Render(DensityGrid* /*density_grid*/,
            const std::vector<std::string>& labels,
            const std::vector<Vec2>& positions,
            const std::vector<float>& label_size,
            const std::vector<float>& colors,
            const std::vector<std::vector<Weight>>& edge_thickness,
            const std::string& filename) {
  // Output the result.
  std::ofstream output(filename);
  output << std::format(R"(<svg width="{}" height="{}" viewBox="{} {} {} {}" )",
                        4000, 2000, -0.025, -0.025, 2.05, 1.05);
  output << R"(xmlns="http://www.w3.org/2000/svg">)"
            R"(
  <style>
    path {
      fill: none;
      stroke-linecap: round;
      stroke-opacity: 0.4;
    }

    text {
      text-anchor: middle;
      alignment-baseline: hanging;
    }
  </style>
  )";

  // Wrap edges as a transparent background
  output << R"(<g opacity="0.4">)" << '\n';

  // Draw curved edges:
  for (int i = 0; i < labels.size(); ++i) {
    for (const auto& weight : edge_thickness[i]) {
      const int j = weight.user_id;
      Vec2 a = positions[i] + Vec2(0.f, label_size[i] / 2.f);
      Vec2 b = positions[j] + Vec2(0.f, label_size[j] / 2.f);
      Vec2 diff = b - a;
      Vec2 normal(-diff.y, diff.x);

      Vec2 middle = (a + b) / 2.f + 0.4f * normal;
      Vec2 start = a;
      Vec2 end = b;

      const float thickness = weight.weight;
      if (!IsEdgeVisible(positions, labels.size(), i, j, thickness)) {
        continue;
      }

      float color = int(colors[i] * 360);

      output << std::format(
                    R"(<path )"
                    R"(d="M{:.3f} {:.3f} Q{:.3f} {:.3f} {:.3f} {:.3f}" )"
                    R"_(stroke="hsl({:.1f},100%,35%)" )_"
                    R"(stroke-width="{:.5f}")"
                    R"(></path>)",
                    2.0 * start.x, start.y,    //
                    2.0 * middle.x, middle.y,  //
                    2.0 * end.x, end.y, color, thickness)
             << '\n';
    }
  }

  output << R"(</g>)" << '\n';

  // Draw the nodes:
  for (int i = 0; i < labels.size(); ++i) {
    float color = int(colors[i] * 360);

    output << std::format(R"(<text x="{:.3f}" y="{:.3f}" )"
                          R"(font-size="{:6f}" )"
                          R"_(fill="hsl({:.1f},100%,20%)")_"
                          R"(>{})"
                          R"(</text>)",
                          2.0 * positions[i].x, positions[i].y, label_size[i],
                          color, EscapeXML(labels[i]))
           << '\n';
  }

  output << R"(</svg>)" << '\n';
}

void RenderJSON(const std::vector<std::string>& labels,
                const std::vector<Vec2>& positions,
                const std::vector<float>& label_size,
                const std::vector<int>& clusters,
                const std::vector<std::vector<Weight>>& edge_thickness,
                const std::string& filename) {
  std::ofstream output(filename);
  output << R"({"nodes":[)";
  for (int i = 0; i < labels.size(); ++i) {
    output << std::format(R"({}["{}",{:.4f},{:.4f},{:.5f},{}])", i ? "," : "",
                          EscapeJSON(labels[i]), 2.0 * positions[i].x,
                          positions[i].y, label_size[i], clusters[i]);
  }
  output << R"(],"edges":[)";
  bool first = true;
  for (int i = 0; i < labels.size(); ++i) {
    for (const auto& weight : edge_thickness[i]) {
      if (!IsEdgeVisible(positions, labels.size(), i, weight.user_id,
                         weight.weight)) {
        continue;
      }
      output << std::format("{}[{},{},{:.5f}]", first ? "" : ",", i,
                            weight.user_id, weight.weight);
      first = false;
    }
  }
  output << "]}\n";
}
