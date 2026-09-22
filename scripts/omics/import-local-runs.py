#!/usr/bin/env python3
"""Import the reviewed September local execution batch without altering old records.

Run only after the public evidence commit is fixed. Public sources are pinned to
that commit; numerical values are copied from the sanitized execution reports.
"""
import argparse
import hashlib
import json
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('evidence_root', type=Path)
p.add_argument('source_revision')
p.add_argument('--reviewed-at', required=True)
p.add_argument('--submission-receipt', type=Path, required=True)
a = p.parse_args()
assert len(a.source_revision) == 40 and all(c in '0123456789abcdef' for c in a.source_revision)
out = Path('data/omics/reviewed/local-runs-2026-09-20')
out.mkdir(parents=True, exist_ok=True)
sha = lambda b: hashlib.sha256(b).hexdigest()
pretty = lambda v: json.dumps(v, indent=2, ensure_ascii=False, allow_nan=False) + '\n'
raw = f'https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/{a.source_revision}/research/local-runs-2026-09-20'
view = f'https://github.com/rewire-bio/rewire-benchmarks/blob/{a.source_revision}/research/local-runs-2026-09-20'
records = []
runs = []

def put(ident, kind, name, desc, sources, attrs, links=None, area='proteins-complexes'):
    record = dict(id=ident, kind=kind, name=name, description=desc, status='source_checked', facets={'areas':[area]}, source_ids=sources, links=links or [], attributes=attrs)
    records.append(record)
    return record

def link(relation, target):
    return dict(relation=relation, target_id=target)

def association(subject, relation, target, source, locator, explanation):
    put(f'{subject}-{relation.replace("_","-")}-{target}', 'claim', explanation, explanation, [source],
        dict(field=f'links:{relation}:{target}', value=target, source_locator=locator,
             review=dict(method='automated_execution_evidence_review', reviewed_at=a.reviewed_at)), [link('subject', subject)])

