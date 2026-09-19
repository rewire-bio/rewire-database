#!/usr/bin/env python3
"""Independent locator/transcription check (does not call or import extractor).

CSV inputs here have no quoted fields; deliberately reject quotes instead of
sharing the extraction parser. This verifies source transcription and completeness,
not scientific equivalence, licence clearance, metric direction or reproduction.
"""
import gzip
import hashlib
import json
import math
import re
from collections import Counter
from decimal import Decimal
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
BASE=ROOT/'data/omics/acquisition/2026-09-19/cells-networks'
manifest=json.loads((BASE/'source-manifest.json').read_text())
sources={}
for s in manifest:
    b=gzip.decompress((BASE/'sources'/(s['file']+'.gz')).read_bytes())
    assert hashlib.sha256(b).hexdigest()==s['sha256']
    sources[s['source_id']]=(s,b)
checks=[]
rows=[json.loads(l) for l in (BASE/'candidates.jsonl').read_text().splitlines()]
assert len(rows)==3214 and len({r['candidate_id'] for r in rows})==3214
counts=Counter()

def verify(r):
    s,b=sources[r['source_id']]
    assert r['artifact_sha256']==s['sha256'] and r['source_version']==s['version'] and r['source_url']==s['url']
    counts[s['file']]+=1
    if s['file'].endswith('.csv'):
        assert '"' not in b.decode(), 'Manual independent parser does not support quoted fields'
        lines=[line.split(',') for line in b.decode().splitlines()]
        match=re.search(r'row (\d+), column ([^ ]+)',r['source_locator']);assert match
        row=int(match[1]);col=match[2]; cells=lines[row-1]
        if s['file'].startswith('petab-'):
            col=lines[0].index(col)+1
            assert cells[0]==r['dataset'] and r['metric']==lines[0][col-1]
            assert r['model_or_submission']=='AMICI ('+r['metric']+')'
        else:
            col=int(col)
        observed=cells[col-1]
        if s['file'].startswith('scib-'):
            assert cells[0].startswith('/pancreas/')
            assert cells[0].split('/')[-1]==r['model_or_submission']
            assert r['metric']==lines[0][col-1]
        if s['file'] in ('beeline-12_ESM.csv','beeline-13_ESM.csv'):
            assert r['model_or_submission']==cells[0]
            assert r['metric']==lines[0][col-1] and r['dataset']==lines[1][col-1]
        if s['file']=='beeline-14_ESM.csv':
            assert r['model_or_submission']==lines[2][col-1]
            assert r['dataset']==cells[1] and r['conditions']['reference_network']==cells[0]
    else:
        board=json.loads(b,parse_float=Decimal); assert board['num_entries']==1048
        index=int(re.search(r'entries\[(\d+)\]',r['source_locator'])[1]);entry=board['entries'][index]
        observed='null' if entry['score_avg'] is None else str(entry['score_avg'])
        assert r['conditions']['submission_id']==entry['id']
        assert entry['panel_id']==r['protocol'] and entry['anchor_version']==r['conditions']['anchor_version']
        assert entry['is_final'] is False and entry['partition']=='val'
    assert observed==r['printed_value'], (r['candidate_id'],observed,r['printed_value'])
    if observed in ('','NA','NaN','nan','null'):
        assert r['numeric_value'] is None and r['missing_reason']
    else:
        assert math.isfinite(r['numeric_value']) and Decimal(str(r['numeric_value']))==Decimal(str(float(observed)))
    return True

for r in rows:
    assert verify(r)
    checks.append(dict(candidate_id=r['candidate_id'],source_id=r['source_id'],artifact_sha256=r['artifact_sha256'],source_locator=r['source_locator'],outcome='supported',check_category='numeric-source-transcription',review_method='independent-automated-locator-check',reviewed_at='2026-09-19',limitations='Does not verify scientific interpretation, identity mapping, licences or reproduction.'))
expected={'beeline-12_ESM.csv':144,'beeline-13_ESM.csv':192,'beeline-14_ESM.csv':264,'scib-metrics.csv':966,'vcc-leaderboard.json':1048}
expected.update({f'petab-jl-computation_times{i}.csv':60 for i in range(1,11)})
assert dict(counts)==expected,counts
# Deliberately damaged transcription is rejected by the independent checker.
mutant=dict(rows[0],printed_value='999999')
try:verify(mutant)
except AssertionError:pass
else:raise AssertionError('Mutation was not rejected')
(BASE/'transcription-checks.jsonl').write_text(''.join(json.dumps(x,sort_keys=True)+'\n' for x in checks))
receipt={'reviewed_at':'2026-09-19','review_method':'independent-automated-locator-check','source_artifacts_checked':len(sources),'candidate_rows_checked':len(rows),'numeric_rows':sum(r['numeric_value'] is not None for r in rows),'missing_source_cells':sum(r['numeric_value'] is None for r in rows),'bounded_table_counts':expected,'candidate_file_sha256':hashlib.sha256((BASE/'candidates.jsonl').read_bytes()).hexdigest(),'checker_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'mutation_test':'changed numeric transcription rejected','status':'transcription-supported; publication review still required','not_verified':['human review','independent scientific reproduction','exact model identity mappings','PEtab timing scope and hardware','VCC licence and protocol weighting','BEELINE original source-data reuse terms']}
(BASE/'verification-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(receipt,indent=2))
