#!/usr/bin/env python3
"""Pinned primary-source extraction. No inference or remote submissions.

python3 scripts/omics/acquisition/proteins.py --cache /tmp/rewire-audit-proteins
Requires Poppler pdftotext; uses Python stdlib otherwise. --offline forbids downloads.
The separate checker uses raw PDF text and HTML rather than the extraction formats.
"""
import argparse
import hashlib
import json
import re
import subprocess
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'data/omics/acquisition/2026-09-19/proteins'
SOURCES = {
 'flip2.pdf': ('https://flip.protein.properties/assets/FLIP_manuscipt.pdf', 'd0e61ca27863c023adddcc225a3e4af1718f2e3fdfe3642bef89c24c93621a17'),
 'plinder-stereochemistry.xml': ('https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12658688/fullTextXML?format=xml', '78a77b9a0ab8bfa371f5b9baef3f443f4590d6e71cf864d67e90e9ebdfa7fc1b'),
 'plinder-stereochemistry.html': ('https://pmc.ncbi.nlm.nih.gov/articles/PMC12658688/?pdf=render', '92ea564051dafbc644aa4985959090d828ebee26c356efddba6ae02b08f644e8'),
}
MODELS = ['Ridge (one-hot)', 'Ridge (one-hot + likelihoods)', 'Dayhoff likelihood', 'ESM2-650M likelihood', 'CARP-640M likelihood', 'CARP-640M supervised', 'CARP-640M naive supervised', 'ESMC-300M supervised', 'ESMC-300M naive supervised']
SPLITS = [('Amylase','one-to-many'),('Amylase','close-to-far'),('Amylase','far-to-close'),('Amylase','by-mutation'),('IRED','two-to-many'),('NucB','two-to-many'),('TrpB','one-to-many'),('TrpB','two-to-many'),('TrpB','by-position'),('hydro','three-to-many'),('hydro','low-to-high'),('hydro','to-P06241'),('hydro','to-P0A9X9'),('hydro','to-P01053'),('rhomax','by-wild-type'),('PDZ3','single-to-double')]
NUM = r'(?:[−-]?\d+\.\d+|nan)'
CELL = rf'{NUM}(?:\s*±\s*{NUM})?'

def norm(s): return ' '.join(s.split())
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def write(name, rows):
 (OUT / name).write_text(''.join(json.dumps(x, ensure_ascii=False, sort_keys=True, allow_nan=False)+'\n' for x in rows))
def asnum(s): return None if s in ['nan','','—'] else float(s.replace('−','-'))

def extract_flip(text):
 results=[]
 for number,(dataset,split) in enumerate(SPLITS,1):
  title=f'Table A{number}. Baseline performance for {dataset} {split}'
  body=text.split(title)[1].split(f'Table A{number+1}.')[0]
  rows=[]
  for line in body.splitlines():
   # Layout parser retains columns with two or more spaces.
   cols=re.split(r'\s{2,}',line.strip())
   if cols[0] not in MODELS:continue
   assert len(cols)==3,(number,cols)
   assert all(re.fullmatch(CELL,c) for c in cols[1:]),cols
   rows.append(cols)
  assert [r[0] for r in rows]==MODELS,(number,rows)
  for model,spear,ndcg in rows:
   for metric,printed in [('spearman',spear),('ndcg',ndcg)]:
    parts=printed.split('±'); value=asnum(parts[0].strip())
    supervised='supervised' in model
    results.append({
     'candidate_id':f'flip2-a{number}-{MODELS.index(model)+1}-{metric}',
     'benchmark_id':'discovery-benchmark-flip2','source_id':'evidence-expansion-flip2-d0e61ca2',
     'source_url':SOURCES['flip2.pdf'][0],'source_version':'Official FLIP2 manuscript; retrieved 2026-09-19; exact bytes pinned',
     'artifact_sha256':SOURCES['flip2.pdf'][1], 'source_locator':f'Table A{number}; row {model}; column {metric}',
     'model_or_submission':model,'protocol':f'FLIP2 {dataset} {split}; held-out test set', 'dataset':dataset,'split':split,
     'metric':metric,'printed_value':norm(printed),'numeric_value':value,'unit':'correlation' if metric=='spearman' else 'unitless','direction':'higher_is_better',
     'uncertainty':{'printed_spread':parts[1].strip(),'value':asnum(parts[1].strip()),'type':'unreported'} if len(parts)>1 else None,
     'missingness':'source_reports_nan' if value is None else None,
     'conditions':{'adaptation':'random-initialized supervised training' if 'naive' in model else 'fine-tuned pretrained model' if supervised else 'ridge fitting' if model.startswith('Ridge') else 'zero-shot likelihood',
      'aggregation':'mean of five random-seed fits (Section 4.3)' if supervised else 'reported point estimate', 'seed_count':5 if supervised else None,
      'scored_count':None,'eligible_count':None,'checkpoint_hash':None,'spread_definition':'unreported in inspected text; do not infer standard deviation','comparison_scope':f'Table A{number}, same metric only'},
     'evidence_origin':'author_reported','verification_status':'pending_independent_review',
    })
 assert len(results)==288
 return results

