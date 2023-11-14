from matplotlib import pyplot as plt
from pathlib import Path
import json
import numpy as np

def graph_write(path_to_data: Path):
    with open(path_to_data, "r") as f:
        data: dict = json.loads(f.read())
    assert data
    gink = data.get("gink")
    sqlite = data.get("sqlite")
    x_labels = []
    if gink:
        x_labels.append("Gink")
    if sqlite:
        x_labels.append("SQLite")
    x = np.arange(len(x_labels))
    width = 0.25
    multiplier = 0
    all_data = {
        "write_fresh": [],
        "write_occupied": [],
        "write_big_commit": []
    }
    fig, ax = plt.subplots(layout='constrained')
    if gink:
        all_data["write_fresh"].append(gink["write_fresh"]["writes_per_second"])
        all_data["write_occupied"].append(gink["write_occupied"]["writes_per_second"])
        all_data["write_big_commit"].append(gink["write_big_commit"]["writes_per_second"])
    
    if sqlite:
        all_data["write_fresh"].append(sqlite["write_fresh"]["writes_per_second"])
        all_data["write_occupied"].append(sqlite["write_occupied"]["writes_per_second"])
        all_data["write_big_commit"].append(sqlite["write_big_commit"]["writes_per_second"])
    
    if gink or sqlite:
        for test, results in all_data.items():
            offset = width * multiplier
            rects = ax.bar(x + offset, results, width, label=test)
            ax.bar_label(rects, padding=3)
            multiplier += 1
        ax.set_ylabel('WPS')
        ax.set_title('Writes per second - Gink vs SQLite')
        ax.set_xticks(x + width, x_labels)
        ax.legend(loc='upper left', ncols=3)
        plt.show()

def graph_increasing(path_to_data: Path):
    with open(path_to_data, "r") as f:
        data: dict = json.loads(f.read())
    assert data
    gink = data.get("gink")
    sqlite = data.get("sqlite")
    legend = []
    if gink:
        x = []
        writes = []
        reads = []
        for key in gink["increases"].keys():
            x.append(key)
            writes.append(gink["increases"][key]["write"]["writes_per_second"])
            reads.append(gink["increases"][key]["read"]["reads_per_second"])
        plt.figure(1, figsize=(10, 10))
        ax1 = plt.subplot(211)
        plt.plot(x, writes)
        plt.title("Writes per second as DB Increases")
        plt.xlabel("# of Entries in Database")
        plt.ylabel("Writes per second")

        ax2 = plt.subplot(212)
        plt.plot(x, reads)
        plt.legend(["gink"])
        plt.title("Reads per second as DB Increases")
        plt.xlabel("# of Entries in Database")
        plt.ylabel("Reads per second")
        plt.ylim(bottom=0)
        legend.append("Gink")

    if sqlite:
        x = []
        writes = []
        reads = []
        for key in sqlite["increases"].keys():
            x.append(key)
            writes.append(sqlite["increases"][key]["write"]["writes_per_second"])
            reads.append(sqlite["increases"][key]["read"]["reads_per_second"])
        plt.figure(1, figsize=(10, 10))
        ax1 = plt.subplot(211)
        plt.plot(x, writes)

        ax2 = plt.subplot(212)
        plt.plot(x, reads)
        legend.append("SQLite")

    if gink or sqlite:
        ax1.xaxis.set_major_locator(plt.MaxNLocator(10))
        ax2.xaxis.set_major_locator(plt.MaxNLocator(10))
        plt.legend(legend, bbox_to_anchor=(0.63, -0.2), ncol=2)
        plt.show()

if __name__ == "__main__":
    from argparse import ArgumentParser, Namespace
    
    parser: ArgumentParser = ArgumentParser(allow_abbrev=False)
    parser.add_argument("-d", "--data", help="json file that contains test data")
    args: Namespace = parser.parse_args()

    graph_write(args.data)
    # graph_increasing(args.data)