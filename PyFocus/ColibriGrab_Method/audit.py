"""Read-only integrity/quality check for a ColibriGrab autofocus RCD batch.

Requires numpy and ColibriGrabCapture.py in the same folder.
Does not communicate with camera, focuser, dome, or telescope.
"""
import argparse
from pathlib import Path
import csv
import numpy as np
from ColibriGrabCapture import read_rcd_high_gain


def examine(path):
    image = read_rcd_high_gain(path)
    if image.shape != (2048, 2048):
        raise ValueError(f"Unexpected decoded image shape: {image.shape}")
    rows = np.array_split(image, 4, axis=0)
    result = {
        "filename": path.name,
        "mean": round(float(image.mean()), 3),
        "median": round(float(np.median(image)), 3),
        "std": round(float(image.std()), 3),
        "zero_percent": round(100 * float(np.count_nonzero(image == 0)) / image.size, 3),
        "saturated_percent": round(100 * float(np.count_nonzero(image == 4095)) / image.size, 5),
        "all_zero_rows": int(np.count_nonzero(np.all(image == 0, axis=1))),
    }
    for n, region in enumerate(rows, 1):
        result[f"quarter_{n}_mean"] = round(float(region.mean()), 3)
        result[f"quarter_{n}_zero_percent"] = round(100 * float(np.count_nonzero(region == 0)) / region.size, 2)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("batch_dir", type=Path, help="Directory containing RCD images from one ColibriGrab batch")
    args = parser.parse_args()
    folder = args.batch_dir.resolve()
    files = sorted(folder.rglob("*.rcd"), key=lambda p: p.name.lower())
    if not files:
        raise SystemExit(f"No RCD files in {folder}")
    results = []
    for path in files:
        try:
            results.append(examine(path))
        except Exception as exc:
            print(f"ERROR {path.name}: {exc}")
    if not results:
        raise SystemExit("No readable RCD images")
    print(f"\nChecked {len(results)} RCD images in {folder}")
    print("File | mean | median | zeros % | fully-zero rows | quarter means [top -> bottom]")
    for r in results:
        quart = [r[f"quarter_{k}_mean"] for k in range(1, 5)]
        print(f"{r['filename']} | {r['mean']:.1f} | {r['median']:.1f} | "
              f"{r['zero_percent']:.1f}% | {r['all_zero_rows']} | {quart}")
    output = folder / "rcd_batch_audit.csv"
    with output.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(results[0]))
        writer.writeheader()
        writer.writerows(results)
    print(f"\nReport: {output}")
    print("A large last-frame jump in mean/median or zero rows suggests anomalous image data,")
    print("but this audit cannot alone distinguish camera capture from file decoding.")


if __name__ == '__main__':
    main()
