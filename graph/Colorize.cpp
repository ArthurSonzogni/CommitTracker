#include "Colorize.hpp"
#include "Louvain.hpp"

#include <algorithm>
#include <format>
#include <iostream>
#include <limits>
#include <tuple>
#include <unordered_map>
#include <utility>

namespace {

// The number of clusters with at least `min_size` nodes.
int CountLarge(const std::vector<int>& clusters, int count, int min_size) {
  std::vector<int> size(count, 0);
  for (int cluster : clusters) {
    size[cluster]++;
  }
  return std::count_if(size.begin(), size.end(),
                       [&](int s) { return s >= min_size; });
}

// Merges the clusters two by two until `target` clusters with at least
// `min_size` nodes remain, picking each time the pair whose merge increases the
// modularity the most. Clusters are then renumbered from 0.
void MergeClusters(const std::vector<std::vector<Weight>>& weights,
                   int count,
                   int target,
                   int min_size,
                   std::vector<int>& clusters) {
  std::vector<int> size(count, 0);
  for (int cluster : clusters) {
    size[cluster]++;
  }
  int large = CountLarge(clusters, count, min_size);

  // The weight between clusters, and the total weight of their edges.
  std::vector<std::unordered_map<int, double>> between(count);
  std::vector<double> degree(count, 0.0);
  double total = 0.0;
  for (int i = 0; i < weights.size(); ++i) {
    for (const auto& weight : weights[i]) {
      const int a = clusters[i];
      const int b = clusters[weight.user_id];
      degree[a] += weight.weight;
      total += weight.weight;
      if (a != b) {
        between[a][b] += weight.weight;
      }
    }
  }
  if (total == 0.0) {
    return;
  }

  // The cluster each cluster has been merged into, if any.
  std::vector<int> merged_into(count, -1);
  // Which pairs can be merged:
  // - With too many large clusters: any.
  // - With too few: two small ones, to form a new large one.
  // - Otherwise, or when no two small ones can be merged: a small one into
  //   any. Merging two large clusters would leave too few.
  const auto best_pair = [&](bool any, bool small_only) {
    std::pair<int, int> best = {-1, -1};
    double best_gain = -std::numeric_limits<double>::infinity();
    for (int a = 0; a < count; ++a) {
      if (merged_into[a] != -1) {
        continue;
      }
      for (const auto& [b, w] : between[a]) {
        const int large_count = (size[a] >= min_size) + (size[b] >= min_size);
        if (b < a || (!any && large_count > (small_only ? 0 : 1))) {
          continue;
        }
        const double gain =
            w / total - 2.0 * degree[a] * degree[b] / (total * total);
        if (gain > best_gain) {
          best = {a, b};
          best_gain = gain;
        }
      }
    }
    return best;
  };

  for (;;) {
    const bool only_small = large <= target;
    auto [best_a, best_b] = best_pair(large > target, large < target);
    if (best_a == -1 && large < target) {
      std::tie(best_a, best_b) = best_pair(false, false);
    }

    // Disconnected clusters: merge the two smallest, unless the target is
    // reached. Small disconnected clusters are kept apart.
    if (best_a == -1) {
      if (only_small) {
        break;
      }
      for (int a = 0; a < count; ++a) {
        if (merged_into[a] != -1) {
          continue;
        }
        if (best_a == -1 || degree[a] < degree[best_a]) {
          best_b = best_a;
          best_a = a;
        } else if (best_b == -1 || degree[a] < degree[best_b]) {
          best_b = a;
        }
      }
      if (best_b == -1) {
        break;
      }
    }

    // Merge b into a.
    const int a = best_a;
    const int b = best_b;
    merged_into[b] = a;
    large -= (size[a] >= min_size) + (size[b] >= min_size);
    size[a] += size[b];
    large += size[a] >= min_size;
    degree[a] += degree[b];
    for (const auto& [c, w] : between[b]) {
      if (c == a) {
        continue;
      }
      between[a][c] += w;
      between[c][a] += w;
      between[c].erase(b);
    }
    between[a].erase(b);
    between[b].clear();
  }

  // Renumber the clusters.
  std::vector<int> id(count, -1);
  int next = 0;
  for (int& cluster : clusters) {
    while (merged_into[cluster] != -1) {
      cluster = merged_into[cluster];
    }
    if (id[cluster] == -1) {
      id[cluster] = next++;
    }
  }
  for (int& cluster : clusters) {
    while (merged_into[cluster] != -1) {
      cluster = merged_into[cluster];
    }
    cluster = id[cluster];
  }
}

}  // namespace

void Colorize(const std::vector<std::vector<Weight>>& weights,
              std::vector<float>& colors,
              std::vector<int>& clusters,
              int target) {
  std::vector<louvain::Node> persons(weights.size());

  // Add the edges
  for (int i = 0; i < weights.size(); ++i) {
    for (const auto& weight : weights[i]) {
      persons[i].degree += weight.weight;
      persons[i].neighbors.push_back({
          weight.user_id,
          static_cast<int>(weight.weight),
      });
    }
  }

  // Colorize hierarchically:
  std::vector<louvain::Graph> graphs = {persons};
  for (int i = 0; i < 1000; ++i) {
    const size_t previous_size = graphs.back().size();

    graphs.push_back(Louvain(graphs.back()));

    const size_t new_size = graphs.back().size();
    std::cout << std::format("Louvain: Iteration {}, size {} -> {}\n", i,
                             previous_size, new_size);

    // Exit if it converged
    if (previous_size == new_size) {
      break;
    }
  }

  // Print the number of clusters:
  std::cout << std::format("Number of clusters: {}\n", graphs.back().size());

  // Assign colors to every node, based on the top-level cluster they belong to.
  for (int i = 0; i < weights.size(); ++i) {
    int cluster = i;
    for (int g = 0; g < graphs.size() - 1; ++g) {
      cluster = graphs[g][cluster].parent;
    }
    colors[i] = float(cluster) / float(graphs.back().size());
  }

  // Small clusters, often disconnected from the rest, don't count toward the
  // target.
  const int min_size = std::max<int>(5, weights.size() / 50);
  const auto clusters_at = [&](int level) {
    std::vector<int> out(weights.size());
    for (int i = 0; i < weights.size(); ++i) {
      int cluster = i;
      for (int g = 0; g < level; ++g) {
        cluster = graphs[g][cluster].parent;
      }
      out[i] = cluster;
    }
    return out;
  };

  // The top-level clusters are too large to be meaningful. Start from the
  // coarsest level with at least `target` large clusters (or else from the
  // individual nodes), and merge them down to `target`.
  int level = 0;
  for (int g = graphs.size() - 1; g >= 1; --g) {
    if (CountLarge(clusters_at(g), graphs[g].size(), min_size) >= target) {
      level = g;
      break;
    }
  }
  clusters = clusters_at(level);
  MergeClusters(weights, graphs[level].size(), target, min_size, clusters);
}
