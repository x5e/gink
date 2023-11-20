# -c adjusts the number of entries for each database, so 
# feel free to adjust the arguments as needed.
# Run performance tests and store results in data.json
python3 python/gink/performance_tests/gink_performance.py -o data.json -c 1000 -i 5 &&
python3 python/gink/performance_tests/sqlite_performance.py -o data.json -c 1000 -i 5 &&
node javascript/performance-tests/gink-performance.js -o data.json -c 1000 -i 5 &&
# the browser tests aren't using arguments to control the count (yet)
# go to performance_tests.html to change the count for now.
node javascript/performance-tests/browser-performance-test.js -o data.json &&
# Remove temporary database files
rm -rf perf_test_temp &&
# Generate and display comparison graphs
python3 python/gink/performance_tests/comparison_graph.py -d data.json

# Note: I ran into an error regarding qt.qpa.plugin, which I fixed with
# sudo apt-get install '^libxcb.*-dev' libx11-xcb-dev libglu1-mesa-dev libxrender-dev libxi-dev libxkbcommon-dev libxkbcommon-x11-dev
# Note: If the figure will not show, try:
# sudo apt-get install python3-tk
# Note: Might need to install firefox for browser tests.
# sudo apt install firefox-esr