class HTMLTables(HTMLParser):
 def __init__(self):super().__init__();self.tables=[];self.depth=0;self.rows=[];self.row=None;self.cell=None
 def handle_starttag(self,tag,attrs):
  if tag=='table':
   if self.depth==0:self.rows=[]
   self.depth+=1
  if self.depth and tag=='tr':self.row=[]
  if self.depth and tag in ['td','th']:self.cell=[]
 def handle_data(self,data):
  if self.cell is not None:self.cell.append(data)
 def handle_endtag(self,tag):
  if tag in ['td','th'] and self.cell is not None:
   self.row.append(norm(''.join(self.cell)));self.cell=None
  if tag=='tr' and self.row is not None:self.rows.append(self.row);self.row=None
  if tag=='table':
   self.depth-=1
   if self.depth==0:self.tables.append(self.rows)

def extract_plinder(root):
 table=root.find('.//table-wrap[@id="tbl1"]')
 rows=[[norm(''.join(c.itertext())) for c in tr] for tr in table.findall('.//tbody/tr')]
 assert len(rows)==7 and all(len(r)==7 for r in rows)
 headers=[('protein_rmsd','angstrom','lower_is_better'),('ligand_rmsd','angstrom','lower_is_better'),('chirality','percent','higher_is_better'),('bond_rmsd','angstrom','lower_is_better'),('angle_rmsd','degree','lower_is_better')]
 results=[]
 for row in rows:
  model,condition,*values=row
  for idx,(metric,unit,direction) in enumerate(headers):
   printed=values[idx]
   results.append({
    'candidate_id':f'plinder-stereochemistry-t1-{len(results)+1}', 'benchmark_id':'discovery-benchmark-plinder','source_id':'boltz-stereochemistry-2025',
    'source_url':'https://doi.org/10.1021/acsomega.5c07675','artifact_url':SOURCES['plinder-stereochemistry.xml'][0],
    'source_version':'ACS Omega 2025 version of record; PMC12658688 XML retrieved 2026-09-19','artifact_sha256':SOURCES['plinder-stereochemistry.xml'][1],
    'source_locator':f'Table 1 (XML tbl1); row {model}; column {metric}; footnote a', 'model_or_submission':model,
    'protocol':'Paper-specific Plinder-L95 stereochemistry assessment; Table 1 all entries','dataset':'Plinder-L95','split':'all entries (includes Before and After training cutoff subsets)',
    'metric':metric,'printed_value':printed,'numeric_value':asnum(printed),'unit':unit,'direction':direction,'uncertainty':None,
    'missingness':'not_applicable_rigid_protein' if printed=='' else None,
    'conditions':{'restraint_parameters':condition or None,'dataset_size':6600,'scored_count':None,'eligible_count':None,'checkpoint_hash':None,'plinder_release':'unextracted',
      'aggregation':'median' if metric in ['protein_rmsd','ligand_rmsd','bond_rmsd'] else 'percentage of molecules with consistent chirality' if metric=='chirality' else 'unreported in Table 1 footnote',
      'selection':'monomer proteins; single nonpolymeric ligand with sp3-carbon chiral center; allowed elements C,N,O,F,P,S,Cl,Br,I; RDKit conformer generation; ligand Tanimoto clustering 0.95',
      'training_overlap':'All-entry summary includes structures before 2021-09-30; do not label held-out generalization.',
      'input_information':'Vina receives ground-truth ligand-centred 30 angstrom cubic search box and exhaustiveness 16; neural co-folding methods receive shared MMSeqs2 v15 MSAs; input conditions differ.',
      'comparison_compatibility':'mixed_input_information; descriptive source table only, no ranked fair-comparison claim',
      'model_configuration':'Boltz recycle=10, diffusion samples=5; AF3 and DiffDock default parameters; restraint variants as table condition.'},
    'evidence_origin':'author_reported' if model.startswith('Boltz R') else 'independent_external_evaluation','verification_status':'pending_independent_review',
   })
 return results,rows

