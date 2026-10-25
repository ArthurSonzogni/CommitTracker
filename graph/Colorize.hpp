#ifndef CLUSTERING_HPP
#define CLUSTERING_HPP

#include <vector>
#include "Weight.hpp"

// From the `weights` of the graph, assign a color to each node, representing
// the different communities.
// `clusters` receives the index of the community of each node, among `target`
// communities.
void Colorize(const std::vector<std::vector<Weight>>& weights,
              std::vector<float>& colors,
              std::vector<int>& clusters,
              int target);

#endif /* CLUSTERING_HPP */
