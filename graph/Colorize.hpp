#ifndef CLUSTERING_HPP
#define CLUSTERING_HPP

#include <vector>
#include "Weight.hpp"

// From the `weights` of the graph, assign a color to each node, representing
// the different communities.
void Colorize(const std::vector<std::vector<Weight>>& weights,
              std::vector<float>& colors);

#endif /* CLUSTERING_HPP */
