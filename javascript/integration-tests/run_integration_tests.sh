set -o errexit
for file in integration-tests/*-test.js;
do
    ./$file;
done
