#ifndef RENDER_HPP_
#define RENDER_HPP_

#include <functional>
#include <glm/glm.hpp>
#include <string>
#include <vector>
#include "DensityGrid.hpp"
#include "Weight.hpp"

void Render(DensityGrid* density_grid,
            const std::vector<std::string>& labels,
            const std::vector<glm::vec2>& positions,
            const std::vector<float>& label_size,
            const std::vector<float>& colors,
            const std::vector<std::vector<Weight>>& edge_thickness,
            const std::string& filename);

#endif /* RENDER_HPP_ */
