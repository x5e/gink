set -o errexit
export CURRENT_SAFE_PORT=8080
cd $(dirname $0)
for file in ./*-test.js;
do
    if test "$OSTYPE" == darwin* && test "$file" == ssl*;
    then
    echo "skipping ssl test on mac"
    else
    echo $file
    ./$file;
    export CURRENT_SAFE_PORT=$(($CURRENT_SAFE_PORT+1))
    fi
done
