from matplotlib import pyplot as plt
from pathlib import Path
import json
import numpy as np

def graph_write(path_to_data: Path):
    with open(path_to_data, "r") as f:
        data: dict = json.loads(f.read())
    assert data
    x_labels = []
    for label in data.keys():
        x_labels.append(label)
    x = np.arange(len(x_labels))
    width = 0.25
    multiplier = 0
    all_data = {
        "write_fresh": [],
        "write_occupied": [],
        "write_big_commit": []
    }
    plt.figure(1)
    ax = plt.subplot()
    for db in data.keys():
        all_data["write_fresh"].append(data[db]["write_fresh"]["writes_per_second"])
        all_data["write_occupied"].append(data[db]["write_occupied"]["writes_per_second"])
        all_data["write_big_commit"].append(data[db]["write_big_commit"]["writes_per_second"])
    
    for test, results in all_data.items():
        offset = width * multiplier
        rects = ax.bar(x + offset, results, width, label=test)
        ax.bar_label(rects, padding=3)
        multiplier += 1
    ax.set_ylabel('Writes per second')
    ax.set_title('Writes per second - Gink vs SQLite')
    ax.set_xticks(x + width, x_labels)
    ax.legend(loc='upper left', ncols=3)

def graph_read(path_to_data: Path):
    with open(path_to_data, "r") as f:
        data: dict = json.loads(f.read())
    assert data
    x_labels = []
    for label in data.keys():
        x_labels.append(label)
    x = np.arange(len(x_labels))
    width = 0.25
    multiplier = 0
    all_data = {
        "read": [],
        "read_write": [],
        "random_read": []
    }
    plt.figure(2)
    ax = plt.subplot()
    for db in data.keys():
        all_data["read"].append(data[db]["read"]["reads_per_second"])
        all_data["read_write"].append(data[db]["read_write"]["txns_per_second"])
        all_data["random_read"].append(data[db]["random_read"]["reads_per_second"])
    
    for test, results in all_data.items():
        offset = width * multiplier
        rects = ax.bar(x + offset, results, width, label=test)
        ax.bar_label(rects, padding=3)
        multiplier += 1
    ax.set_ylabel('Reads per second')
    ax.set_title('Reads per second - Gink vs SQLite')
    ax.set_xticks(x + width, x_labels)
    ax.legend(loc='upper left', ncols=3)

def graph_delete(path_to_data: Path):
    with open(path_to_data, "r") as f:
        data: dict = json.loads(f.read())
    assert data
    x_labels = [label for label in data.keys()]
    x = np.arange(len(x_labels))
    width = 0.25
    multiplier = 0
    all_data = {
        "delete": []
    }
    plt.figure(3)
    ax = plt.subplot()
    for db in data.keys():
        all_data["delete"].append(data[db]["delete"]["deletes_per_second"])
    
    for test, results in all_data.items():
        offset = width * multiplier
        rects = ax.bar(x + offset, results, width, label=test)
        ax.bar_label(rects, padding=3)
        multiplier += 1
    ax.set_ylabel('Deletes per second')
    ax.set_title('Deletes per second - Gink vs SQLite')
    ax.set_xticks(x + width, x_labels)
    ax.legend(loc='upper left', ncols=3)

def graph_increasing(path_to_data: Path):
    """
    Plots line graphs for both read and write as 
    data increases.
    """
    with open(path_to_data, "r") as f:
        data: dict = json.loads(f.read())
    assert data
    legend = []
    plt.figure(4, figsize=(10, 10))
    ax1 = plt.subplot(211)
    ax2 = plt.subplot(212)
    for db in data.keys():
        x = []
        writes = []
        reads = []
        for key in data[db]["increases"].keys():
            x.append(key)
            writes.append(data[db]["increases"][key]["write"]["writes_per_second"])
            reads.append(data[db]["increases"][key]["read"]["reads_per_second"])
        ax1.plot(x, writes)
        ax2.plot(x, reads)
        legend.append(db)

    # All databases SHOULD have the same number of increasing tests,
    # so it should be fine to use the last db as the number of bins.
    num_bins = len(data[db]["increases"].keys())
    ax1.set_title("Writes per second as DB Increases")
    ax1.set_xlabel("# of Entries in Database")
    ax1.set_ylabel("Writes per second")
    ax2.set_title("Reads per second as DB Increases")
    ax2.set_xlabel("# of Entries in Database")
    ax2.set_ylabel("Reads per second")
    ax2.set_ylim(bottom=0)
    ax1.xaxis.set_major_locator(plt.MaxNLocator(num_bins))
    ax2.xaxis.set_major_locator(plt.MaxNLocator(num_bins))
    ax1.legend(legend, ncol=2)
    ax2.legend(legend, ncol=2)
    

if __name__ == "__main__":
    from argparse import ArgumentParser, Namespace
    
    parser: ArgumentParser = ArgumentParser(allow_abbrev=False)
    parser.add_argument("-d", "--data", help="json file that contains test data")
    graphs_help = """
    Select specific graphs to display.
    Defaults to 'all'.
    Options:
    'write'
    'read'
    'delete'
    'increases'
    """
    graphs_choices = ['all', 'write', 'read', 'delete', 'increases']
    parser.add_argument("-g", "--graphs", help=graphs_help, choices=graphs_choices, default='all')

    args: Namespace = parser.parse_args()

    if args.graphs in ('all', 'write'):
        graph_write(args.data)
    if args.graphs in ('all', 'read'):
        graph_read(args.data)
    if args.graphs in ('all', 'delete'):
        graph_delete(args.data)
    if args.graphs in ('all', 'increases'):
        graph_increasing(args.data)
    plt.show()