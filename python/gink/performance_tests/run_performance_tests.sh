# -c adjusts the number of entries for each database, so 
# feel free to adjust the arguments as needed.
python3 gink_performance.py -o data.json -c 10000 -i 5 &&
python3 sqlite_performance.py -o data.json -c 10000 -i 5 &&
python3 comparison_graph.py -d data.json