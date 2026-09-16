#!/usr/bin/env python3
"""Merge audited literature batches into the site dataset, safely and idempotently.

Each batch is retained as an audit artifact. A changed paper or row with an
existing ID is rejected instead of silently replacing an already reviewed value.
"""

import csv
import json
import os
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1] / "data" / "benchmark-literature"
PAPERS = ROOT / "papers.json"
RESULTS = ROOT / "results.csv"
BATCHES = ROOT / "batches"


def read_csv(path):
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        fieldnames = reader.fieldnames
        rows = list(reader)
    if not fieldnames or not rows:
        raise ValueError(f"Empty result CSV: {path}")
    if any(None in row or None in row.values() for row in rows):
        raise ValueError(f"Wrong column count: {path}")
    return fieldnames, rows


def add_unique(index, items, key, source):
    for item in items:
        identifier = item[key]
        if identifier in index:
            if index[identifier] != item:
                raise ValueError(f"Conflicting {key} {identifier} in {source}")
        else:
            index[identifier] = item


def write_atomic(path, content):
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="", dir=path.parent, delete=False) as handle:
        handle.write(content)
        temp_path = Path(handle.name)
    try:
        os.replace(temp_path, path)
    finally:
        temp_path.unlink(missing_ok=True)


def main():
    papers = json.loads(PAPERS.read_text(encoding="utf-8"))
    header, results = read_csv(RESULTS)
    paper_index = {paper["id"]: paper for paper in papers}
    result_index = {row["id"]: row for row in results}
    if len(paper_index) != len(papers) or len(result_index) != len(results):
        raise ValueError("Main dataset contains duplicate IDs")

    batch_paths = sorted(BATCHES.glob("batch-*-papers.json"))
    if not batch_paths:
        raise ValueError("No literature batches found")
    for paper_path in batch_paths:
        result_path = paper_path.with_name(paper_path.name.replace("-papers.json", "-results.csv"))
        if not result_path.exists():
            raise ValueError(f"Missing CSV for {paper_path}")
        batch_papers = json.loads(paper_path.read_text(encoding="utf-8"))
        batch_header, batch_results = read_csv(result_path)
        if batch_header != header:
            raise ValueError(f"Schema mismatch: {result_path}")
        batch_paper_index = {paper["id"]: paper for paper in batch_papers}
        if len(batch_paper_index) != len(batch_papers):
            raise ValueError(f"Duplicate paper ID in {paper_path}")
        papers_with_rows = set()
        for row in batch_results:
            paper = batch_paper_index.get(row["paper_id"])
            if not paper or row["domain_id"] != paper["primary_domain"] or row["source_url"] != paper["source_url"]:
                raise ValueError(f"Paper/source mismatch for {row['id']} in {result_path}")
            papers_with_rows.add(row["paper_id"])
        if papers_with_rows != set(batch_paper_index):
            raise ValueError(f"Paper without a result in {paper_path}")
        add_unique(paper_index, batch_papers, "id", paper_path)
        add_unique(result_index, batch_results, "id", result_path)

    doi_index = {}
    source_index = {}
    for paper in paper_index.values():
        doi = (paper.get("doi") or "").strip().lower()
        if doi:
            if doi in doi_index and doi_index[doi] != paper["id"]:
                raise ValueError(f"Duplicate DOI {doi}: {doi_index[doi]} and {paper['id']}")
            doi_index[doi] = paper["id"]
        source = paper["source_url"].rstrip("/")
        if source in source_index and source_index[source] != paper["id"]:
            raise ValueError(f"Duplicate primary source {source}: {source_index[source]} and {paper['id']}")
        source_index[source] = paper["id"]

    ordered_papers = list(paper_index.values())
    ordered_results = list(result_index.values())
    papers_content = json.dumps(ordered_papers, ensure_ascii=False, indent=2) + "\n"
    with tempfile.NamedTemporaryFile(mode="w+", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=header, lineterminator="\n")
        writer.writeheader()
        writer.writerows(ordered_results)
        handle.seek(0)
        results_content = handle.read()
    write_atomic(PAPERS, papers_content)
    write_atomic(RESULTS, results_content)
    print(f"Merged {len(batch_paths)} batches: {len(ordered_papers)} papers, {len(ordered_results)} rows")


if __name__ == "__main__":
    main()
