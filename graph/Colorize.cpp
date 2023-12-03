#include "Colorize.hpp"
#include "Louvain.hpp"
#include "fmt/format.h"

void Colorize(const std::vector<std::vector<Weight>>& weights,
              std::vector<float>& colors) {
  std::vector<louvain::Node> persons(weights.size());
  std::mt19937 mt((std::random_device()()));

  // Add the edges
  for (int i = 0; i < weights.size(); ++i) {
    for (const auto& weight : weights[i]) {
      persons[i].degree += weight.weight;
      persons[i].neighbors.push_back({
          weight.user_id,
          weight.weight,
      });
    }
  }

  // Colorize hierarchically:
  std::vector<louvain::Graph> graphs = {persons};
  for (int i = 0; i < 1000; ++i) {
    const size_t previous_size = graphs.back().size();

    graphs.push_back(Louvain(graphs.back()));

    const size_t new_size = graphs.back().size();
    fmt::print("Louvain: Iteration {}, size {} -> {}\n", i, previous_size,
               new_size);

    // Exit if it converged
    if (previous_size == new_size) {
      break;
    }

    // Exit if the number of groups is already too low.
    if (new_size * 200 < weights.size()) {
      break;
    }
  }

  // Print the number of clusters:
  fmt::print("Number of clusters: {}\n", graphs.back().size());

  // Assign colors to every node, based on the top-level cluster they belong to.
  for (int i = 0; i < weights.size(); ++i) {
    int cluster = i;
    for (int g = 0; g < graphs.size() - 1; ++g) {
      cluster = graphs[g][cluster].parent;
    }
    colors[i] = float(cluster) / float(graphs.back().size());
  }
}
