set -o errexit
cd $(dirname $0)
for file in ./*-test.js;
do
    echo $file
    ./$file;
done