configs = [
 ('flip2-composition','flip2','Amino-acid composition + fixed ridge'),
 ('flip2-train-mean','flip2','Training-mean control'),
 ('mrnabench-composition','mrnabench','Sequence composition + RidgeCV'),
 ('mrnabench-train-mean','mrnabench','Training-mean control'),
 ('proteingym-esm2','proteingym','ESM-2 8M masked-marginal scoring'),
]
scopes = {
 'flip2': ('FLIP2 Rhomax by_wild_type', 'Predict measured Rhomax wavelengths (nm) from amino-acid sequence on all 184 held-out archived test records. This selected split is not a complete FLIP2 score.', 'rewire-protocol-flip2-rhomax-by-wild-type-v1', 'rewire-dataset-flip2-rhomax-by-wild-type-v3', 'discovery-benchmark-flip2'),
 'mrnabench': ('mRNABench Sample designed MRL', 'Predict target_mrl_designed from sequence on the complete 15,003-record canonical test split. Train-only RidgeCV differs from upstream default validation evaluation; this is not an aggregate mRNABench score.', 'rewire-protocol-mrnabench-designed-mrl-v1', 'rewire-dataset-mrnabench-designed-mrl-v1', 'discovery-benchmark-mrnabench'),
 'proteingym': ('ProteinGym v1.3 AMFR substitution assay', 'Score all 2,972 variants in AMFR_HUMAN_Tsuboyama_2023_4G3O with ESM-2 8M masked marginals. This single-assay result is not a full ProteinGym track or suite score.', 'rewire-protocol-proteingym-amfr-v13', 'rewire-dataset-proteingym-amfr-v13', 'discovery-benchmark-proteingym'),
}
for key, suite, label in configs:
    report_bytes = (a.evidence_root/key/'report.json').read_bytes()
    report = json.loads(report_bytes)
    assert report['coverage']['scored'] == report['coverage']['denominator'] and report['coverage']['unscored'] == 0
    source_file = a.evidence_root/key/('retrieval.json' if suite == 'proteingym' else 'source.json')
    source_evidence = json.loads(source_file.read_bytes()) if source_file.exists() else {}
    audit_bytes = (a.evidence_root/key/'audit.json').read_bytes()
    execution_audit = json.loads(audit_bytes)
    checks = execution_audit['checks']
    assert (all(check['status'] == 'passed' for check in checks) if isinstance(checks,list) else all(value is True for value in checks.values()))
    assert checks, 'Execution audit must contain checks'
    sid = f'rewire-local-20260920-source-{key}'
    aid = f'rewire-local-20260920-audit-source-{key}'
    rid = f'rewire-local-20260920-evaluation-{key}'
    mid = f'rewire-local-20260920-configuration-{key}'
    title, description, pid, did, bid = scopes[suite]
    area = 'rna-transcriptomics' if suite == 'mrnabench' else 'proteins-complexes'
    put(sid, 'source', f'{label}: local execution report (20 September 2026)',
        'Public sanitized execution evidence. Raw sequences and predictions remain local. Automated checking does not establish reproduction of a published model score.', [],
        dict(url=f'{view}/{key}/report.json', artifact_url=f'{raw}/{key}/report.json', artifact_sha256=sha(report_bytes),
             version=a.source_revision, retrieved_at=a.reviewed_at, source_type='rewire_execution_report',
             evidence_origin='rewire_run', retrieval_note='Generated local execution report, verified against saved predictions; immutable public Git source.'), area=area)
    put(aid, 'source', f'{label}: automated execution audit', 'Verification of coverage, saved predictions and reference metric calculations; no human review or published-score reproduction implied.', [],
        dict(url=f'{view}/{key}/audit.json', artifact_url=f'{raw}/{key}/audit.json', artifact_sha256=sha(audit_bytes),
             version=a.source_revision, retrieved_at=a.reviewed_at, source_type='automated_execution_audit'), area=area)
    if not any(record['id'] == pid for record in records):
        protocol = put(pid, 'protocol', title, description, [sid], dict(
            protocol_id=report['protocol_id'], version=report['protocol_version'],
            procedure=report.get('protocol_configuration', {}),
            source_locator='protocol_configuration; protocol_results; provenance',
            access_note='See the pinned execution report and source retrieval evidence. Dataset reuse terms are source-specific.',
            reproducibility_note='Fresh local evaluation; reference metric agreement is not reproduction of a paper score.',
            reproduction_url=f'{view}/README.md'), [link('part_of', bid)], area)
        association(pid, 'part_of', bid, sid, 'protocol_id; protocol_configuration; provenance', 'Selected concrete evaluation protocol belongs to this benchmark; no suite-wide score is implied.')
        put(did, 'dataset_subset', title + (' full assay' if suite=='proteingym' else ' test subset'), description, [sid], dict(
            version=report.get('provenance', {}).get('dataset_version') or report.get('provenance', {}).get('dataset_revision') or 'ProteinGym-v1.3',
            dataset_id=report['dataset_id'], selected_assay='AMFR_HUMAN_Tsuboyama_2023_4G3O' if suite=='proteingym' else None, source_locator='coverage; protocol_configuration; provenance',
            test_count=report['coverage']['denominator'],
            split_counts=source_evidence.get('split_counts', report.get('protocol_configuration', {}).get('split_counts')),
            provenance=report.get('provenance', {}), source_evidence=source_evidence,
            subset_scope='All selected test rows; this is not the whole benchmark suite.'), area=area)
    family_links = [link('family','discovery-model-esm-2')] if suite == 'proteingym' else []
    put(mid, 'configuration', label + ' (' + title + ')',
        report.get('model',{}).get('training_overlap') or 'Exact local evaluated configuration; public checkpoint and scoring implementation are pinned in the execution report.', [sid],
        dict(source_locator='model; model_configuration; execution; environment',
            configuration=report.get('model_configuration', {}), execution=report.get('execution',{}),
            model=report.get('model',{}), environment=report.get('environment',{}),
            packages=report.get('packages',{}), method_role='public model' if suite=='proteingym' else 'procedural control',
            training_overlap=report.get('model',{}).get('training_overlap','Unreported; local execution cannot prove absence of pretraining overlap.')),
        family_links, area)
    if family_links:
        association(mid, 'family', 'discovery-model-esm-2', sid, 'model; model_configuration; execution', 'The executed esm2_t6_8M_UR50D checkpoint is an ESM-2 family member; only this exact scoring configuration is evaluated.')
    provenance = report.get('provenance', {})
    comparison = dict(protocol_id=pid, dataset_version=did, split='Full assay; no train/test split' if suite=='proteingym' else 'canonical test', subset=report['dataset_id'],
                      population=f"{report['coverage']['denominator']}/{report['coverage']['denominator']}",
                      inputs=report.get('input_information','ProteinGym reference sequence and mutation; evaluation labels excluded'),
                      adaptation='zero-shot masked marginals' if suite=='proteingym' else 'train-only fitting',
                      metric_implementation=report.get('environment',{}).get('sdk_code_sha256','rewirebench-0.4.0'),
                      aggregation='single assay' if suite=='proteingym' else 'all held-out test rows of the selected target',
                      budget='one local CPU evaluation; no hyperparameter search outside training')
    put(rid, 'evaluation', label + ' on ' + title, description, [sid], dict(
        origin='rewire_run', execution_scope='complete_selected_evaluation', published_score_reproduction=False,
        protocol=title, version=report['protocol_version'], source_locator='metrics; coverage; protocol_results',
        original_sdk_scope=report['scope'], original_sdk_completion=report['completion'],
        eligible_count=report['coverage']['denominator'], scored_count=report['coverage']['scored'], missing_count=0,
        coverage=f"{report['coverage']['scored']}/{report['coverage']['denominator']}", suite_complete=False,
        comparison=comparison, input_information=report.get('input_information'),
        model_configuration=report.get('model_configuration',{}), provenance=provenance,
        predictions_sha256=report.get('predictions_sha256'), prepared_sha256=report.get('prepared_sha256'),
        execution=report.get('execution',{}), timing_seconds=report.get('timing_seconds',{}),
        environment=report.get('environment',{}), run_url=f'{view}/{key}/report.json',
        reproduction_url=f'{view}/README.md',
        limitations=['One selected split or assay; no whole-suite score.', 'No published model score reproduction claim.',
                     'Raw predictions retained locally; hashes and inspected contribution bundle are public.',
                     'Single execution; no seed variability or uncertainty interval estimated.']),
        [link('configuration',mid),link('protocol',pid),link('dataset_subset',did)], area)
    metric_path = 'metrics'
    metric_values = report['metrics']
    if suite == 'proteingym':
        metric_path = 'protocol_results.per_assay.AMFR_HUMAN_Tsuboyama_2023_4G3O.metrics'
        assay = report['protocol_results']['per_assay']['AMFR_HUMAN_Tsuboyama_2023_4G3O']
        assert assay['status'] == 'complete' and assay['eligible'] == assay['scored'] == 2972
        metric_values = assay['metrics']
    metrics = {k:v for k,v in metric_values.items() if k != 'n' and (v is None or isinstance(v,(int,float)))}
    runs.append(dict(evaluation_id=rid, expected_count=report['coverage']['denominator'], scored_count=report['coverage']['scored'], missing_count=0,
                     metrics=metrics, report_sha256=sha(report_bytes), report_source_id=sid, report_url=f'{raw}/{key}/report.json', metric_path=metric_path, report=report, execution_audit=execution_audit, audit_sha256=sha(audit_bytes), audit_source_id=aid))
    reasons = report.get('protocol_results',{}).get('unavailable_metrics',{}) or report.get('protocol_results',{}).get('metric_unavailable_reasons',{})
    for metric, value in metrics.items():
        unit = 'squared mean ribosome load' if metric=='mse' else 'dimensionless'
        put(f'rewire-local-20260920-result-{key}-{metric.lower().replace("_","-")}', 'result', f'{label}: {metric}', description, [sid, aid], dict(
            printed_value=(f'{value:.3f}' if suite == 'proteingym' else str(value)) if value is not None else 'undefined', numeric_value=str(value) if value is not None else None,
            metric=metric, metric_key=metric, metric_direction='lower' if metric=='mse' else 'higher', unit=unit,
            uncertainty=None, eligible_count=report['coverage']['denominator'], scored_count=report['coverage']['scored'], missing_count=0,
            coverage=f"{report['coverage']['scored']}/{report['coverage']['denominator']}", source_locator=f'{metric_path}.{metric}',
            undefined_reason=reasons.get(metric,'Constant prediction: correlation is undefined.') if value is None else None,
            review=dict(method='automated_execution_evidence_review', reviewer='Automated report and saved-prediction verification', reviewed_at=a.reviewed_at,
                        notes='Numerical transcription and coverage checked against execution evidence; not human review or reproduction of a published model score.'),
            missing_metadata={'uncertainty':'Not estimated; one complete selected evaluation.'}), [link('evaluation',rid)], area)

