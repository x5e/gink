# -c adjusts the number of entries for each database, so 
# feel free to adjust the arguments as needed.
python3 python/gink/performance_tests/gink_performance.py -o data.json -c 1000 -i 5 &&
python3 python/gink/performance_tests/sqlite_performance.py -o data.json -c 1000 -i 5 &&
node javascript/performance-tests/gink_performance.js -o data.json -c 1000 -i 5 &&
rm -rf perf_test_temp &&
python3 python/gink/performance_tests/comparison_graph.py -d data.json