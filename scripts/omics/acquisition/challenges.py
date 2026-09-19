#!/usr/bin/env python3
"""Pin official challenge exports and produce bounded candidates, never publication records.
Run with --fetch for first acquisition, then without arguments for offline reproduction.
Review is a second direct-cell parser check, not human review or experimental reproduction.
"""
import argparse, csv, gzip, hashlib, io, json, math, re, tarfile, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'data/omics/acquisition/2026-09-19/challenges'
CACHE = Path('/tmp/rewire-audit-challenges')
DATE = '2026-09-19'
CAMI_REV = '501b543f65d62e5c1d6c3813be0badcac5e079ca'
SOURCES = [
 ('casp16-domains', 'https://predictioncenter.org/download_area/CASP16/results/tables/CASP16_prot_domains.scores.csv', 'CASP16, snapshot 2026-09-19', 'casp'),
 ('casp16-results', 'https://predictioncenter.org/casp16/results.cgi?tr_type=regular', 'snapshot 2026-09-19', 'casp'),
 ('capri61', 'https://www.capri-docking.org/assessment/files/round61.csv', 'CAPRI round 61, snapshot 2026-09-19', 'capri'),
 ('capri-assessment', 'https://www.capri-docking.org/assessment/', 'snapshot 2026-09-19', 'capri'),
 ('cami2-marine', f'https://raw.githubusercontent.com/CAMI-challenge/second_challenge_evaluation/{CAMI_REV}/binning/genome_binning/marine_dataset/results/amber_marine_nocircular/results.tsv', CAMI_REV, 'cami'),
 ('cami2-marine-procedure', f'https://raw.githubusercontent.com/CAMI-challenge/second_challenge_evaluation/{CAMI_REV}/binning/genome_binning/marine_dataset/README.md', CAMI_REV, 'cami'),
 ('cafa3-manifest', 'https://api.figshare.com/v2/articles/8135393/versions/3', 'Figshare article 8135393 version 3', 'cafa'),
 ('cafa3-paper', 'https://www.ebi.ac.uk/europepmc/webservices/rest/PMC6864930/fullTextXML', 'PMC6864930, snapshot 2026-09-19', 'cafa'),
]

def digest(b): return hashlib.sha256(b).hexdigest()
def dump(path, obj): path.write_text(json.dumps(obj, indent=2, ensure_ascii=False)+'\n')
def jsonl(path, rows): path.write_text(''.join(json.dumps(r, ensure_ascii=False, allow_nan=False)+'\n' for r in rows))
def number(s):
 if s in ('', 'NaN', 'N/A', 'nan'): return None
 assert re.fullmatch(r'-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?',s), s
 n=float(s); assert math.isfinite(n); return n

