#!/usr/bin/env python3
"""Extract bounded source tables; does not publish or claim scientific reproduction."""
import csv
from decimal import Decimal
import gzip
import hashlib
import io
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DEST = ROOT / 'data/omics/acquisition/2026-09-19/cells-networks'
SPECS = json.loads((DEST / 'source-manifest.json').read_text())

def read(name):
    item = next(s for s in SPECS if s['file'] == name)
    raw = gzip.decompress((DEST / 'sources' / (name + '.gz')).read_bytes())
    assert hashlib.sha256(raw).hexdigest() == item['sha256'], name
    return raw, item

rows = []
def add(spec, benchmark, locator, model, protocol, dataset, metric, printed, unit, direction, conditions, **extra):
    value = None if printed in ('', 'NA', 'NaN', 'nan', 'null') else float(printed)
    assert value is None or math.isfinite(value)
    identity = f"{spec['source_id']}|{locator}"
    rows.append(dict(candidate_id='candidate-' + hashlib.sha256(identity.encode()).hexdigest()[:20],
      benchmark_id=benchmark, source_id=spec['source_id'], source_url=spec['url'], source_version=spec['version'],
      artifact_sha256=spec['sha256'], source_locator=locator, model_or_submission=model,
      protocol=protocol, dataset=dataset, metric=metric, printed_value=printed, numeric_value=value,
      unit=unit, direction=direction, uncertainty={'status':'unreported'}, conditions=conditions,
      evidence_origin='author-reported', review_status='candidate-unreviewed',
      missing_reason='Source cell is empty or explicitly NA; cause not established.' if value is None else None, **extra))

# Entire source data matrices for BEELINE figures 2 and 4.
for num, fig in [(12,2),(13,4)]:
    raw,spec=read(f'beeline-{num}_ESM.csv'); table=list(csv.reader(io.StringIO(raw.decode())))
    assert len(table) == 14 and all(len(r)==len(table[0]) for r in table)
    for ri,r in enumerate(table[2:],3):
        for ci,v in enumerate(r[1:],2):
            metric=table[0][ci-1]; dataset=table[1][ci-1]
            add(spec,'discovery-benchmark-beeline',f'Figure {fig} source CSV row {ri}, column {ci}',r[0],
              f'BEELINE 2020 Figure {fig}',dataset,metric,v,
              'fraction' if metric=='Stability Across Datasets' else 'ratio','higher',
              {'aggregation':'Median across source-described simulation datasets', 'dropout':'none',
               'simulated_dataset_count':20 if fig==2 else 10,
               'cell_counts':[2000,5000] if fig==2 else [2000],
               'notes':'Across-dataset stability is median pairwise top-k edge-set Jaccard index (paper Online Methods), not Spearman correlation. Not an independent experimental run.'})
# Figure 5: retain every method value and every network context. Network statistics are context, not results.
raw,spec=read('beeline-14_ESM.csv'); table=list(csv.reader(io.StringIO(raw.decode())))
assert all(len(r)==20 for r in table)
for ri,r in enumerate(table[3:],4):
    for start in (2,11):
        condition={'gene_selection':table[0][start], 'reference_network':r[0],
          'transcription_factors':int(r[start]),'network_genes':int(r[start+1]),'network_density_printed':r[start+2]}
        for ci in range(start+3,start+9):
            add(spec,'discovery-benchmark-beeline',f'Figure 5 source CSV row {ri}, column {ci+1}',table[2][ci],
                'BEELINE 2020 Figure 5',r[1],'Early Precision Ratio',r[ci],'ratio','higher',condition)
# A complete bounded scIB dataset block, not cherry-picked methods or only nonmissing scores.
raw,spec=read('scib-metrics.csv'); table=list(csv.reader(io.StringIO(raw.decode())))
selected=0
for ri,r in enumerate(table[1:],2):
    if not r[0].startswith('/pancreas/'):continue
    selected+=1
    _,dataset,_,scaling,features,configuration=r[0].split('/')
    assert len(r)==15
    for ci,v in enumerate(r[1:],2):
        add(spec,'discovery-benchmark-scib',f'data/metrics.csv row {ri}, column {ci} ({table[0][ci-1]})',configuration,
            'scIB official RNA metrics export',dataset,table[0][ci-1],v,'score','higher',
            {'scaling':scaling,'features':features,'configuration':configuration,'cells':16382,'batches':9,'labels':14,
             'notes':'Published metric-score export; intended higher direction verified from pinned official consuming code. No additional min-max normalization or overall ranking. Dataset metadata reports total cells; per-result scoring coverage is unreported.'})
assert selected==69
# Every submission's overall score in the captured public provisional leaderboard; no personal member data exported.
raw,spec=read('vcc-leaderboard.json'); board=json.loads(raw, parse_float=Decimal)
assert len(board['entries'])==board['num_entries']
for i,r in enumerate(board['entries']):
    assert r['panel_id']=='vcc2026-val-1' and r['partition']=='val' and r['is_final'] is False
    add(spec,'discovery-benchmark-virtual-cell-challenge-2026',f'JSON entries[{i}].score_avg; submission {r["id"]}',
        f'{r["team_name"]}: {r.get("model_name") or "model name unreported"} [submission {r["id"]}]',
        r['panel_id'], '2026 validation contexts A, B and C', 'score_avg',str(r['score_avg']) if r['score_avg'] is not None else 'null',
        'score','higher',{'submission_id':r['id'],'team_id':r['team_id'],'model_name_reported':r.get('model_name'),
          'anchor_version':r['anchor_version'],'submission_date':r['submission_date'],'is_final':False,
          'snapshot_date':'2026-09-19','notes':'Provisional overall validation score only. Team/model labels do not establish a catalogue model identity; do not infer family aliases. Final test results unavailable at snapshot date.'})
# Complete 10-file author timing export. Keep individual files separate; do not invent aggregate timings.
for repeat in range(1,11):
    raw,spec=read(f'petab-jl-computation_times{repeat}.csv'); table=list(csv.DictReader(io.StringIO(raw.decode())))
    for ri,r in enumerate(table,2):
        for metric in ('t_sim','t_fwd','t_adj'):
            add(spec,'discovery-benchmark-petab-benchmark-collection',f'Intermediate/AMICI_cost_grad/computation_times{repeat}.csv row {ri}, column {metric}',
              f'AMICI ({metric})','PEtab_benchmark nominal-parameter cost/gradient timing export',r[''],metric,r[metric],
              'unextracted','lower',{'source_file_index':repeat,'parameter_count_printed':r['np'],
                'configuration_status':'incomplete','notes':'Author repository explicitly describes precursor to formal PEtab.jl. Hardware, exact timing scope, units and software versions require further verification before chart publication. Not assigned to the 2025 paper.'})

assert len({r['candidate_id'] for r in rows}) == len(rows)
(DEST/'candidates.jsonl').write_text(''.join(json.dumps(r,sort_keys=True,ensure_ascii=False)+'\n' for r in rows))
from collections import Counter
print(json.dumps({'candidate_rows':len(rows),'by_benchmark':dict(Counter(r['benchmark_id'] for r in rows)),
 'numeric_rows':sum(r['numeric_value'] is not None for r in rows)},indent=2))
