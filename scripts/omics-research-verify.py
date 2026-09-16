#!/usr/bin/env python3
"""Recheck the complete TAPE fluorescence/stability extraction against pinned upstream.

Read-only. No model inference, dataset download or source modification. Network access
is limited to the exact GitHub source URL in the reviewed public discovery file.
"""
import hashlib
import json
import re
import urllib.request
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[1]
    records = [json.loads(line) for line in (root / 'data/omics/discovery.jsonl').read_text().splitlines()]
    source = next(r for r in records if r['id'] == 'src-discovery-songlab-cal-tape')
    attrs = source['attributes']
    url = attrs['url']
    assert re.fullmatch(r'https://github.com/songlab-cal/tape/blob/[0-9a-f]{40}/README.md', url)
    raw_url = url.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/')
    with urllib.request.urlopen(raw_url, timeout=30) as response:
        raw = response.read()
    assert hashlib.sha256(raw).hexdigest() == attrs['artifact_sha256'], 'Pinned source content hash changed'
    text = raw.decode()
    results = [r for r in records if r['kind'] == 'result' and source['id'] in r['source_ids']]
    verified = 0
    for task in ('Fluorescence', 'Stability'):
        section = text.split('### ' + task + '\n', 1)[1].split('\n#', 1)[0]
        upstream = {match.group(1).strip(): match.group(2) for match in re.finditer(
            r'^\|\s*\d+\.\s*\|\s*([^|]+)\|\s*(0\.\d+)\s*\|', section, re.M)}
        downstream = {}
        for result in results:
            match = re.fullmatch('TAPE ' + task + r' (.+) Spearman rho', result['name'])
            if match:
                value = result['attributes']['printed_value']
                assert result['attributes']['numeric_value'] == value
                downstream[match.group(1)] = value
        assert len(upstream) == 6, 'Expected complete six-row table'
        assert upstream == downstream, (task, upstream, downstream)
        verified += len(upstream)
    assert len(results) == verified
    print(f'Verified {verified} results: both complete TAPE tables match pinned source and SHA-256.')


if __name__ == '__main__':
    main()