for suite in scopes:
    title, description, pid, did, bid = scopes[suite]
    protocol = next(r for r in records if r['id'] == pid)
    path = 'proteingym-esm2/README.md' if suite == 'proteingym' else 'README.md'
    doc = a.evidence_root/path
    docid = f'rewire-local-20260920-instructions-{suite}'
    put(docid, 'source', title + ': reproduction instructions',
        'Pinned instructions accompanying the local execution evidence. Paths in the website snippet are illustrative; execution verification is recorded separately.', [],
        dict(url=f'{view}/{path}', artifact_url=f'{raw}/{path}', artifact_sha256=sha(doc.read_bytes()), version=a.source_revision,
             retrieved_at=a.reviewed_at, source_type='reproduction_instructions'))
    protocol['source_ids'].append(docid)
    recipeid = f'local-20260920-{suite}-repeat'
    code = ("OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 python research/local-runs-2026-09-20/proteingym-esm2/reproduce.py \\n  --data /data/DMS_ProteinGym_substitutions \\n  --checkpoint /weights/esm2_t6_8M_UR50D.pt \\n  --output /new/private/amfr-run" if suite=='proteingym' else
        "OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python research/local-runs-2026-09-20/run_sequence.py \\n  --flip-source local-inputs/by_wild_type.csv.gz \\n  --mrna-source local-inputs/mrl-sample-designed.parquet \\n  --work local-execution --evidence local-evidence")
    # Replace escaped newlines with actual shell continuation lines.
    code = code.replace('\\n', '\\\n')
    protocol['attributes']['run_recipes'] = [dict(id=recipeid, protocol_id=pid, version=a.source_revision,
        title='Repeat the local AMFR evaluation' if suite=='proteingym' else 'Repeat the four local sequence controls',
        purpose='generate_and_evaluate', summary=description,
        inputs=['Prepared official AMFR assay CSV and pinned ESM-2 checkpoint'] if suite=='proteingym' else ['Pinned Rhomax by_wild_type CSV and Sample designed parquet; script evaluates both datasets and both controls'],
        outputs=['Private predictions, coverage report, metrics and sanitized contribution bundle'],
        requirements=dict(data='Obtain the permitted source files and verify hashes following the cited instructions before running.',
            weights='esm2_t6_8M_UR50D with the documented SHA-256' if suite=='proteingym' else 'No pretrained weights; procedural controls fit only training labels.',
            licence='Follow original dataset and software reuse terms. No dataset or weight redistribution is included.',
            software='Pinned runner checkout; Python 3.11.13 and rewirebench 0.4.0 wheel. Install the exact executed dependency list linked in the instructions.',
            hardware='Executed on macOS arm64 CPU, one thread. No accelerator required; memory and cross-platform performance unreported.'),
        instructions=[dict(runtime='command_line',title='Run from the pinned runner checkout after preparation',code=code,
            status='source_reviewed_not_executed',source_ids=[docid],source_locator='Reproduce section; replace paths with prepared local inputs')],
        limitations=['The script was executed locally, but these portable path examples have not been rerun verbatim.',
            'Only the selected assay or selected sequence controls are evaluated; no suite aggregate.',
            'Use new output directories. Raw predictions and private inputs are not uploaded.',
            'Matching a fresh local result is distinct from reproducing an earlier paper score.'],
        source_ids=[docid],source_locator='Reproduction instructions and execution scope')]
    for record in records:
        if record['kind']=='evaluation' and any(l['target_id']==pid for l in record['links']):
            record['source_ids'].append(docid)
            record['attributes']['reproduction'] = dict(recipe_owner_id=pid,recipe_id=recipeid,applicability='generate_and_evaluate',
                explanation='This committed script regenerates the selected local evaluation with the recorded inputs and configuration. Sequence-control instructions execute all four controls; select this evaluation from their outputs. Raw prior predictions are private, so public evidence alone cannot rescore them.' if suite!='proteingym' else
                    'This committed script regenerates the selected AMFR assay using the recorded checkpoint and masked-marginal scorer. It is not the complete ProteinGym track or a reproduction of a paper score.',
                source_ids=[docid],source_locator='Reproduce section')

