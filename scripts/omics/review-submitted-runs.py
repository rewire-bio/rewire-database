#!/usr/bin/env python3
"""Recheck pinned public run artifacts without executing models or publishing records.

Optional queue reconciliation reads private data only in memory and prints counts.
It never serializes submission IDs, tokens, email addresses or private payloads.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'data/omics/reviews/local-evaluations-2026-09-22.json'
SOURCE = re.compile(r'^https://raw\.githubusercontent\.com/rewire-bio/rewire-benchmarks/([a-f0-9]{40})/(research/[A-Za-z0-9_./-]+\.json)$')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def at(value, path):
    for key in path:
        value = value[key]
    return value


def validate_artifacts(entry, documents):
    report, bundle, audit = (documents[k] for k in ('report', 'bundle', 'audit'))
    for key in ('protocol_id', 'protocol_version', 'dataset_id', 'scope', 'completion',
                'coverage', 'predictions_sha256', 'prepared_sha256'):
        require(report[key] == bundle[key] == entry[key], 'Run identity or scope mismatch')
    require(report['independently_reproduced'] is False and
            bundle['independently_reproduced'] is False, 'Unsupported reproduction claim')
    require(bundle['model']['name'] == entry['model_name'], 'Model configuration mismatch')
    require(bundle['data_verification'] == entry['data_verification'], 'Data verification mismatch')
    coverage = entry['coverage']
    require(coverage['scored'] == coverage['denominator'] > 0 and coverage['unscored'] == 0,
            'Selected evaluation is incomplete')
    if entry['protocol_id'].startswith('proteingym'):
        require(entry['scope'] == 'subset' and entry['completion'] == 'partial',
                'Single ProteinGym assay is not a full track')
        metrics = bundle['metrics']['per_assay']['AMFR_HUMAN_Tsuboyama_2023_4G3O']['metrics']
    else:
        metrics = bundle['metrics']
    require(at(report, entry['metric_path']) == entry['metrics'] == metrics,
            'Printed metrics differ from the exact report and bundle')
    if 'checks' in audit:
        checks = audit['checks']
        require(bool(checks), 'Empty execution audit')
        require(all(c['status'] == 'passed' for c in checks) if isinstance(checks, list)
                else all(v is True for v in checks.values()), 'Failed execution audit')
    else:
        if entry['audit_run']:
            runs = [r for r in audit['runs'] if r['run'] == entry['audit_run']]
            require(len(runs) == 1, 'Audit run identity is ambiguous')
            checked = runs[0]
            require(checked['independent_metric_recomputation'] == 'passed', 'Metrics not checked')
            for metric in ('spearman', 'ndcg'):
                require(checked[metric] == metrics[metric], 'Audit metrics mismatch')
        else:
            checked = audit
            expected = checked.get('rounded_metrics', checked.get('metrics'))
            require(expected == metrics, 'Audit metrics mismatch')
        require(checked['prediction_digest_verification'] == 'passed' and
                checked['prepared_and_code_binding'] == 'passed', 'Unbound execution audit')
        require(checked['predictions_sha256'] == entry['predictions_sha256'] and
                audit['prepared_sha256'] == entry['prepared_sha256'], 'Audit identity mismatch')
        require(audit['code_hash_start'] == audit['code_hash_end'], 'Execution code changed')


def load_artifacts(entry, runner_repo=None):
    documents = {}
    for role, artifact in entry['artifacts'].items():
        match = SOURCE.fullmatch(artifact['url'])
        require(match is not None and '..' not in match[2].split('/'), 'Unpinned artifact URL')
        if runner_repo:
            raw = subprocess.check_output(['git', '-C', str(runner_repo), 'show',
                                           f'{match[1]}:{match[2]}'])
        else:
            with urlopen(artifact['url'], timeout=30) as response:
                require(response.url == artifact['url'], 'Unexpected artifact redirect')
                raw = response.read(2_000_001)
        require(len(raw) <= 2_000_000, 'Unexpected artifact size')
        require(hashlib.sha256(raw).hexdigest() == artifact['sha256'], 'Artifact checksum mismatch')
        documents[role] = json.loads(raw)
    validate_artifacts(entry, documents)
    return documents


def reconcile_queue(entries, documents, queue):
    queued = [json.loads(path.read_text()) for path in queue.glob('*.json')]
    require(len(queued) == len(entries) == 10, 'Unexpected private queue inventory')
    by_source = {q['arguments']['source_url']: q for q in queued}
    require(len(by_source) == 10, 'Repeated queue evidence identity')
    ids = set()
    for entry in entries:
        source = entry['artifacts']['report']['url'].replace(
            'https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/',
            'https://github.com/rewire-bio/rewire-benchmarks/blob/')
        q = by_source[source]
        require(q['bundle'] == documents[entry['evaluation_id']]['bundle'], 'Queue artifact mismatch')
        require(q['status'] == q['tracking']['status'] == 'submitted', 'Queue is not pending review')
        require(q['receipt']['submission']['id'] == q['tracking']['id'], 'Acknowledgement mismatch')
        ids.add(q['tracking']['id'])
    require(len(ids) == 10, 'Duplicate private submission identity')
    return len(ids)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runner-repo', type=Path, help='Read exact git objects locally instead of HTTP')
    parser.add_argument('--private-queue', type=Path, help='Optional read-only private queue check')
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    entries = manifest['evaluations']
    require(len(entries) == len({e['evaluation_id'] for e in entries}) == 10, 'Inventory mismatch')
    documents = {e['evaluation_id']: load_artifacts(e, args.runner_repo) for e in entries}
    private = reconcile_queue(entries, documents, args.private_queue) if args.private_queue else None
    print(json.dumps({'public_artifact_sets_verified': len(documents),
                      'private_acknowledgements_verified': private,
                      'new_executions': 0, 'publication_writes': 0}))


if __name__ == '__main__':
    main()
