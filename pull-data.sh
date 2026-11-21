#!/bin/sh
set -eu

repo=https://github.com/ArthurSonzogni/CommitTracker.git
all_branches="${PULL_BRANCHES:-data community-map fuzz-test treemap cve commit_rates accretion}"
skip=" ${SKIP_BRANCHES:-} "

branches=""
for branch in $all_branches; do
  case "$skip" in
    *" $branch "*) continue ;;
  esac
  branches="$branches $branch"
done

pids=""
for branch in $branches; do
  rm -rf "public/$branch"
  git clone --branch "$branch" --single-branch --depth=1 "$repo" "public/$branch" &
  pids="$pids $!"
done

failed=0
for pid in $pids; do
  wait "$pid" || failed=1
done
if [ "$failed" -ne 0 ]; then
  exit 1
fi

# The date of the last update of each data branch, for the site footer.
dates=public/data_updated.json
echo "{" > "$dates"
separator=""

for branch in $branches; do
  date=$(git -C "public/$branch" log -1 --format=%cI)
  printf '%s  "%s": "%s"' "$separator" "$branch" "$date" >> "$dates"
  separator=",
"
  rm -rf "public/$branch/.git"
done

printf '\n}\n' >> "$dates"