def independently_check(cache,flip,plinder,xmlrows):
 raw=subprocess.check_output(['pdftotext','-raw',str(cache/'flip2.pdf'),'-'],text=True)
 # Different parser: raw PDF stream, anchored row names and scalar token grammar.
 checked={}
 for n in range(1,17):
  body=re.search(rf'Table A{n}\. Baseline performance.*?\n(.*?)(?=Table A{n+1}\.)',raw,re.S).group(1)
  for line in body.splitlines():
   for model in sorted(MODELS,key=len,reverse=True):
    if line.startswith(model+' '):
     nums=re.findall(CELL,line[len(model):].strip())
     assert len(nums)==2,(n,model,nums)
     for metric,val in zip(['spearman','ndcg'],nums):checked[f'flip2-a{n}-{MODELS.index(model)+1}-{metric}']=norm(val)
     break
 assert len(checked)==288
 assert all(checked[r['candidate_id']]==r['printed_value'] for r in flip)
 html=HTMLTables();html.feed((cache/'plinder-stereochemistry.html').read_text())
 targets=[t for t in html.tables if any(r and r[0]=='AF3' for r in t) and any(r and r[0]=='DiffDock' for r in t)]
 assert len(targets)==1
 htmlrows=[r for r in targets[0] if r and r[0] in [v[0] for v in xmlrows]]
 assert htmlrows==xmlrows,(htmlrows,xmlrows)
 return {'review_method':'automated independent representation/parser cross-check; AI-assisted protocol review',
  'human_review':False,'scientific_reproduction':False,'checked_at':'2026-09-19','flip2_cells_checked':len(checked),'plinder_cells_checked':len(plinder),
  'limitations':['Both FLIP2 text representations derive from the same PDF with Poppler; this is a distinct-parser transcription check, not an independent experiment or human review.','PLINDER publisher HTML and XML table cells agree; source table validity and missing metadata are separate findings.'],
  'source_sha256':{name:digest(cache/name) for name in SOURCES},'pdftotext_version':subprocess.run(['pdftotext','-v'],capture_output=True,text=True).stderr.strip().splitlines()[0],
  'findings':[{'outcome':'contradicted','source_locator':'FLIP2 Table A17 vs A7,A14,A15,A16','claim':'A17 winner summary agrees with complete detailed tables','explanation':'A17 labels TrpB one-to-many CARP supervised 0.453 but A7 reports 0.451 (ridge+likelihoods 0.453); A17 hydro to-P01053 CARP likelihood 0.330 vs A14 0.252; A17 rhomax CARP supervised 0.379 vs A15 0.072 (likelihood 0.379); A17 PDZ3 ESMC naive 0.733 vs A16 0.502. Do not ingest A17 or infer winners.'},
   {'outcome':'insufficient_evidence','source_locator':'FLIP2 A1–A16; Section 4.3','claim':'Printed ± spread is standard deviation','explanation':'Five seeds and means are stated, but inspected text does not define ± spread. Retain as unspecified.'},
   {'outcome':'insufficient_evidence','source_locator':'PLINDER stereochemistry Table1; Methods','claim':'All methods have matched information and held-out inputs','explanation':'Vina is given ground-truth pocket; all-entry table includes training-era structures. Preserve source comparison without universal ranking.'}]}

def main():
 p=argparse.ArgumentParser();p.add_argument('--cache',type=Path,required=True);p.add_argument('--offline',action='store_true');args=p.parse_args()
 args.cache.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
 for name,(url,sha) in SOURCES.items():
  dest=args.cache/name
  if not dest.exists():
   assert not args.offline,f'Missing offline artifact {name}'
   with urllib.request.urlopen(url,timeout=90) as r:dest.write_bytes(r.read())
  assert digest(dest)==sha,f'Artifact mismatch: {name}; never accept changed bytes silently'
 text=subprocess.check_output(['pdftotext','-layout',str(args.cache/'flip2.pdf'),'-'],text=True)
 flip=extract_flip(text);plinder,rows=extract_plinder(ET.parse(args.cache/'plinder-stereochemistry.xml').getroot())
 receipt=independently_check(args.cache,flip,plinder,rows)
 for r in flip+plinder:
  r['verification_status']='source_transcription_checked';r['review_receipt']='verification.json'
  r['publication_eligibility']='review_required'
  if r['candidate_id'] in ['flip2-a7-6-spearman','flip2-a14-5-spearman','flip2-a15-6-spearman','flip2-a16-9-spearman']:
   r['publication_eligibility']='quarantined_source_conflict'
   r['conflict_locator']='Table A17 versus detailed result table; see verification.json'
 (OUT/'flip2-table-evidence.txt').write_text(text.split('A. Supplemental Tables and Figures')[1].split('B. ')[0])
 write('candidates.jsonl',flip+plinder)
 (OUT/'verification.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
 write('sources.jsonl',[{'filename':name,'url':url,'sha256':sha,'retrieved_at':'2026-09-19','status':'retrieved_and_hash_pinned'} for name,(url,sha) in SOURCES.items()])
 print(json.dumps({'candidate_cells':len(flip+plinder),'numeric_cells':sum(r['numeric_value'] is not None for r in flip+plinder),'complete_tables':17}))
if __name__=='__main__':main()
