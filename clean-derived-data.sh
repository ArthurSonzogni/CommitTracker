#!/bin/bash
cd "$(dirname "$0")"

work_dir=`mktemp -d -p "$DIR"`;
echo ${work_dir}

cd public/data
mv * ${work_dir};
mv ${work_dir}/repositories.json .
for dir in ${work_dir}/*/
do
  repository=$(basename $(dirname ${dir}/xxx))
  mkdir ${repository}
  cd ${repository}
  mv ${dir}/emails .
  mv ${dir}/emails.json .
  cd ..
done
