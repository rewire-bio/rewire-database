#!/usr/bin/env python3
"""Prepare the five reviewed baseline-programme evaluations; never submit or publish."""
import argparse
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

spec = importlib.util.spec_from_file_location('run_review', Path(__file__).with_name('review-submitted-runs.py'))
reviewer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reviewer)
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--runner-repo', required=True, type=Path)
a = p.parse_args()
REV = '1663d1f04b2bbd6dfcff77fea78129d30b0de191'
DATE = '2026-09-22T21:18:22Z'
ROOT = Path('data/omics/reviewed/baseline-runs-2026-09-22')
ROOT.mkdir(parents=True, exist_ok=True)
sha = lambda data: hashlib.sha256(data).hexdigest()
pretty = lambda data: json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
inventory = json.loads(reviewer.MANIFEST.read_text())
entries = [e for e in inventory['evaluations'] if e['evaluation_id'].startswith('rewire-local-20260921-')]
assert len(entries) == 5
records, evidence = [], []


def link(relation, target):
    return {'relation': relation, 'target_id': target}


def put(ident, kind, name, description, sources, attrs, links=(), area='proteins-complexes'):
    records.append({'id': ident, 'kind': kind, 'name': name, 'description': description,
                    'status': 'source_checked', 'facets': {'areas': [area]}, 'source_ids': sources,
                    'links': list(links), 'attributes': attrs})


