set -o errexit
for file in integration-tests/*-test.js;
do
    echo $file
    ./$file;
done
