set -o errexit
export CURRENT_SAFE_PORT=8080
cd $(dirname $0)
for file in ./*-test.js;
do
    echo $file
    ./$file;
    export CURRENT_SAFE_PORT=$(($CURRENT_SAFE_PORT+1))
done
