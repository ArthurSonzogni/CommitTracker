#!/bin/bash
repo=https://github.com/ArthurSonzogni/ChromeCommitTracker.git
for branch in "data" "community-map" "fuzz-test"
do
  rm -rf public/$branch
  git clone --branch $branch --single-branch --depth=1 $repo public/$branch
  rm -rf public/$branch/.git
done
