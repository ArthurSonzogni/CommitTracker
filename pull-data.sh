#!/bin/bash
repo=https://github.com/ArthurSonzogni/CommitTracker.git

# The date of the last update of each data branch, for the site footer.
dates=public/data_updated.json
echo "{" > $dates
separator=""

for branch in "data" "community-map" "fuzz-test" "treemap" "cve" "commit_rates"
do
  rm -rf public/$branch
  git clone --branch $branch --single-branch --depth=1 $repo public/$branch
  date=$(git -C public/$branch log -1 --format=%cI)
  printf '%s  "%s": "%s"' "$separator" "$branch" "$date" >> $dates
  separator=",
"
  rm -rf public/$branch/.git
done

printf '\n}\n' >> $dates