for entry in entries:
    original = reviewer.load_artifacts(entry, a.runner_repo)
    rid = entry['evaluation_id']; key = rid.removeprefix('rewire-local-20260921-evaluation-')
    mid = rid.replace('-evaluation-', '-configuration-')
    sid = rid.replace('-evaluation-', '-source-'); aid = rid.replace('-evaluation-', '-audit-source-')
    iid = rid.replace('-evaluation-', '-instructions-')
    is_mfass = key == 'mfass-prior'; is_pg = key == 'proteingym-random'
    area = 'dna-genomes' if is_mfass else 'proteins-complexes'
    pin = {}; docs = {}
    for role in ['report', 'bundle', 'audit']:
        path = reviewer.SOURCE.fullmatch(entry['artifacts'][role]['url'])[2]
        raw = subprocess.check_output(['git', '-C', str(a.runner_repo), 'show', f'{REV}:{path}'])
        assert sha(raw) == entry['artifacts'][role]['sha256'], 'Latest evidence revision changed source bytes'
        pin[role] = {'path': path, 'sha256': sha(raw)}; docs[role] = json.loads(raw)
    report, audit = docs['report'], docs['audit']
    url = lambda path: f'https://github.com/rewire-bio/rewire-benchmarks/blob/{REV}/{path}'
    raw_url = lambda path: f'https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/{REV}/{path}'
    label = entry['model_name']
    title = 'MFASS v2 canonical held-out split' if is_mfass else 'ProteinGym v1.3 AMFR substitution assay' if is_pg else 'FLIP2 Rhomax by_wild_type'
    description = ('Constant training-class prior scored on all 8,324 canonical MFASS v2 held-out variants. Tied top-100 predictions are one fixed label-independent ordering, not ranking ability.' if is_mfass else
                   'One seed-0 random ranking on all 2,972 AMFR variants. This is one complete assay, not the full ProteinGym track or an estimate of a chance-performance interval.' if is_pg else
                   'Frozen features with a fixed alpha-10 ridge head fitted only on training rows; all 184 Rhomax by_wild_type held-out proteins scored. This selected split is not a whole FLIP2 score.')
    pid = 'rewire-mfass-v2' if is_mfass else 'rewire-protocol-proteingym-amfr-random-v13' if is_pg else 'rewire-protocol-flip2-rhomax-by-wild-type-v1'
    did = 'rewire-mfass-v2-dataset' if is_mfass else 'rewire-dataset-proteingym-amfr-random-v13' if is_pg else 'rewire-dataset-flip2-rhomax-by-wild-type-v3'
    for role, source_id in [('report', sid), ('audit', aid)]:
        put(source_id, 'source', label + ': ' + role, 'Pinned local execution evidence; automated source review is not published-score reproduction.', [],
            {'url': url(pin[role]['path']), 'artifact_url': raw_url(pin[role]['path']), 'artifact_sha256': pin[role]['sha256'],
             'version': REV, 'retrieved_at': DATE, 'source_type': 'rewire_execution_report' if role == 'report' else 'automated_execution_audit'}, area=area)
    path = pin['report']['path'].split('/rhomax')[0] + '/README.md' if not (is_pg or is_mfass) else pin['report']['path'].split('/evidence/')[0] + '/README.md'
    instructions = subprocess.check_output(['git', '-C', str(a.runner_repo), 'show', f'{REV}:{path}'])
    put(iid, 'source', label + ': execution and verification instructions', 'Exact scripts and preparation requirements; source-reviewed instructions, not a claim that portable commands were rerun during this review.', [],
        {'url': url(path), 'artifact_url': raw_url(path), 'artifact_sha256': sha(instructions), 'version': REV,
         'retrieved_at': DATE, 'source_type': 'reproduction_instructions'}, area=area)
    if is_pg:
        put(pid, 'protocol', 'ProteinGym v1.3 AMFR seeded-random control', description, [sid, aid, iid],
            {'version': report['protocol_version'], 'protocol_id': report['protocol_id'],
             'procedure': report['protocol_configuration'], 'score_generation': report['model_configuration'],
             'source_locator': 'protocol_configuration; model_configuration; protocol_results',
             'allowed_information': 'Opaque prepared mutation ID and fixed seed 0 only; no labels, pretrained model or fitting.',
             'reproduction_url': url(path), 'reproducibility_note': 'Source-reviewed instructions for this one fixed-seed control; not the ESM-2 masked-marginal procedure.'},
            [link('part_of', 'discovery-benchmark-proteingym')], area)
        put(pid + '-suite', 'claim', 'AMFR random control uses the ProteinGym substitution evaluator',
            'Protocol membership does not imply completion of the full track.', [sid],
            {'field': 'links:part_of:discovery-benchmark-proteingym', 'value': 'discovery-benchmark-proteingym',
             'source_locator': 'protocol_id; protocol_configuration; provenance.upstream_revision'}, [link('subject', pid)], area)
        put(did, 'dataset_subset', 'ProteinGym v1.3 AMFR stability assay, 2,972 variants',
            'The same AMFR assay inputs used in the earlier ESM-2 evaluation, described independently of its scoring method. This additional catalogue identity does not represent another dataset or independent source.', [sid, aid],
            {'version': 'ProteinGym-v1.3', 'dataset_id': report['dataset_id'], 'selected_assay': 'AMFR_HUMAN_Tsuboyama_2023_4G3O',
             'test_count': 2972, 'split': 'Full assay; no train/test split', 'provenance': report['provenance'],
             'source_locator': 'coverage; protocol_configuration.assays; verification.json source_alignment and source_assay_sha256',
             'reuse_note': 'Same mutation identities, sequences, labels and source bytes as rewire-dataset-proteingym-amfr-v13; separate record avoids its ESM-specific wording.'},
            [link('same_data_as', 'rewire-dataset-proteingym-amfr-v13')], area)
        put(did + '-same-data', 'claim', 'AMFR input data are reused, not independent data',
            'The source audit reports all 2,972 mutation identities, sequences and labels matching the earlier prepared inputs.', [aid],
            {'field': 'links:same_data_as:rewire-dataset-proteingym-amfr-v13', 'value': 'rewire-dataset-proteingym-amfr-v13',
             'source_locator': 'source_alignment; source_assay_sha256; prepared_sha256'}, [link('subject', did)], area)
    family = [link('family', 'discovery-model-esm-2')] if key in ['esm2-8m', 'esm2-35m'] else []
    put(mid, 'configuration', label + ' (' + title + ')', description, [sid, aid],
        {'source_locator': 'model; model_configuration; protocol_configuration.embedding_probe; execution',
         'configuration': report['model_configuration'], 'execution': report['execution'], 'model': report['model'],
         'environment': report['environment'], 'training_overlap': report['model']['training_overlap'],
         'method_role': 'null control' if is_mfass or is_pg else 'simple statistical baseline' if key == 'composition22' else 'frozen pretrained encoder plus trained regression head'}, family, area)
    if family:
        put(mid + '-family', 'claim', 'Evaluated ESM-2 checkpoint belongs to ESM-2',
            'Family membership does not transfer this frozen-encoder-plus-head result to all ESM-2 configurations.', [sid],
            {'field': 'links:family:discovery-model-esm-2', 'value': 'discovery-model-esm-2', 'source_locator': 'model_configuration.checkpoint; model.name',
             'review': {'method': 'automated_execution_evidence_review', 'reviewed_at': DATE}}, [link('subject', mid)], area)
    compare = {'protocol_id': pid, 'dataset_version': did, 'split': 'split-v2.tsv' if is_mfass else 'Full assay; no train/test split' if is_pg else 'canonical test',
               'subset': report['dataset_id'], 'population': f"{entry['coverage']['scored']}/{entry['coverage']['denominator']}",
               'inputs': report['input_information'], 'adaptation': 'training class prior; no sequence fitting' if is_mfass else 'none; seed fixed before scoring' if is_pg else 'fixed train-only ridge on frozen representations',
               'metric_implementation': report['environment']['sdk_code_sha256'], 'aggregation': 'single assay' if is_pg else 'all held-out test rows of the selected target',
               'budget': 'one local CPU evaluation; no held-out hyperparameter selection'}
    put(rid, 'evaluation', label + ' on ' + title, description, [sid, aid, iid],
        {'origin': 'rewire_run', 'execution_scope': 'complete_selected_evaluation', 'published_score_reproduction': False,
         'protocol': title, 'version': report['protocol_version'], 'source_locator': 'metrics; coverage; protocol_results',
         'original_sdk_scope': report['scope'], 'original_sdk_completion': report['completion'], 'suite_complete': False,
         'eligible_count': entry['coverage']['denominator'], 'scored_count': entry['coverage']['scored'], 'missing_count': 0,
         'coverage': compare['population'], 'comparison': compare, 'input_information': report['input_information'],
         'model_configuration': report['model_configuration'], 'protocol_configuration': report['protocol_configuration'],
         'provenance': report['provenance'], 'predictions_sha256': report['predictions_sha256'], 'prepared_sha256': report['prepared_sha256'],
         'execution': report['execution'], 'timing_seconds': report['timing_seconds'], 'environment': report['environment'],
         'run_url': url(pin['report']['path']), 'reproduction_url': url(path),
         'reproduction_note': 'The linked pinned scripts describe this exact execution. No generic suite recipe is claimed to reproduce it; this review only checked existing artifacts.',
         'limitations': entry['limitations']}, [link('configuration', mid), link('protocol', pid), link('dataset', did)], area)
    metrics = {k: v for k, v in entry['metrics'].items() if k in (['auroc', 'average_precision_sklearn', 'precision_at_capacity'] if is_mfass else ['spearman', 'ndcg'] if not is_pg else list(entry['metrics']))}
    metric_path = '.'.join(entry['metric_path'])
    for metric, value in metrics.items():
        put(rid.replace('-evaluation-', '-result-') + '-' + metric.lower().replace('_', '-'), 'result', label + ': ' + metric,
            description, [sid, aid], {'printed_value': f'{value:.3f}' if is_pg else str(value), 'numeric_value': str(value),
            'metric': metric, 'metric_key': metric, 'metric_direction': 'higher', 'unit': 'dimensionless', 'uncertainty': None,
            'eligible_count': entry['coverage']['denominator'], 'scored_count': entry['coverage']['scored'], 'missing_count': 0,
            'coverage': compare['population'], 'source_locator': metric_path + '.' + metric,
            'review': {'method': 'automated_execution_evidence_review', 'reviewed_at': DATE,
                       'notes': 'Report and bundle values, pinned audit bindings and declared scope checked. No new run or published-score reproduction.'},
            'missing_metadata': {'uncertainty': 'Not estimated; one selected evaluation.'}}, [link('evaluation', rid)], area)
    evidence.append({'evaluation_id': rid, 'expected_count': entry['coverage']['denominator'], 'scored_count': entry['coverage']['scored'], 'missing_count': 0,
                     'metrics': metrics, 'metric_path': metric_path, 'report': report, 'report_sha256': pin['report']['sha256'], 'report_source_id': sid,
                     'execution_audit': audit, 'audit_run': entry['audit_run'], 'audit_sha256': pin['audit']['sha256'], 'audit_source_id': aid})
text = ''.join(json.dumps(r, separators=(',', ':'), ensure_ascii=False, allow_nan=False) + '\n' for r in records)
evidence_text = pretty({'schema_version': '1.0', 'source_revision': REV, 'evaluations': evidence})
receipt = {'schema_version': '1.0', 'status': 'reviewed', 'review_method': 'automated', 'reviewed_at': DATE,
           'records_sha256': sha(text.encode()), 'evidence_sha256': sha(evidence_text.encode()), 'source_revision': REV,
           'evaluation_ids': [e['evaluation_id'] for e in evidence], 'errors': [],
           'limitations': ['Automated artifact and agent source review; no human review claimed.', 'Existing local executions, not new model runs or reproduction of published model scores.',
                          'One selected split or assay; single-seed controls are not uncertainty estimates.', 'Raw predictions remain private. Source identities and hashes do not establish pretraining freedom from overlap.']}
(ROOT/'records.jsonl').write_text(text); (ROOT/'evidence.json').write_text(evidence_text); (ROOT/'review.json').write_text(pretty(receipt))
print(json.dumps({'new_records': len(records), 'evaluations': len(evidence), 'results': sum(r['kind'] == 'result' for r in records)}))
