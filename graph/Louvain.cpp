#include "Louvain.hpp"
#include <algorithm>
#include <random>
#include <unordered_map>
#include <vector>

namespace louvain {

namespace {

std::vector<int> Shuffle(int size) {
  static std::mt19937 generator;
  std::vector<int> out(size);
  for (int i = 0; i < size; i++) {
    out[i] = i;
  }
  std::shuffle(out.begin(), out.end(), generator);
  return out;
}

}  // namespace

Graph Louvain(Graph& input) {
  const size_t node_count = input.size();

  const int total_weight = [&]() {
    int out = 0;
    for (const Node& node : input) {
      out += node.degree;
      out += node.self_loop;
    }
    return out;
  }();

  // Map every node to its own community. Initially, every node belong to its
  // own individual community.
  std::vector<int> node_community(node_count);
  std::vector<int> community_degree(node_count);
  for (size_t i = 0; i < node_count; i++) {
    node_community[i] = i;
    community_degree[i] = input[i].degree;
  }

  std::vector<int> random_order = Shuffle(node_count);
  for (int iteration = 0; iteration < 10; iteration++) {
    int changed = 0;
    for (int pos : random_order) {
      const Node& node = input[pos];
      const int old_community = node_community[pos];

      // Calculating Neighbor Communities.
      std::vector<int> neighbours_link(node_count, 0);
      std::vector<int> neighbours_community;
      for (auto& [to_node, weight] : node.neighbors) {
        const int to_community = node_community[to_node];
        if (neighbours_link[to_community] <= 0) {
          neighbours_community.emplace_back(to_community);
        }

        neighbours_link[to_community] += weight;
      }

      // The change in modularity is calculated for removing node from its own
      // community and moving it into the community of each neighbor. We select
      // the move that produces the maximum increase in modularity.
      int best_community = old_community;
      float delta_best = 0.f;
      for (int community : neighbours_community) {
        if (community == old_community) {
          continue;
        }
        const float delta = float(neighbours_link[community]) * total_weight -
                            float(community_degree[community]) * node.degree;

        if (delta > delta_best) {
          delta_best = delta;
          best_community = community;
        }
      }

      // If the best community is the current community, skip.
      if (best_community == old_community) {
        continue;
      }

      // Insert to the best community.
      node_community[pos] = best_community;
      community_degree[old_community] -= node.degree;
      community_degree[best_community] += node.degree;

      changed++;
    }

    if (changed == 0) {
      break;
    }
  }

  // Compute the new graph:
  Graph communities;
  std::vector<int> community_original_index;
  std::vector<int> community_index_new(node_count, -1);
  for (size_t i = 0; i < node_count; i++) {
    const int old_index = node_community[i];
    int& c = community_index_new[old_index];

    // Create a new community if it doesn't exist.
    if (c == -1) {
      community_original_index.emplace_back(old_index);
      communities.emplace_back();
      c = communities.size() - 1;
    }

    // Add the child to the community.
    input[i].parent = c;
    communities[c].children.emplace_back(i);
    communities[c].self_loop += input[i].self_loop;
    communities[c].degree += input[i].self_loop;
  }

  // Compute the neighbors of every node of the community:
  for (size_t c = 0; c < communities.size(); c++) {
    Node& community = communities[c];

    std::unordered_map<int, int> communities_link;
    for (int children_index : community.children) {
      Node& child = input[children_index];
      for (const auto& [other_index, weight] : child.neighbors) {
        const int other_community = node_community[other_index];
        community.degree += weight;
        if (other_community == community_original_index[c]) {
          community.self_loop += weight;
        } else {
          communities_link[community_index_new[other_community]] += weight;
        }
      }
    }
    community.neighbors.insert(community.neighbors.begin(),
                               communities_link.begin(),
                               communities_link.end());
  }

  return communities;
}

}  // namespace louvain
