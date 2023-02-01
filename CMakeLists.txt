cmake_minimum_required (VERSION 3.15)

# --- Fetch FTXUI --------------------------------------------------------------
include(FetchContent)
set(FETCHCONTENT_UPDATES_DISCONNECTED TRUE)
set(FETCHCONTENT_QUIET FALSE)

FetchContent_Declare(subprocess
  GIT_REPOSITORY https://github.com/benman64/subprocess
  GIT_TAG e1cae5e86e5d089e65e906f7c13917b7bbb75d04
  GIT_PROGRESS TRUE
  GIT_SHALLOW FALSE
)

FetchContent_GetProperties(subprocess)
if(NOT subprocess_POPULATED)
  FetchContent_Populate(subprocess)
  add_subdirectory(
    ${subprocess_SOURCE_DIR}
    ${subprocess_BINARY_DIR}
    EXCLUDE_FROM_ALL
  )
endif()

# ------------------------------------------------------------------------------
project(chrome-dangling-untriaged-tracker LANGUAGES CXX)

add_executable(chrome-dangling-untriaged-tracker
  src/main.cpp
  src/parser.cpp
  src/parser.hpp
)

target_include_directories(chrome-dangling-untriaged-tracker
  PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src
)

target_link_libraries(chrome-dangling-untriaged-tracker
  PRIVATE subprocess
)

if (NOT MSVC)
  target_compile_options(chrome-dangling-untriaged-tracker
    PRIVATE "-Wall"
    PRIVATE "-Wextra"
    PRIVATE "-pedantic"
    PRIVATE "-Werror"
    PRIVATE "-Wdeprecated"
  )
endif()

set_target_properties(chrome-dangling-untriaged-tracker
  PROPERTIES CXX_STANDARD 17)

install(TARGETS chrome-dangling-untriaged-tracker
  RUNTIME DESTINATION "bin")
