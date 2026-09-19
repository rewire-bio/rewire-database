#!/usr/bin/env python3
"""Separate-agent review of challenge acquisition bytes, values and bounded scope."""
import csv,gzip,hashlib,io,json,re
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[3]
BASE=ROOT/'data/omics/acquisition/2026-09-19/challenges'
sources={x['id']:x for x in map(json.loads,(BASE/'sources.jsonl').read_text().splitlines())}
parsed={}; bytehash={}
for k,s in sources.items():
 p=ROOT/s['artifact']; b=p.read_bytes(); b=gzip.decompress(b) if b[:2]==b'\x1f\x8b' else b
 assert hashlib.sha256(b).hexdigest()==s['sha256'],k
 bytehash[k]=s['sha256'];lines=b.decode(errors='strict').splitlines()
 if k=='casp16-domains':parsed[k]=(lines,lines[0].split(),lambda s:s.split())
 elif k=='capri61':parsed[k]=(lines,next(csv.reader([lines[5]])),lambda s:next(csv.reader([s])))
 elif k=='cami2-marine':parsed[k]=(lines,lines[0].split('\t'),lambda s:s.split('\t'))
 elif 'fmax_sheet' in k:parsed[k]=(lines,next(csv.reader([lines[0]])),lambda s:next(csv.reader([s])))
rs=[json.loads(l) for l in (BASE/'candidates.jsonl').read_text().splitlines()]
errors=[];counts=Counter()
for r in rs:
 lines,header,parser=parsed[r['source_id']]
 line=int(re.search(r'line (\d+)',r['source_locator'])[1]);source=dict(zip(header,parser(lines[line-1])))
 assert r['artifact_sha256']==bytehash[r['source_id']]
 assert source[r['metric']]==r['printed_value']
 assert r['numeric_value']==float(source[r['metric']])
 assert r['conditions']['raw_row']==source
 counts[r['benchmark_id']]+=1
 if 'casp' in r['benchmark_id']:
  assert re.fullmatch(r'T1201TS\d+_1-D1',source['Model']) and source['Model']==r['conditions']['submission']
 elif 'capri' in r['benchmark_id']:
  assert source['round']=='61' and source['p_type']=='P' and source['model']=='1'
  assert source['target_id']==r['dataset'].split()[-1]
 elif 'cami' in r['benchmark_id']:
  assert source['Sample']=='marmgCAMI2_short_read_pooled_gold_standard_assembly' and source['binning type']=='genome'
  assert r['conditions']['gold_standard_reference']==(source['Tool']=='Gold standard')
  matches={'Average completeness (bp)':'Std error of av. completeness (bp)','Average completeness (seq)':'Std error of av. completeness (seq)','Average purity (bp)':'Std error of av. purity (bp)','Average purity (seq)':'Std error of av. purity (seq)'}
  if r['metric'] in matches and source.get(matches[r['metric']]) and not r['uncertainty']:
   errors.append({'candidate_id':r['candidate_id'],'issue':'Matching standard error is stored in raw row but omitted from result uncertainty','column':matches[r['metric']]})
 else:
  assert r['conditions']['evaluation_mode'].startswith('mode1')
  assert r['uncertainty']['printed_sd']==source['F1-max Std(B)']
  assert r['conditions']['coverage']==source['Coverage']
# Independently count all first-submission rows in the selected official scopes.
casp=[l.split() for l in parsed['casp16-domains'][0][1:] if re.search(r'\bT1201TS\d+_1-D1\b',l)]
capri=[r for r in csv.DictReader(io.StringIO('\n'.join(parsed['capri61'][0][5:]))) if r['p_type']=='P' and r['model']=='1']
assert len(casp)*3==counts['discovery-benchmark-casp']==270
assert len(capri)*4==counts['discovery-benchmark-capri']==400
assert len({r['conditions']['raw_row']['Tool'] for r in rs if r['benchmark_id']=='discovery-benchmark-cami'})==16
for ontology in ('mfo','bpo','cco'):
 relevant=[r for r in rs if r['source_id']==f'cafa3-{ontology}_all_type1_mode1_all_fmax_sheet']
 assert len(relevant)==146
receipt={'reviewed_at':'2026-09-19','reviewer':'separate source_cells_networks agent','review_method':'AI-assisted scientific scope review plus independent automated raw-byte/table-cell checks','candidate_sha256':hashlib.sha256((BASE/'candidates.jsonl').read_bytes()).hexdigest(),'candidates_checked':len(rs),'counts':dict(counts),'source_hashes_checked':len(sources),'value_and_identity_check':'all passed','bounded_completeness_check':'all passed','issues':errors,'status':'corrections_requested' if errors else 'supported_with_explicit_limitations','limitations':['No methods inferred from participant IDs','CAFA mode1 remains unresolved; retain exact table scope and do not compare with another mode','CAMI gold standard must be presented as a reference not a competing method','CAPRI predictor model1 and CASP first-submission domain scores are not challenge-wide best-of-N rankings','No independent model execution or human review']}
(ROOT/'data/omics/acquisition/2026-09-19/cells-networks/challenges-independent-review.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k!='issues'},indent=2));print('issues:',len(errors))
