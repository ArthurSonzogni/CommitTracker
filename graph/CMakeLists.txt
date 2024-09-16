cmake_minimum_required(VERSION 3.12)

project(chromium-commit-tracker-graph
  LANGUAGES CXX
  VERSION 1.0.0
  DESCRIPTION "C++ large graph generation"
  )

#add_compile_options(-fsanitize=address)
#add_link_options(-fsanitize=address)

add_executable(generate
    Colorize.cpp
    Colorize.hpp
    DensityGrid.cpp
    DensityGrid.hpp
    MainLogic.cpp
    MainLogic.hpp
    ReadCSV.cpp
    ReadCSV.hpp
    Render.cpp
    Render.hpp
    Weight.hpp
    Louvain.cpp
    Louvain.hpp
    main.cpp
  )

target_compile_features(generate PUBLIC cxx_std_17)
target_include_directories(generate PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/src)

find_package(OpenMP)
if(OpenMP_CXX_FOUND)
  target_link_libraries(generate PUBLIC OpenMP::OpenMP_CXX)
  message(STATUS "OpenMP found")
else()
  message(STATUS "OpenMP not found")
endif()

set(FETCHCONTENT_UPDATES_DISCONNECTED TRUE)
include(FetchContent)

# ftm library ------------------------------------------------------------------
FetchContent_Declare(
  fmt
  GIT_REPOSITORY  https://github.com/fmtlib/fmt.git
  GIT_TAG         8.0.1
  GIT_PROGRESS    TRUE
  USES_TERMINAL_DOWNLOAD TRUE
  )
FetchContent_MakeAvailable(fmt)
target_link_libraries(generate PRIVATE fmt::fmt)

# glm library ------------------------------------------------------------------
FetchContent_Declare(
  glm
  GIT_REPOSITORY https://github.com/g-truc/glm
  GIT_TAG 0.9.9.8
  GIT_PROGRESS TRUE
  USES_TERMINAL_DOWNLOAD TRUE
  )
FetchContent_MakeAvailable(glm)
target_link_libraries(generate PRIVATE glm::glm)
