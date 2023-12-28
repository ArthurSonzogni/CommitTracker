#!/bin/bash
repo=https://github.com/ArthurSonzogni/ChromeCommitTracker.git
for branch in "data" "community-map"
do
  rm -rf static/$branch
  git clone --branch $branch --single-branch --depth=1 $repo static/$branch
  rm -rf static/$branch/.git
done
