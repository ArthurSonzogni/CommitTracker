#ifndef LOUVAIN_HPP
#define LOUVAIN_HPP

#include <algorithm>
#include <random>
#include <unordered_map>
#include <vector>

// Algorithm to find communities in a graph.
// For reference: https://en.wikipedia.org/wiki/Louvain_method
namespace louvain {

struct Node {
  // The degree of the node. This is the sum of the weights of the edges of the
  // node.
  int degree = 0;

  // The number of self loops of the node.
  int self_loop = 0;

  // The neighbors of the node. Each neighbor is represented by a pair of the
  // index of the neighbor and the weight of the edge between the node and the
  // neighbor.
  std::vector<std::pair<int, int>> neighbors;

  // The index in the parent graph of the node representing the community this
  // node belongs to. This is updated after calling `Louvain`.
  int parent = -1;

  // The indexes in the child graph of the nodes that belong to this community.
  std::vector<int> children;
};

using Graph = std::vector<Node>;

// This function is the main function of the Louvain algorithm. It takes a graph
// as input and returns a "parent" graph as output. The parent graph is a graph
// where each node is a community of the input graph. The weight of each node is
// the sum of the weights of the nodes of the input graph that are in the same
// community. The weight of each edge is the sum of the weights of the edges of
// the input graph that are between the two communities.
Graph Louvain(Graph& input);

}  // namespace louvain

#endif /* GRAPH_HPP_ */