for suite, metric in [('flip2','ndcg'),('mrnabench','mse')]:
    title, desc, pid, did, _ = scopes[suite]
    protocol = next(r for r in records if r['id']==pid)
    selected = [r for r in records if r['kind']=='result' and r['attributes']['metric']==metric and any(suite in s for s in r['source_ids'])]
    protocol['attributes']['comparison_panels'] = [dict(id=f'local-20260920-{suite}-{metric}', title=title + ': local controls',
        protocol_id=pid, dataset_id=did, metric=metric, unit=selected[0]['attributes']['unit'], direction='lower' if metric=='mse' else 'higher',
        result_ids=[r['id'] for r in selected], source_ids=[r['source_ids'][0] for r in selected], source_locator=f'Execution reports: metrics.{metric}',
        context='Matched local controls on the same complete selected test split; not a comparison with published model scores.',
        caveats=['One execution per configuration; uncertainty not estimated.', 'This selected protocol is not a benchmark-wide aggregate.'],
        review=dict(method='automated_source_review',date=a.reviewed_at[:10]))]

records_text = ''.join(json.dumps(r,ensure_ascii=False,allow_nan=False,separators=(',',':'))+'\n' for r in records)
submission_receipt = json.loads(a.submission_receipt.read_bytes())
assert submission_receipt['evidence_revision'] == a.source_revision
assert len(submission_receipt['checks']) == 5 and all(c['status']=='passed' and c['network_blocked'] and not c['submitted_to_api'] for c in submission_receipt['checks'])
evidence_text = pretty(dict(schema_version='1.0',source_revision=a.source_revision,evaluations=runs, submission_dry_run_receipt=submission_receipt))
(out/'records.jsonl').write_text(records_text)
(out/'evidence.json').write_text(evidence_text)
(out/'review.json').write_text(pretty(dict(schema_version='1.0',status='reviewed',review_method='automated',reviewed_at=a.reviewed_at,
    records_sha256=sha(records_text.encode()),evidence_sha256=sha(evidence_text.encode()),source_revision=a.source_revision,
    evaluation_ids=[r['evaluation_id'] for r in runs],errors=[],limitations=[
      'Automated verification; no human review claimed.', 'These are new local evaluations, not reproduction of published scores.',
      'No cross-suite aggregate; missing constant-control correlations remain unavailable.',
      'Raw predictions remain local; public reports and input/output hashes support provenance, not independent regeneration without data access.'
    ])))
print(json.dumps({'records':len(records),'evaluations':len(runs)}))