def main(fetch=False):
 OUT.mkdir(parents=True,exist_ok=True); CACHE.mkdir(parents=True,exist_ok=True)
 manifest_path=OUT/'sources.jsonl'
 old={s['id']:s for s in map(json.loads,manifest_path.read_text().splitlines())} if manifest_path.exists() else {}
 sources={}; artifacts={}
 for key,url,version,benchmark in SOURCES:
  path=OUT/'artifacts'/f'{key}.gz'
  if fetch and not path.exists():
   data=urllib.request.urlopen(url,timeout=120).read()
   path.write_bytes(gzip.compress(data,mtime=0))
  data=gzip.decompress(path.read_bytes())
  if key in old: assert digest(data)==old[key]['sha256'],key
  sources[key]={'id':key,'benchmark_id':'discovery-benchmark-'+benchmark,'url':url,'version':version,'retrieved_at':DATE,'sha256':digest(data),'bytes':len(data),'artifact':str(path.relative_to(ROOT)),'reuse':'Unreported by downloaded artifact; factual measurements attributed to official assessment. No reuse licence inferred.'}
  artifacts[key]=data.decode()
 # Preserve only selected CC-0 result sheets and README; archive remains outside Git.
 archive_manifest=OUT/'cafa3-archive.json'
 if fetch and not archive_manifest.exists():
  archive=CACHE/'cafa3.tar.gz'
  if not archive.exists():urllib.request.urlretrieve('https://ndownloader.figshare.com/files/17519846',archive)
  payload=archive.read_bytes(); assert hashlib.md5(payload).hexdigest()=='2eae900f6f3b60228fb99771576c3a12'
  names=['supplementary_data/00README.txt']+[f'supplementary_data/cafa3/sheets/{o}_all_type1_mode1_all_fmax_sheet.csv' for o in ['mfo','bpo','cco']]
  with tarfile.open(archive) as tar:
   members=[]
   for name in names:
    data=tar.extractfile(name).read(); path=OUT/'artifacts'/Path(name).name; path.write_bytes(data)
    members.append({'member':name,'artifact':str(path.relative_to(ROOT)),'sha256':digest(data),'bytes':len(data)})
  dump(archive_manifest,{'url':'https://ndownloader.figshare.com/files/17519846','version':'Figshare 8135393 v3, file 17519846','sha256':digest(payload),'md5':hashlib.md5(payload).hexdigest(),'bytes':len(payload),'members':members,'reuse':'Archive README explicitly CC-0; Figshare metadata CC BY 4.0. Both statements retained rather than silently resolved.'})
 archive=json.loads(archive_manifest.read_text())
 for item in archive['members']:
  data=(ROOT/item['artifact']).read_bytes(); assert digest(data)==item['sha256']
  key='cafa3-'+Path(item['member']).stem
  sources[key]={'id':key,'benchmark_id':'discovery-benchmark-cafa','url':archive['url'],'version':archive['version'],'retrieved_at':DATE,'sha256':digest(data),'bytes':len(data),'artifact':item['artifact'],'archive_sha256':archive['sha256'],'archive_member':item['member'],'reuse':archive['reuse']}
  artifacts[key]=data.decode()
 rows=[]; receipts=[]; ledgers=[]
 def add(source,model,protocol,dataset,metric,printed,unit,direction,locator,conditions,uncertainty=None):
  src=sources[source]
  row={'benchmark_id':src['benchmark_id'],'source_id':source,'source_url':src['url'],'source_version':src['version'],'artifact_sha256':src['sha256'],'source_locator':locator,'model_or_submission':model,'protocol':protocol,'dataset':dataset,'metric':metric,'printed_value':printed,'numeric_value':number(printed),'unit':unit,'direction':direction,'uncertainty':uncertainty,'conditions':conditions,'status':'candidate','evidence_origin':'independent_external_evaluation','review_method':'automated_dual_parser_transcription_check','reproduction_status':'not_reproduced'}
  row['candidate_id']='challenge-'+digest(json.dumps([row[k] for k in ['source_id','source_locator','model_or_submission','metric']],ensure_ascii=False).encode())[:20]
  rows.append(row)
 # CASP: complete first submitted model comparison for one domain, no cross-target rankings.
 lines=artifacts['casp16-domains'].splitlines(); headers=lines[0].split(); selected=[]
 assert headers[1:4]==['Model','GR#','GDT_TS']
 for line_no,line in enumerate(lines[1:],2):
  if not line.strip():continue
  values=re.split(r'\s+',line.strip()); assert len(values)==len(headers)
  record=dict(zip(headers,values))
  if not re.fullmatch(r'T1201TS\d+_1-D1',record['Model']):continue
  selected.append(record['Model'])
  for metric,unit in [('GDT_TS','score_0_100'),('LDDT','fraction'),('TMscore','fraction')]:
   add('casp16-domains','CASP16 group '+record['GR#'], 'CASP16 protein domain; first submitted model; T1201-D1', 'CASP16 T1201-D1',metric,record[metric],unit,'higher_is_better',f'line {line_no}; Model={record["Model"]}; column {metric}',{'round':'CASP16','target':'T1201','domain':'D1','submission':record['Model'],'participant_id':record['GR#'],'model_selection':'first submitted model (model number 1), not best of five','coverage_NP_P':record['NP_P'],'aligned_residues_NP':record['NP'],'participant_identity':'Official group code, not resolved to a model family','aggregation':'one assessed domain, no averaging','raw_row':record})
 ledgers.append({'benchmark_id':'discovery-benchmark-casp','status':'candidate_extracted','source_ids':['casp16-domains','casp16-results'],'selection':'Every submitted model number 1 for T1201-D1 in official CASP16 protein-domain export, GDT_TS/LDDT/TMscore','selected_rows':len(selected),'inventory':selected,'gaps':['Other targets, phases and scoring categories not extracted in this bounded batch.','Group code to precise software/checkpoint mapping unextracted.','One domain is not a CASP-wide ranking.']})
 # CAPRI: all first-ranked predictor submissions for every round-61 interface.
 lines=artifacts['capri61'].splitlines(); start=next(i for i,l in enumerate(lines) if l.startswith('target_id,')); selected=[]
 reader=csv.DictReader(lines[start:]); assert 'dockq' in reader.fieldnames
 for index,record in enumerate(reader,start+2):
  assert None not in record,record
  if record['model']!='1' or record['p_type']!='P':continue
  selected.append(record['identification'])
  for metric,unit,direction in [('dockq','fraction','higher_is_better'),('fnat','fraction','higher_is_better'),('lrms','angstrom','lower_is_better'),('irms','angstrom','lower_is_better')]:
   add('capri61',record['name']+' ['+record['p_id']+']','CAPRI round 61 predictor; submitted model 1; '+record['target_id'],'CAPRI round 61 '+record['target_id'],metric,record[metric],unit,direction,f'line {index}; identification={record["identification"]}; column {metric}',{'round':record['round'],'target':record['target'],'interface':record['interface'],'participant_type':record['p_type'],'participant_id':record['p_id'],'submission':record['identification'],'model_selection':'first submitted model, not best of top 5/10','classification':record['classification'],'clashes':record['clashes'],'low_id':record['low_id'],'participant_identity':'Assessment participant, exact implementation unextracted','aggregation':'one interface; no pooling','raw_row':record})
 ledgers.append({'benchmark_id':'discovery-benchmark-capri','status':'candidate_extracted','source_ids':['capri61','capri-assessment'],'selection':'Every round-61 predictor (P) model number 1, all four interfaces, DockQ/fnat/L-RMS/i-RMS','selected_rows':len(selected),'inventory':selected,'gaps':['Scorer submissions, other rounds and other ranked models not extracted in this bounded batch.','Participant names are not verified method/checkpoint identities.','Official assessment says data may undergo minor changes; snapshot hash fixes this acquisition.']})
 # CAMI: full marine GSA comparison, original fractions including weak and gold-standard rows.
 lines=artifacts['cami2-marine'].splitlines(); selected=[]
 metrics=['Accuracy (bp)','Accuracy (seq)','Adjusted Rand index (bp)','Adjusted Rand index (seq)','Average completeness (bp)','Average completeness (seq)','Average purity (bp)','Average purity (seq)','Completeness (bp)','Completeness (seq)','F1 score (bp)','F1 score (seq)','Purity (bp)','Purity (seq)','Percentage of binned bp','Percentage of binned sequences']
 for index,record in enumerate(csv.DictReader(lines,delimiter='\t'),2):
  assert None not in record
  selected.append(record['Tool'])
  for metric in metrics:
   add('cami2-marine',record['Tool'],'CAMI II marine genome binning; pooled short-read gold-standard assembly; circular elements excluded',record['Sample'],metric,record[metric],('dimensionless' if metric.startswith('Adjusted Rand') else 'fraction'),'higher_is_better',f'line {index}; Tool={record["Tool"]}; column {metric}',{'edition':'CAMI II','evaluator':'AMBER','binning_type':record['binning type'],'rank':record['rank'],'circular_elements':'excluded by -k circular element','input':'pooled short-read gold-standard assembly','gold_standard_reference':record['Tool']=='Gold standard','aggregation':'source aggregate over pooled assembly, not sample averaging','raw_row':record}, ({'kind':'standard_error','printed_value':record['Std error of av. '+metric[len('Average '):]],'source_column':'Std error of av. '+metric[len('Average '):]} if metric.startswith('Average ') else None))
 ledgers.append({'benchmark_id':'discovery-benchmark-cami','status':'candidate_extracted','source_ids':['cami2-marine','cami2-marine-procedure'],'selection':'All rows and 16 explicitly named accuracy/coverage metrics of AMBER marine pooled GSA results; companion columns retained in raw_row','selected_rows':len(selected),'inventory':selected,'gaps':['Assembly, taxonomy profiling/binning and other datasets remain outside this batch.','Gold standard is a reference, not an evaluated predictive method.','Historical source metric named Percentage uses fractions; no conversion performed.']})
 # CAFA3: all anonymous submissions across all three ontology sheets, source mode left literal.
 for ontology in ['mfo','bpo','cco']:
  source='cafa3-'+ontology+'_all_type1_mode1_all_fmax_sheet'; selected=[]
  for index,record in enumerate(csv.DictReader(artifacts[source].splitlines()),2):
   selected.append(record['ID-model'])
   add(source,'CAFA3 '+record['ID-model'],f'CAFA3 {ontology.upper()} all organisms; type1 no-knowledge; mode1',f'CAFA3 final benchmark; {ontology.upper()}; all; type1; mode1','F1-max',record['F1-max'],'fraction','higher_is_better',f'{sources[source]["archive_member"]}; line {index}; ID-model={record["ID-model"]}; column F1-max',{'edition':'CAFA3','ontology':ontology.upper(),'benchmark_type':'type1 (no-knowledge, README definition)','evaluation_mode':'mode1, numeric mode-to-protocol mapping not established by README','organisms':'all','participant_identity':'Anonymized official submission code; no method identity inferred','coverage':record['Coverage'],'threshold':record['Threshold'],'aggregation':'source F1-max, not bootstrap mean','raw_row':record},{'kind':'source_bootstrap_summary','printed_sd':record['F1-max Std(B)'],'printed_mean':record['F1-max Avg(B)'],'note':'Separate source Avg(B) and Std(B) columns; not a confidence interval on the printed F1-max.'})
  ledgers.append({'benchmark_id':'discovery-benchmark-cafa','status':'candidate_extracted_with_protocol_gap','source_ids':[source,'cafa3-00README','cafa3-paper','cafa3-manifest'],'selection':f'Complete {ontology}_all_type1_mode1_all_fmax_sheet.csv; all submissions, F1-max with complete companion columns retained','selected_rows':len(selected),'inventory':selected,'gaps':['Anonymous submission identities remain unresolved.','The numeric mode1 to full/partial mapping is not explicitly given in downloaded README; preserve literal mode and quarantine comparisons to other modes.','Newer CAFA rounds remain unextracted.']})
 # Independent verification: do not reuse structured extractor dictionaries.
 for r in rows:
  source=r['source_id']; text=artifacts[source]; loc=r['source_locator']; line=int(re.search(r'line (\d+)',loc)[1]); original=text.splitlines()[line-1]
  if source=='casp16-domains':
   # Independent positional token parser; offsets checked against the official header.
   position={'GDT_TS':3,'LDDT':20,'TMscore':24}[r['metric']]
   assert text.splitlines()[0].split()[position]==r['metric']
   observed=next(csv.reader([original.strip()],delimiter=' ',skipinitialspace=True))[position]
  else:
   separator='\t' if source=='cami2-marine' else ','
   # Explicitly reject quoted fields before direct-cell verification.
   assert '"' not in original
   header=next(l for l in text.splitlines() if l.startswith('target_id,')) if source=='capri61' else text.splitlines()[0]
   observed=original.split(separator)[header.split(separator).index(r['metric'])]
  assert observed==r['printed_value'],r['candidate_id']
  assert number(observed)==r['numeric_value']
 assert len({r['candidate_id'] for r in rows})==len(rows)
 for item in ledgers:
  item.update({'searched_at':DATE,'queries':['official assessment score exports','original paper supplementary data'],'review_status':'automated_transcription_checked; scientific identity/protocol gaps retained','source_checked_is_reproduced':False})
 jsonl(manifest_path,sources.values()); jsonl(OUT/'candidates.jsonl',rows); jsonl(OUT/'ledger.jsonl',ledgers)
 dump(OUT/'verification.json',{'date':DATE,'reviewer_type':'automated','review_method':'Structured parser extraction cross-checked with independent direct-cell/column parser for every candidate; source bytes hash-pinned. Not independent scientific reproduction or human review.','candidates_checked':len(rows),'checks':['all source hashes','all selected values exact printed equality','numeric parse finite or explicit missing','candidate identity uniqueness','bounded inventory retained'],'counts':{b:sum(r['benchmark_id']=='discovery-benchmark-'+b for r in rows) for b in ['casp','capri','cami','cafa']},'candidates_sha256':digest((OUT/'candidates.jsonl').read_bytes()),'extractor_sha256':digest(Path(__file__).read_bytes()),'scientific_review_status':'pending independent scientific review; candidate records only'})
 print(json.dumps(json.loads((OUT/'verification.json').read_text()),indent=2))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--fetch',action='store_true');main(parser.parse_args().fetch)
