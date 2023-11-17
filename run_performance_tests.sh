# -c adjusts the number of entries for each database, so 
# feel free to adjust the arguments as needed.
# Run performance tests and store results in data.json
python3 python/gink/performance_tests/gink_performance.py -o data.json -c 10000 -i 5 &&
python3 python/gink/performance_tests/sqlite_performance.py -o data.json -c 10000 -i 5 &&
node javascript/performance-tests/gink_performance.js -o data.json -c 10000 -i 5 &&
# Remove temporary database files
rm -rf perf_test_temp &&
# Generate and display comparison graphs
python3 python/gink/performance_tests/comparison_graph.py -d data.json