from matplotlib import pyplot as plt
from pathlib import Path
import json
import numpy as np

def graph_write(path_to_data: Path):
    """
    Plots a bar chart for writing to fresh db with individual commits
    writing to a fresh db with one big commit, and writing to an occupied db.
    
    This doesn't call plt.show(). Do that after creating as
    many of the graphs as necessary.
    """
    with open(path_to_data, "r") as f:
        data: dict = json.loads(f.read())
    assert data
    y_labels = []
    for label in data.keys():
        y_labels.append(label)
    y = np.arange(len(y_labels))
    width = 0.25
    multiplier = 0
    all_data = {
        "write_fresh": [],
        "write_occupied": [],
        "write_big_commit": []
    }
    plt.figure(1)
    ax = plt.subplot()
    x_max = 0
    for db in data.keys():
        wf = data[db]["write_fresh"]["writes_per_second"]
        wo = data[db]["write_occupied"]["writes_per_second"]
        wbc = data[db]["write_big_commit"]["writes_per_second"]
        all_data["write_fresh"].append(wf)
        all_data["write_occupied"].append(wo)
        all_data["write_big_commit"].append(wbc)
    
        if x_max < wf or x_max < wo or x_max < wbc:
            x_max = max(wf, wo, wbc)

    for test, results in all_data.items():
        offset = width * multiplier
        rects = ax.barh(y + offset, results, width, label=test)
        ax.bar_label(rects, padding=3)
        multiplier += 1
    ax.invert_yaxis()
    ax.set_xlabel('Writes per second')
    ax.set_title('Writes per second - Gink vs SQLite')
    ax.set_yticks(y + width, y_labels)
    ax.set_xlim(left=0, right=x_max+(x_max*.2))
    ax.legend(loc='upper center', bbox_to_anchor=(0.5, -0.15),
          fancybox=True, shadow=True, ncol=3)
    plt.subplots_adjust(left=0.2, bottom=0.2)
    

def graph_read(path_to_data: Path):
    """
    Plots a bar chart for write/read, read, and random reads.
    
    This doesn't call plt.show(). Do that after creating as
    many of the graphs as necessary.
    """
    with open(path_to_data, "r") as f:
        data: dict = json.loads(f.read())
    assert data
    y_labels = []
    for label in data.keys():
        y_labels.append(label)
    y = np.arange(len(y_labels))
    width = 0.25
    multiplier = 0
    all_data = {
        "read": [],
        "read_write": [],
        "random_read": []
    }
    plt.figure(2)
    ax = plt.subplot()
    x_max = 0
    for db in data.keys():
        read_rps = data[db]["read"]["reads_per_second"]
        wr_rps = data[db]["read_write"]["txns_per_second"]
        rand_rps = data[db]["random_read"]["reads_per_second"]
        all_data["read"].append(read_rps)
        all_data["read_write"].append(wr_rps)
        all_data["random_read"].append(rand_rps)

        if x_max < read_rps or x_max < wr_rps or x_max < rand_rps:
            x_max = max(read_rps, wr_rps, rand_rps)
    
    for test, results in all_data.items():
        offset = width * multiplier
        rects = ax.barh(y + offset, results, width, label=test)
        ax.bar_label(rects, padding=3)
        multiplier += 1
    ax.invert_yaxis()
    ax.set_xlabel('Writes per second')
    ax.set_title('Writes per second - Gink vs SQLite')
    ax.set_yticks(y + width, y_labels)
    ax.set_xlim(left=0, right=x_max+(x_max*.2))
    ax.legend(loc='upper center', bbox_to_anchor=(0.5, -0.15),
          fancybox=True, shadow=True, ncol=3)
    plt.subplots_adjust(left=0.2, bottom=0.2)

def graph_delete(path_to_data: Path):
    """
    Plots bar chart for deletions per second. 
    
    This doesn't call plt.show(). Do that after creating as
    many of the graphs as necessary.
    """
    with open(path_to_data, "r") as f:
        data: dict = json.loads(f.read())
    assert data
    x_labels = [label for label in data.keys()]
    x = np.arange(len(x_labels))
    width = 1/len(x_labels)
    all_data = {
        "delete": []
    }
    plt.figure(3)
    ax = plt.subplot()
    y_max = 0
    for db in data.keys():
        dps = data[db]["delete"]["deletes_per_second"]
        all_data["delete"].append(dps)
        if y_max < dps:
            y_max = dps
    
    for i in range(len(all_data["delete"])):
        rects = ax.bar(x[i], all_data["delete"][i], width, label=x_labels[i])

    ax.bar_label(rects)
    ax.set_ylabel('Deletions per second')
    ax.set_title('Deletions per second - Gink vs SQLite')
    ax.set_ylim(bottom=0, top=y_max+(y_max*.1))
    ax.set_xticks(x, x_labels)

def graph_increasing(path_to_data: Path):
    """
    Plots line graphs for both read and write as 
    data increases.

    This doesn't call plt.show(). Do that after creating as
    many of the graphs as necessary.
    """
    with open(path_to_data, "r") as f:
        data: dict = json.loads(f.read())
    assert data
    legend = []
    plt.figure(4, figsize=(10, 10))
    ax1 = plt.subplot(211)
    ax2 = plt.subplot(212)
    y_max_w = 0
    y_max_r = 0
    for db in data.keys():
        x = []
        writes = []
        reads = []
        for key in data[db]["increasing"].keys():
            x.append(key)
            wps = data[db]["increasing"][key]["write"]["writes_per_second"]
            rps = data[db]["increasing"][key]["read"]["reads_per_second"]
            writes.append(wps)
            reads.append(rps)
            if y_max_w < wps:
                y_max_w = wps
            if y_max_r < rps:
                y_max_r = rps

        ax1.plot(x, writes)
        ax2.plot(x, reads)
        legend.append(db)

    # All databases SHOULD have the same number of increasing tests,
    # so it should be fine to use the last db as the number of bins.
    num_bins = len(data[db]["increasing"].keys())

    ax1.set_title("Writes per second as DB Increases")
    ax1.set_xlabel("# of Entries in Database")
    ax1.set_ylabel("Writes per second")
    ax2.set_ylim(bottom=0, top=y_max_r+(y_max_r*.1))
    ax2.set_title("Reads per second as DB Increases")
    ax2.set_xlabel("# of Entries in Database")
    ax2.set_ylabel("Reads per second")
    ax2.set_ylim(bottom=0, top=y_max_r+(y_max_r*.1))
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
    'increasing'
    """
    graphs_choices = ['all', 'write', 'read', 'delete', 'increasing']
    parser.add_argument("-g", "--graphs", help=graphs_help, choices=graphs_choices, default='all')

    args: Namespace = parser.parse_args()

    if args.graphs in ('all', 'write'):
        graph_write(args.data)
    if args.graphs in ('all', 'read'):
        graph_read(args.data)
    if args.graphs in ('all', 'delete'):
        graph_delete(args.data)
    if args.graphs in ('all', 'increasing'):
        graph_increasing(args.data)
    plt.show()