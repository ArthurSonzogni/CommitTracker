cmake_minimum_required(VERSION 3.12)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

project(chromium-commit-tracker-graph
  LANGUAGES CXX
  VERSION 1.0.0
  DESCRIPTION "C++ large graph generation"
  )

add_executable(generate
    Colorize.cpp
    Colorize.hpp
    DensityGrid.cpp
    DensityGrid.hpp
    Louvain.cpp
    Louvain.hpp
    MainLogic.cpp
    MainLogic.hpp
    ReadCSV.cpp
    ReadCSV.hpp
    Render.cpp
    Render.hpp
    Vec.hpp
    Weight.hpp
    main.cpp
  )

target_compile_features(generate PUBLIC cxx_std_20)

find_package(OpenMP)
if(OpenMP_CXX_FOUND)
  target_link_libraries(generate PUBLIC OpenMP::OpenMP_CXX)
  message(STATUS "OpenMP found")
else()
  message(STATUS "OpenMP not found")
endif()
