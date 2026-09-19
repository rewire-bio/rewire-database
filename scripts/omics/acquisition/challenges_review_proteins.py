#!/usr/bin/env python3
"""Independent acquisition review using source bytes, never the extractor's dictionary."""
import hashlib,json,re,subprocess,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
DATA=ROOT/'data/omics/acquisition/2026-09-19/proteins'
OUT=ROOT/'data/omics/acquisition/2026-09-19/challenges/proteins-independent-review.json'
CACHE=Path('/tmp/rewire-audit-proteins')
rows=[json.loads(l) for l in (DATA/'candidates.jsonl').read_text().splitlines()]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for s in map(json.loads,(DATA/'sources.jsonl').read_text().splitlines()):assert sha(CACHE/s['filename'])==s['sha256']
text=subprocess.check_output(['pdftotext','-layout',str(CACHE/'flip2.pdf'),'-']).decode()
starts=list(re.finditer(r'Table A(\d+)\. Baseline performance for ([^\n]+)',text))
blocks={int(m[1]):text[m.end():starts[i+1].start() if i+1<len(starts) else text.index('Table A17.',m.end())] for i,m in enumerate(starts)}
assert set(blocks)==set(range(1,17))
root=ET.parse(CACHE/'plinder-stereochemistry.xml').getroot()
table=root.find('.//table-wrap[@id="tbl1"]')
assert 'across All Entries' in ''.join(table.find('caption').itertext())
normalize=lambda s:re.sub(r'\s+',' ',s).strip()
plinder={}
for row in table.findall('.//tbody/tr'):
 fields=[normalize(''.join(c.itertext())) for c in row]
 for col,value in zip(['protein_rmsd','ligand_rmsd','chirality','bond_rmsd','angle_rmsd'],fields[2:]):plinder[fields[0],col]=value
checks=[]
for r in rows:
 if r['benchmark_id'].endswith('flip2'):
  n=int(re.search(r'Table A(\d+);',r['source_locator'])[1])
  match=re.search(r'^\s*'+re.escape(r['model_or_submission'])+r'\s{2,}([^\n]+)$',blocks[n],re.M)
  assert match,r['candidate_id']
  cells=re.split(r'\s{2,}',match[1].strip());assert len(cells)==2,(r['candidate_id'],cells)
  observed=cells[0 if r['metric']=='spearman' else 1]
 else:observed=plinder[r['model_or_submission'],r['metric']]
 assert normalize(observed)==normalize(r['printed_value']),(r['candidate_id'],observed,r['printed_value'])
 checks.append({'candidate_id':r['candidate_id'],'outcome':'supported','category':'source_transcription','source_locator':r['source_locator']})
conflicts=[r['candidate_id'] for r in rows if r['publication_eligibility']=='quarantined_source_conflict']
assert len(conflicts)==4
# Explicit source conflict confirmation, independent of acquisition receipt prose.
a17=text[text.index('Table A17.'):text.index('Figure A1.',text.index('Table A17.'))]
for fragment in ['0.453','0.330','0.379','0.733']:assert fragment in a17
body=normalize(' '.join(root.itertext()))
for fragment in ['6,600 entries (Plinder-L95)','2021-09-30','centroid of the ground truth ligand','Vina and DiffDock treat proteins as rigid']:
 assert fragment in body,fragment
approved=[r['candidate_id'] for r in rows if r['candidate_id'] not in conflicts]
receipt={'checked_at':'2026-09-19','reviewer':'separate source_challenges agent','reviewer_type':'AI-assisted source review with automated exact-cell comparison','human_review':False,'scientific_reproduction':False,'input_candidates_sha256':sha(DATA/'candidates.jsonl'),'primary_source_hashes':{s['filename']:s['sha256'] for s in map(json.loads,(DATA/'sources.jsonl').read_text().splitlines())},'checked_cells':len(rows),'accepted_candidate_ids':approved,'quarantined_candidate_ids':conflicts,'numerical_accepted_count':sum(r['numeric_value'] is not None and r['candidate_id'] in approved for r in rows),'missing_value_candidate_ids':[r['candidate_id'] for r in rows if r['numeric_value'] is None],'checks':checks,'findings':[{'outcome':'supported','scope':'FLIP2 A1-A16 and PLINDER Table1','claim':'All 323 printed cells match source bytes through a separate parser.','limitations':'PDF text is from the same primary PDF; no experiment rerun. This check validates transcription rather than the paper conclusion.'},{'outcome':'contradicted','scope':'FLIP2 Table A17 vs A7,A14,A15,A16','claim':'A17 winner summary matches detailed table cells','action':'Keep four conflicting Spearman rows quarantined. Do not publish A17 as independent evidence.'},{'outcome':'insufficient_evidence','scope':'FLIP2 ± spreads and PLINDER angle RMSD','claim':'Source fully specifies spread or aggregation semantics','action':'Preserve unresolved spread type and angle RMSD aggregation. Do not infer SD or median for these quantities.'},{'outcome':'supported_with_conditions','scope':'PLINDER Table1 scientific comparison','claim':'Table reports measurements on a paper-specific Plinder-L95 subset.','action':'Separate co-folding (AF3/Boltz variants), rigid receptor docking DiffDock, and ground-truth-pocket docking Vina input strata. Record all-entry includes pre-cutoff structures. No universal ranking; no held-out generalization claim. Preserve ground-truth pocket and rigid receptor information explicitly per configuration.'}], 'publication_conditions':['Only accepted finite numerical candidates may chart; three missing cells remain explicit missing evidence.','FLIP2 compares only within exact dataset, split and metric.','PLINDER results must identify paper-specific subset and input stratum; do not present it as the original PLINDER-wide assessment.','Use exact named configurations: Boltz R1/Rc/R are author-reported variants with distinct restraint parameters, not independently evaluated unmodified Boltz-1.','Retain null scored denominators and checkpoints as unextracted; 6600 dataset entries does not prove 6600 scored predictions.']}
OUT.write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({k:receipt[k] for k in ['checked_cells','numerical_accepted_count','quarantined_candidate_ids','missing_value_candidate_ids']},indent=2))
