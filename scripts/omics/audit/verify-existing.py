#!/usr/bin/env python3
"""Independent bounded source-cell verifier, not an experimental reproduction.
Uses stdlib HTML table-grid and OOXML readers; imports no production extractors.
Unresolvable cells are recorded as gaps, never inferred from a matching number.
"""
import argparse,hashlib,json,re,unicodedata,zipfile,subprocess
import xml.etree.ElementTree as E
from html.parser import HTMLParser
from pathlib import Path
from decimal import Decimal,InvalidOperation
from collections import Counter
ROOT=Path(__file__).resolve().parents[3]
NS={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def norm(t):return ' '.join(t.split())
def key(t):return re.sub(r'[^\w+♦]+','',unicodedata.normalize('NFKC',t).lower())
def sha(b):return hashlib.sha256(b).hexdigest()
def canonical(x):return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
class N:
 def __init__(self,tag='',attrs=None,parent=None):self.tag=tag;self.attrs=dict(attrs or []);self.parent=parent;self.children=[]
 def text(self):return norm(' '.join(x if isinstance(x,str) else x.text() for x in self.children if isinstance(x,str) or x.tag not in ['annotation','script','style']))
 def find(self,tag):
  for c in self.children:
   if isinstance(c,N):
    if c.tag==tag:yield c
    yield from c.find(tag)
class DOM(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.root=N();self.cur=self.root
 def handle_starttag(self,t,a):
  n=N(t,a,self.cur);self.cur.children.append(n)
  if t not in ['meta','link','br','hr','img','input','source','col','wbr','area','base','embed','param','track']:self.cur=n
 def handle_startendtag(self,t,a):self.cur.children.append(N(t,a,self.cur))
 def handle_endtag(self,t):
  n=self.cur
  while n.parent:
   if n.tag==t:self.cur=n.parent;return
   n=n.parent
 def handle_data(self,d):self.cur.children.append(d)
def tables(body):
 d=DOM();d.feed(body.decode('utf8',errors='replace'));out=[]
 for tbl in d.root.find('table'):
  grid=[];spans={}
  for tr in tbl.find('tr'):
   ancestor=tr.parent
   while ancestor and ancestor.tag!='table':ancestor=ancestor.parent
   if ancestor is not tbl:continue
   cells=[c for c in tr.children if isinstance(c,N) and c.tag in ['td','th']]
   if not cells:continue
   row=[];col=0
   def fill():
    nonlocal col
    while col in spans:
     v,count=spans[col];row.append(v)
     if count==1:del spans[col]
     else:spans[col]=(v,count-1)
     col+=1
   for cell in cells:
    fill();v=cell.text();cs=int(cell.attrs.get('colspan','1'));rs=int(cell.attrs.get('rowspan','1'))
    for i in range(cs):
     row.append(v)
     if rs>1:spans[col]=(v,rs-1)
     col+=1
   fill();grid.append(row)
  p=tbl.parent
  while p.parent and p.tag not in ['figure','table-wrap','section']:p=p.parent
  caption=' '.join(c.text() for c in p.find('figcaption')) or ' '.join(c.text() for c in p.find('caption'))
  labels=' '.join(c.text() for c in p.find('label'))
  number=re.search(r'Table\s*([A-Z]?\d+)\b',caption,re.I)
  if not number:number=re.search(r'([A-Z]?\d+)',labels)
  out.append({'number':number.group(1) if number else None,'caption':caption,'rows':grid})
 return out

def cell_number(cell):
 # HTML inline formatting may separate digits, signs and superscripts with spaces.
 # Join those tokens, then require the ENTIRE cell to follow this numeric grammar.
 s=re.sub(r'\s+','',unicodedata.normalize('NFKC',cell)).replace('%','').replace('−','-').replace('–','-').replace('％','%').replace('\u200b','')
 atom=r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:(?:[eE]|[×x]10\^?)[+-]?\d+)?'
 ci=re.fullmatch(r'('+atom+r')[({]('+atom+r')-('+atom+r')[)}]',s)
 if ci:
  try:return Decimal(ci[1]),None
  except InvalidOperation:return None
 p=re.fullmatch(r'('+atom+r')(?:[%*†‡])?(?:(?:±|\()('+atom+r')(?:\))?)?',s)
 if not p:return None
 def number(x):
  return Decimal(re.sub(r'[×x]10\^?','e',x))
 try:return number(p.group(1)),str(number(p.group(2))) if p.group(2) else None
 except InvalidOperation:return None

# Independently adjudicated legacy source locations, bound to exact artifact bytes.
# Values are never used to discover rows. Coordinates include expanded header rows.
LEGACY_COORDINATES = {
 'b2-clathrin-plm-2025': ('2edc86b25707c1b737d26117093ce8d856e79cc5d0b335f27c1c341f887f1c7e', '2', 0, 9, 2),
 'b2-codonbert-vaccines-2024': ('2968073753e6d44feff9c08b131edf23145e95b171434539dddf77bb92847033', '2', 0, 9, 1),
 'b2-ernie-rna-2025': ('0bd1d4b3cbf5d59d452cec4864614947861efcee050ba07e7de395cd90630047', '2', 0, 2, 5),
 'b2-genomic-tokenizer-selection-2025': ('0a01c36fdd63f3f6db509777e61c3f87e8a298c810f8aef7974915aaa0655342', '2', 0, 2, 9),
 'b2-gsmformer-ppi-2026': ('9b364b5d73d16f2787f93f78f17dbe98b954ab9c2c64c1df960eec2e615eb3b4', '6', 0, 3, 7),
 'b2-megsite-2025': ('10d13122331813243d83b84fe6f9294eac7e7c03cde082ebed276191ac41089c', '2', 0, 4, 8),
 'b2-mrnabert-2025': ('ff08ba895b7080446c08a930548b48a0041ae990c222ebb07e6ba7dcaf48ad44', '2', 0, 4, 1),
 'b2-mulan-2025': ('771a9a26ebda6f49ea266540e8dd6e6de0cbaef724de818ca6124a5f9c50d350', '2', 0, 6, 5),
 'b2-phylogpn-2025': ('807f3a26cbfa9b5ce238d92164bd523302c67d1c5794b08273c51cca1acd4224', '1', 0, 2, 1),
 'b2-polya-glm-2025': ('e9ebd53d88837ad8d457881ffee918d2734dcae87d3c5cd03135947b6cf5dbde', '1', 0, 4, 10),
 'b2-rlsite-rna-binding-2025': ('a50f344e253162ae43f51d7120cfb35a1d0f6114fd8176d760aceb6d05fd95bd', '1', 0, 9, 4),
 'b2-rnaret-2026': ('e970e7322e07fb3c9d12efd315691cc5de5575a3f2616f4b788614c8c706dd0b', '1', 0, 9, 1),
 'b2-spin-protein-function-2026': ('9701843e93bf7fa3ead71e19693fb07d483f1022379871adfb04486783722a9d', '1', 0, 2, 5),
 'lit-015': ('e8f960eafb7f00edfdd81d4fb75c6de838e9b872b7e18875fc7a5bff2a2f72b3', '1', 0, 2, 5),
 'lit-016': ('e8f960eafb7f00edfdd81d4fb75c6de838e9b872b7e18875fc7a5bff2a2f72b3', '1', 0, 8, 5),
 'lit-021': ('f6aac4c25dd93026f87ce9a2e327c95faf4c3014d7f9ae04bb11f208ce047971', '1', 0, 5, 7),
 'lit-022': ('f6aac4c25dd93026f87ce9a2e327c95faf4c3014d7f9ae04bb11f208ce047971', '1', 0, 17, 7),
 'lit-026': ('77a4a859010259eadf2187465db6ab385efa4927a5eadb95c1e01991044c283f', '2', 1, 5, 5),
 'lit-029': ('ef75f0d63a567f5e9d7132fd847f44838a82a9741ae55323437e1d1812d86316', '1', 0, 3, 5),
 'lit-030': ('ef75f0d63a567f5e9d7132fd847f44838a82a9741ae55323437e1d1812d86316', '1', 0, 4, 5),
 'lit-031': ('65b3272d47bb9c4ee1e7a965169bef63add9dbeb31508d4076e5145b761af4ec', '2', 0, 26, 2),
 'lit-032': ('65b3272d47bb9c4ee1e7a965169bef63add9dbeb31508d4076e5145b761af4ec', '2', 0, 22, 2),
 'lit-035': ('74278ccd77b2bc00a3f4434546545e8bdec8b0652a0e5d1862ec0f91decccd8d', '3', 0, 2, 5),
 'lit-036': ('74278ccd77b2bc00a3f4434546545e8bdec8b0652a0e5d1862ec0f91decccd8d', '3', 0, 3, 5),
 'lit-041': ('6ff34f2f709a14858a3753abf9f8f6efa1e7e3c351f15c70cf64264193a9414e', '2', 0, 2, 1),
 'lit-042': ('6ff34f2f709a14858a3753abf9f8f6efa1e7e3c351f15c70cf64264193a9414e', '2', 0, 4, 1),
 'lit-043': ('194b21478aaedd9a7384cabb8b0040ca5b6a4938f4d275627b86a6b787affc20', '2', 0, 2, 3),
 'lit-044': ('194b21478aaedd9a7384cabb8b0040ca5b6a4938f4d275627b86a6b787affc20', '2', 0, 6, 3),
 'lit-b3-003': ('ef6c68f5c9b47c2f89598ddf647f05b72e4155e8b33609ebff23936a84bbd41d', '4', 0, 2, 3),
 'lit-b3-004': ('ef6c68f5c9b47c2f89598ddf647f05b72e4155e8b33609ebff23936a84bbd41d', '4', 0, 2, 7),
 'lit-b3-011': ('230a2ec55458d9243eaeeebf3244df7409eb02d47f4b809ee56a06dcb6fdd047', '2', 0, 3, 8),
 'lit-b3-012': ('230a2ec55458d9243eaeeebf3244df7409eb02d47f4b809ee56a06dcb6fdd047', '2', 0, 3, 5),
 'lit-b3-015': ('829afab6a4e30997c608745d3eb280105b8c5c4e601020ffdc55c866144527ca', '2', 0, 2, 1),
 'lit-b3-016': ('829afab6a4e30997c608745d3eb280105b8c5c4e601020ffdc55c866144527ca', '2', 0, 3, 1),
 'lit-b3-019': ('f0939647ed3de995d58254f79472a612c21b0e1b2560a82783302aa1a148dde3', '5', 0, 8, 2),
 'lit-b3-020': ('f0939647ed3de995d58254f79472a612c21b0e1b2560a82783302aa1a148dde3', '5', 0, 8, 3),
 'lit-b3-023': ('10e9ba780c45e7787baff9b81ef7b45c014d7fe6c716d6c759e14d89a813dc1c', '5', 0, 2, 3),
 'lit-b3-024': ('10e9ba780c45e7787baff9b81ef7b45c014d7fe6c716d6c759e14d89a813dc1c', '5', 0, 3, 3),
 'lit-b3-039': ('1ebf712314d9a1c678ded989cc95a0c00c0331e5ad8c9f63194bc9780971d214', '1', 0, 2, 9),
 'lit-b3-040': ('caa1109bd5fe7f6be703aa9d4afd6f4f1522bcbce6b7361650eb59618c2a9e14', '1', 0, 5, 4),
 'lit-b3-041': ('caa1109bd5fe7f6be703aa9d4afd6f4f1522bcbce6b7361650eb59618c2a9e14', '1', 0, 3, 4),
 'lit-b3-043': ('5a7620c18d0622561004e1e25b5cfaf7399e93df3547eeefdd4cf6d300bb8aba', '2', 0, 4, 2),
 'lit-b3-044': ('d556d47e0f7bbdc37eb62374b85ac9092dc7ff438fbae9e42892ac2cc784023f', '3', 0, 7, 4),
 'lit-b3-045': ('d556d47e0f7bbdc37eb62374b85ac9092dc7ff438fbae9e42892ac2cc784023f', '3', 0, 7, 3),
 'lit-b3-048': ('40cfd28dcd587599768ec99a6590ec593486475ff01c7b1d1f229b44aa91bf8d', '2', 0, 10, 2),
 'lit-b3-049': ('40cfd28dcd587599768ec99a6590ec593486475ff01c7b1d1f229b44aa91bf8d', '2', 0, 8, 2),
 'lit-b4-001': ('4a264956e47fc633aaff6573aac368dc691dd5de709b27c7421c078608ff542a', '1', 0, 2, 3),
 'lit-b4-003': ('c86488c9f60329b7a3c4370598e7a0a9e4c8c45d1758b87007bfc8242376b009', '2', 0, 18, 1),
 'lit-b4-004': ('0183b6a111b1b02344cad35a571a1fd2c56257e406c5be1df69f7902c5d06749', '2', 0, 1, 6),
 'lit-b4-006': ('b49c9ad846e46b11b240aace8e6bfaf953b842df166b69aee4843c02e9349779', '3', 0, 14, 1),
 'lit-b4-007': ('0e6719410b390ee9c4858bb9321042851100fb74df3aa109bf2af2b8aaff7ac1', '1', 0, 7, 1),
 'lit-b4-010': ('491711aa7186e74bf33f6d601c4ea6a8f565e770938fe1f91a0cd347b8f06f3f', '2', 0, 4, 7),
 'lit-b4-012': ('b76fff917addd0e9ff8a2fc843496132ecf832d3ceef248e3edf2dbc78baab5f', '2', 0, 1, 6),
 'lit-b4-013': ('77546faec51cfb5c78b73c5943f940c4e0097d130b1ddde4ab8287b507b36df6', '4', 0, 2, 2),
 'lit-b4-015': ('12a53a78c70b3033c3351cf7afd4da42ebc98bb3281308f07e71e5baffc153a0', '2', 0, 2, 3),
 'lit-b4-016': ('2715709d94f84744afa32cafdcaa72efd206d63af8c60afe7619b2cb90108b6b', '3', 0, 8, 3),
 'lit-b4-017': ('aa88de1b0f0fd7ba1fedc1074bba9ba6ce199a0b723072a04d531db4585ae77c', '3', 0, 4, 3),
 'lit-b4-019': ('0b0a225fa6f5f3ba41dffc7b320c91f47738301cf45835260eecaa03b704a097', '3', 0, 17, 3),
 'lit-b4-022': ('25d3561934965f754d8712ec02b2052e9a3979e433b88ecebd5db14e930f17a1', '2', 0, 9, 2),
}
def legacy_table_resolve(r,ts,artifact_hash):
 spec=LEGACY_COORDINATES.get(r['id'])
 if not spec:return None,'No reviewed legacy coordinate'
 expected_hash,num,occ,ri,ci=spec
 if artifact_hash!=expected_hash:return None,'Legacy coordinate source fingerprint mismatch'
 matching=[t for t in ts if t['number']==num]
 if occ>=len(matching):return None,'Reviewed table occurrence absent'
 t=matching[occ]
 if ri>=len(t['rows']) or ci>=len(t['rows'][ri]):return None,'Reviewed coordinate absent'
 row=t['rows'][ri];cell=row[ci]
 caption=t['caption']+' [Independent source-table adjudication: Table '+num+', occurrence '+str(occ+1)+', zero-based expanded row '+str(ri)+', column '+str(ci)+'.]'
 return (cell,caption,row),None

def resolve_table(r,ts):
 a=r['attributes'];loc=a.get('source_locator','')
 coords=re.search(r'Table\s*([A-Z]?\d+).*?XML row(\d+) column(\d+)',loc) or re.search(r'Table\s*([A-Z]?\d+).*?, row (\d+) .*?, column (\d+):',loc)
 if coords:
  num,ri,ci=coords.groups();ri=int(ri)-1;ci=int(ci)-1
  matches=[(t['rows'][ri][ci],t['caption'],t['rows'][ri]) for t in ts if t['number']==num and ri<len(t['rows']) and ci<len(t['rows'][ri])]
  if len(matches)==1:return matches[0],None
  return None,f'explicit source-cell coordinates resolve {len(matches)} tables'
 m=re.search(r'Table\s*([A-Z]?\d+).*?row\((.*)\),\s*column\((.*)\)',loc)
 if not m:m=re.search(r'Table\s*([A-Z]?\d+), (.*?) row, (.*?) column',loc)
 if not m:m=re.search(r'Table\s*([A-Z]?\d+), row (.*?), column (.*)',loc)
 if not m:return None,'locator grammar requires manual review'
 num,rlabel,clabel=m.groups();matches=[]
 rid=r['id']
 if rid=='b2-barcodebert-2026':clabel='Genus-level 1-NN probe of unseen species Acc (%)'
 if rid.startswith('genomic-benchmarks-'):clabel=clabel.replace('Baseline CNN (PyTorch)','Pytorch').replace('Baseline CNN (TensorFlow)','Tensorflow')
 if rid.startswith('dart-eval-'):
  if num=='3':clabel=clabel.replace('absolute_accuracy','Absolute Acc.').replace('paired_accuracy','Paired Acc.').replace('ab initio','Trained ab initio')
  if num=='6':
   clabel=clabel.replace('pearson_r','Pearson r')
   clabel=clabel.replace('zero-shot embedding auroc','Zero-Shot AUROC Embedding').replace('zero-shot likelihood auroc','Zero-Shot AUROC Likelihood')
  if num=='5':
   clabel=re.sub(r'^CA-SPEARMAN-', 'Spearman r among positives ',clabel,flags=re.I);clabel=re.sub(r'^CA-AUROC-', 'AUROC (positives vs. negatives) ',clabel,flags=re.I)
  if num=='4':
   clabel=re.sub(r'^CTC-AUROC-','',clabel,flags=re.I)+' AUROC' if clabel.upper().startswith('CTC-AUROC-') else clabel
   if clabel.upper() in ['CTC-ACC','CTS-ACC']:clabel='Overall Accuracy'
   elif clabel.upper().startswith('CTS-'):clabel=clabel[4:]+' AUROC'
 if rid.startswith('perturbench-') and num=='3':clabel=clabel.replace('log fold change (LogFC)','LogFC')
 if rid.startswith('nabench-') and num in ['6','12']:
  aliases={'Contiguous cross validation Spearman ρ':'Supervised Contiguous','Random cross validation Spearman ρ':'Supervised Random','Few-shot Spearman ρ':'Supervised Few-shot','Zero-shot Spearman ρ':'Zeroshot Corr','Zero-shot AUC':'Zeroshot AUC','Zero-shot MCC':'Zeroshot MCC','Zero-shot NDCG':'Zeroshot NDCG'}
  clabel=aliases.get(clabel,clabel)
 for t in ts:
  if t['number']!=num:continue
  for ri,row in enumerate(t['rows']):
   if rid.startswith('dart-eval-') and num=='6' and len(row)>1 and row[0]=='' and row[1]=='ChromBPNet':
    prior=[p[0] for p in t['rows'][:ri] if p and p[0] in ['African','Yoruban']]
    if prior:row=[prior[-1]]+row[1:]
   if key(rlabel) not in {key(c) for c in row[:3]}|{key(' '.join(row[:2])),key(' '.join(row[:3]))}:continue
   headers=[];previous_header=False
   for prior in t['rows'][:ri]:
    if not any(prior):continue
    is_header=bool(prior) and (not prior[0] or key(prior[0]) in ['model','models','method','methods','setting','assay','dataset','name','metric']) and not any(cell_number(c) is not None for c in prior[1:])
    if is_header:
     if not previous_header:headers=[]
     headers.append(prior)
    previous_header=is_header
   if not headers:headers=t['rows'][:ri]
   for ci,cell in enumerate(row):
    hk=[key(h[ci]) for h in headers if ci<len(h)]
    target=key(clabel)
    # Only exact header or an exact concatenated multi-level header.
    choices=set(hk)
    for start in range(min(5,len(hk))):
     for stop in range(start+1,min(6,len(hk))+1):choices.add(''.join(dict.fromkeys(hk[start:stop])))
    if target in choices:matches.append((cell,t['caption'],row))
 if len(matches)!=1:return None,f'exact table/row/column resolution returned {len(matches)} cells; no numerical search fallback'
 return matches[0],None

def xlsx_cells(b):
 z=zipfile.ZipFile(__import__('io').BytesIO(b));shared=[]
 if 'xl/sharedStrings.xml' in z.namelist():shared=[''.join(e.itertext()) for e in E.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',NS)]
 rels={r.attrib['Id']:r.attrib['Target'] for r in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
 out={}
 for sheet in E.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',NS):
  rid=sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'];target=rels[rid]
  path=target.lstrip('/') if target.startswith('/') else 'xl/'+target
  for c in E.fromstring(z.read(path)).findall('.//s:c',NS):
   v=c.find('s:v',NS)
   if v is not None:out[f"'{sheet.attrib['name']}'!{c.attrib['r']}"]=shared[int(v.text)] if c.attrib.get('t')=='s' else v.text
 return out

# Source-specific PDF block boundaries below were read directly from pinned PDFs.
# Each block returns exact row cells, not a search for the stored numerical value.
PDFNUM=r'(?:[−-]?\d+\.\d+(?:\s*\(\d+\.\d+(?:\s*-\s*\d+\.\d+)?\)|\s*±\s*\d+\.\d+)?|—|N/A|NA|-)'
def pdf_rows(block,n):
 out=[]
 for line in block.splitlines():
  start=re.search(r'[−-]?\d+\.\d+|(?<=\s)(?:N/A|NA|—|-)(?=\s)',line)
  if not start:continue
  label=norm(line[:start.start()]);tail=line[start.start():].strip()
  cells=re.findall(PDFNUM,tail)
  remainder=re.sub(PDFNUM,'',tail)
  if len(cells)==n and not remainder.strip():out.append((label,[norm(c) for c in cells]))
 return out

def paper_pdf_resolve(r,text):
 loc=r['attributes'].get('source_locator','');sid=r['source_ids'][0];lines=text.split('\n');columns=[];body='';label='';caption='';ci=None
 if sid=='expansion-p3-glycanml-2405-16206v1':
  if loc.startswith('Table 3,'):
   m=re.fullmatch(r'Table 3, row (.*), column (.*)',loc)
   if not m:return None,'GlycanML locator absent'
   label,col=m.groups();columns=['Domain','Kingdom','Phylum','Class','Order','Family','Genus','Species','Immuno','Glycos','Interaction','Mean Rank'];body='\n'.join(lines[489:510])
  else:
   m=re.fullmatch(r'Table 4, (Shallow CNN|RGCN), (.*), column (.*)',loc)
   if not m:return None,'GlycanML multi-task group absent'
   family,label,col=m.groups();columns=['Domain','Kingdom','Phylum','Class','Order','Family','Genus','Species','Mean Acc (%)'];body='\n'.join(lines[559:567] if family=='Shallow CNN' else lines[567:575])
  caption='Pinned GlycanML table: mean (std) for each experiment; explicit single/multi-task and backbone scope.'
  matches=[]
  for source_label,cells in pdf_rows(body,len(columns)):
   if key(re.sub(r'\s*\[\d+\]','',source_label))==key(label) and key(col) in list(map(key,columns)):
    matches.append((cells[list(map(key,columns)).index(key(col))],caption,[source_label]+cells))
  return (matches[0],None) if len(matches)==1 else (None,f'GlycanML independent source rows {len(matches)}')
 if sid=='part2-massspecgym-arxiv-v1':
  m=re.fullmatch(r'Table ([234]), (main challenge|bonus formula challenge), (.*), (.*)',loc)
  if not m:return None,'MassSpecGym protocol/metric locator absent'
  num,track,label,col=m.groups();main=track=='main challenge'
  if num=='2':body='\n'.join(lines[512:516] if main else lines[516:520]);columns=['Top-1 accuracy','Top-1 MCES','Top-1 Tanimoto','Top-10 accuracy','Top-10 MCES','Top-10 Tanimoto']
  if num=='3':body='\n'.join(lines[525:531] if main else lines[531:537]);columns=['Hit rate @1','Hit rate @5','Hit rate @20','MCES @1']
  if num=='4':body='\n'.join(lines[542:548] if main else lines[548:553]);columns=['Cosine similarity','Jensen-Shannon similarity','Hit rate @1','Hit rate @5','Hit rate @20']
  matches=[]
  for source_label,cells in pdf_rows(body,len(columns)):
   if key(source_label)==key(label) and key(col) in list(map(key,columns)):
    matches.append((cells[list(map(key,columns)).index(key(col))],'MassSpecGym table '+num+' '+track+'; brackets denote 99.9% bootstrap confidence intervals (20,000 resamples)',[source_label]+cells))
  return (matches[0],None) if len(matches)==1 else (None,f'MassSpecGym independent source rows {len(matches)}')
 if sid=='evidence-discovery-final-tape':
  m=re.fullmatch(r'Table2,p.7,row(\d+)\((.*?)\),column(.*)',loc)
  if not m:return None,'TAPE source table row coordinate absent'
  ri,label,col=m.groups();rows=pdf_rows('\n'.join(lines[360:376]),5);columns=['Secondary structure','Contact prediction','Remote homology','Fluorescence','Stability'];ri=int(ri)-1
  if len(rows)==10 and ri<len(rows) and col in columns:return (rows[ri][1][columns.index(col)],'TAPE Table2: explicit one-based data-row coordinate; source representation preserved',[rows[ri][0]]+rows[ri][1]),None
  return None,'TAPE table dimensions/metric mismatch'
 return None,'No independent source-specific paper reader'

def pdf_resolve(r,text):
 # Independently read legacy tables: bounded captions and complete fixed-width rows.
 if r['id']=='b2-dart-eval-regulatory-2024':
  if 'Table 3: Regulatory element identification' not in text:return None,'DART table heading absent'
  body=text.split('Table 3: Regulatory element identification',1)[1].split('The best-performing model',1)[0]
  matches=re.findall(r'^\s*DNABERT-2\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+-\s+-\s*$',body,re.M)
  if len(matches)==1 and 'Zero-Shot' in body and 'Accuracy' in body:return (matches[0][0],'DART-Eval Table3, first numeric column Zero-Shot Accuracy; matched controls; pinned PDF page5',['DNABERT-2']+list(matches[0])),None
  return None,'DART table row/column layout differs'
 if r['id']=='b2-esm2-ofs-fitness-2025':
  if 'TABLE I. ProteinGym Substitutions: Spearman correlation.' not in text:return None,'ProteinGym substitution table heading absent'
  body=text.split('TABLE I. ProteinGym Substitutions: Spearman correlation.',1)[1].split('pseudo-perplexity',1)[0]
  matches=re.findall(r'^ESM2: OFS PP\s+((?:\d+\.\d+\s+){5}\d+\.\d+)\s*$',body,re.M)
  if len(matches)==1 and 'Aggregate mean' in body:return (matches[0].split()[-1],'Published Table I, ProteinGym substitutions Spearman correlation, Aggregate mean (sixth numeric column); PDF page6',['ESM2: OFS PP']+matches[0].split()),None
  return None,'ProteinGym substitution table row/column layout differs'
 if r['source_ids'][0] in ['expansion-p3-glycanml-2405-16206v1','part2-massspecgym-arxiv-v1','evidence-discovery-final-tape']:return paper_pdf_resolve(r,text)

 loc=r['attributes'].get('source_locator','');m=re.search(r'Table\s*(\d+).*?row\((.*)\),\s*column\((.*)\)',loc)
 if not m:return None,'PDF locator lacks independently resolvable row/column'
 num,rl,cl=m.groups();prefix=r['id'].split('-')[0]
 if prefix=='bend':cl=cl.replace('Noncoding variant effects on expression','Variant effects (expression)').replace('Noncoding variant effects on disease','Variant effects (disease)')
 lines=text.split('\n');blocks=[]
 def block(start,end,columns,caption=None):
  body='\n'.join(lines[start-1:end]);blocks.append((body,columns,caption or f'Pinned PDF lines {start}–{end}; table {num}',start))
 if prefix=='beacon' and num=='3':
  block(463,494,['SSP','CMP','DMP','SSI','SPL','APA','NcRNA','Modif','MRL','VDP','PRS','CRI-On','CRI-Off'], 'Table 3: mean (std) reported; F1, P@L, R2, ACC@K, ACC, AUC and SC reported in %, VDP MCRMSE.')
 elif prefix=='flip':
  maps={'4':(505,525,['1-vs-rest','2-vs-rest','3-vs-rest','low-vs-high']),'5':(558,573,['Mut-Des','Des-Mut','1-vs-rest','2-vs-rest','7-vs-rest','low-vs-high']),'6':(575,591,['Mixed','Human','Human-Cell']),'7':(623,632,['AAV','GB1'])}
  if num in maps:block(*maps[num],caption=f'Table {num}: Spearman correlation')
 elif prefix=='gue' and num=='6':
  block(872,882,['Epigenetic marks prediction '+s for s in ['H3','H3K14ac','H3K36me3','H3K4me1','H3K4me2','H3K4me3']])
  block(884,893,['Epigenetic marks prediction '+s for s in ['H3K79me3','H3K9ac','H4','H4ac']]+['Promoter detection '+s for s in ['all','notata','tata']])
  block(896,905,['Transcription factor prediction (human) '+str(i) for i in range(5)]+['Core promoter detection '+s for s in ['all','notata','tata']])
  block(908,917,['Transcription factor prediction (mouse) '+str(i) for i in range(5)]+['Covid variant classification Covid','Splice site prediction Reconstruct'])
 elif prefix=='bend' and num=='3':
  cols=['Gene finding','Enhancer annotation','Chromatin accessibility','Histone modification','CpG methylation','Variant effects (expression)','Variant effects (disease)'];block(464,489,cols)
  if rl=='Expert method':
   rows=pdf_rows(blocks[0][0],7);rows=[row for row in rows if not row[0]]
   if len(rows)==1 and key(cl) in list(map(key,cols)):return (rows[0][1][list(map(key,cols)).index(key(cl))],blocks[0][2],['Expert method']+rows[0][1]),None
 elif prefix=='hest' and num=='1':
  cols=['ResNet50','KimiaNet','Ciga','CTransPath','Remedis','Phikon','PLIP','UNI','CONCH','GigaPath']
  found=[i for i,line in enumerate(lines) if line.strip()==rl and 440<i<505]
  if len(found)==1 and cl in cols:
   i=found[0];means=re.findall(r'\d+\.\d+',lines[i-1]);spreads=re.findall(r'±(\d+\.\d+)',lines[i+1])
   if len(means)==10 and len(spreads)==10:
    ci=cols.index(cl);return (means[ci]+' ±'+spreads[ci],'Table 1: mean ± standard deviation over folds/patients; Pearson correlation',[rl]+[a+' ±'+b for a,b in zip(means,spreads)]),None
 elif prefix=='proteingym':
  if num=='2':block(502,525,['Zero-shot substitutions, '+s for s in ['Spearman','AUC','MCC','NDCG@10%','top 10% recall']])
  if num=='3':
   cols=['Supervised substitutions, '+s+', '+metric for metric in ['Spearman','MSE'] for s in ['contiguous split','modulo split','random split','average over splits']]
   block(531,542,cols)
   # Model feature family is explicit in the record name and source's leftmost group heading.
   current='';adjusted=[]
   for label,cells in pdf_rows(blocks[0][0],8):
    for family in ['OHE','Embed.','NPT']:
     if label.startswith(family+' '):current=family;label=label[len(family):].strip();break
    adjusted.append((current+' '+label,cells))
   wanted=r['name'].split(' · ')[0]
   match=[cells for label,cells in adjusted if key(label)==key(wanted)]
   if len(match)==1 and cl in cols:return (match[0][cols.index(cl)],blocks[0][2],[wanted]+match[0]),None
   return None,'PDF supervised feature-family row could not be uniquely resolved'
  if num=='4':block(571,586,['Zero-shot indels, '+s for s in ['library assays, Spearman','designed or natural assays, Spearman','all assays, Spearman','all assays, AUC']])
 elif prefix=='atom3d':
  cols=['3DCNN','GNN','ENN']
  if num=='3':block(360,367,cols+['[Tsubaki et al., 2019]','[Liu et al., 2019]'])
  if num=='4':
   source_lines='\n'.join(lines[369:384]).replace('∗','')
   extra='[Sanchez-Garcia et al., 2018]' if rl.startswith('PIP') else '[Rao et al., 2019]'
   blocks.append((source_lines,cols+[extra],'ATOM3D Table4; starred training-set caveats retained in source',369))
  if num=='5':block(408,418,cols+['[Öztürk et al., 2018]','[Karimi et al., 2019]'])
  if num=='6':
   begin,end=(425,428) if 'psr' in r['id'] else (429,430)
   extra='[Pagès et al., 2019]' if 'psr' in r['id'] else '[Watkins et al., 2020]'
   body='\n'.join(lines[begin-1:end]);body=re.sub(r'\[[^\]]+\]','',body)
   blocks.append((body,['3DCNN','GNN',extra],'ATOM3D Table6; source PSR/RSR blocks distinct',begin))
 elif prefix=='tdc' and num=='4':
  ranges={'Absorption':(1527,1532,['Caco2','HIA','Pgp','Bioav','Lipo','AqSol']),'Distribution':(1534,1538,['BBB','PPBR','VD']),'Metabolism':(1540,1546,['CYP2C9 Inhibition','CYP2D6 Inhibition','CYP3A4 Inhibition','CYP2C9 Substrate','CYP2D6 Substrate','CYP3A4 Substrate']),'Excretion':(1548,1553,['Half_Life','CL-Hepa','CL-Micro']),'Toxicity':(1552,1556,['LD50','hERG','AMES','DILI'])}
  bm=re.search(r'block\((.*?)\)',loc)
  if bm and bm[1] in ranges:
   start,end,cols=ranges[bm[1]];body='\n'.join(lines[start-1:end]);cols=['TDC.'+c for c in cols];rows=[]
   for line in body.splitlines():
    # Discard separately labelled parameter-count column, never a metric.
    line=re.sub(r'\s+\d{1,3}(?:,\d{3})+\s*$','',line)
    rows+=pdf_rows(line,len(cols))
   matches=[cells for label,cells in rows if key(label)==key(rl)]
   if len(matches)==1 and key(cl) in list(map(key,cols)):return (matches[0][list(map(key,cols)).index(key(cl))],f'Table4 {bm[1]}; ± spread type not stated; pinned lines{start}–{end}',[rl]+matches[0]),None
 matches=[]
 for body,cols,caption,start in blocks:
  if key(cl) not in list(map(key,cols)):continue
  ci=list(map(key,cols)).index(key(cl))
  for label,cells in pdf_rows(body,len(cols)):
   label=re.sub(r'^Pre-trained\s+','',label)
   if key(label)==key(rl):matches.append((cells[ci],caption,[label]+cells))
 if len(matches)==1:return matches[0],None
 return None,f'PDF source-specific resolver found {len(matches)} cells; boundaries or locator require review'


def openproblems_rows(body):
 d=DOM();d.feed(body.decode('utf8'));rows=[]
 def decode(value):
  if isinstance(value,list):
   if len(value)!=2 or value[0] not in [0,1]:raise ValueError('Unrecognized Astro serialization tag')
   return [decode(v) for v in value[1]] if value[0]==1 else decode(value[1])
  if isinstance(value,dict):return {k:decode(v) for k,v in value.items()}
  return value
 for island in d.root.find('astro-island'):
  props=json.loads(island.attrs.get('props','{}'))
  if 'results' in props:rows.extend(decode(props['results']))
 return rows

def openproblems_resolve(r,rows):
 loc=r['attributes'].get('source_locator','');m=re.fullmatch(r'results, dataset\((.*?)\), method\((.*?)\), paramset\((.*?)\), metric\((.*?)\)',loc)
 if not m:return None,'OpenProblems locator grammar unavailable'
 dataset,method,params,metric=m.groups();matched=[]
 for row in rows:
  if (row.get('dataset_name'),row.get('method_name'),row.get('paramset_name') or 'none')!=(dataset,method,params):continue
  names=row['metric_names'];vals=row['metric_values']
  if len(names)!=len(vals) or len(set(names))!=len(names):return None,'Malformed or duplicate metric names'
  if metric in names:matched.append(str(vals[names.index(metric)]))
 if matched and len(set(matched))==1:return (matched[0],'OpenProblems embedded source result; repeated identical UI instances retained as one source occurrence',[dataset,method,params,metric,matched[0]]),None
 return None,'OpenProblems source row absent or duplicated with conflicting values'

def tape_markdown_resolve(r,text):
 m=re.fullmatch(r"README.md > Leaderboard > (Fluorescence|Stability); row (.*); column Spearman's rho",r['attributes'].get('source_locator',''))
 if not m:return None,'TAPE Markdown locator absent'
 section,model=m.groups();body=text.split('### '+section,1)[1].split('### ',1)[0];matches=[]
 for line in body.splitlines():
  cells=[v.strip() for v in line.strip('|').split('|')]
  if len(cells)==3 and key(cells[1])==key(model):matches.append(cells)
 if len(matches)==1:return (matches[0][2],'TAPE README Leaderboard '+section+"; Spearman's rho",matches[0]),None
 return None,'TAPE Markdown row ambiguous'

# Fresh retrievals were independently inspected but DO NOT replace historical pins.
# The four rows stay insufficient_evidence for their historical source version.
FRESH_OBSERVATIONS={
 'b2-structure-informed-plm-2025':('b83152ca9ab390fb167702554eefd12000b27432f565afaf6d44a00af322dc0f',None,5,10,3),
 'lit-b3-013':('080c6b2fb9898e3494a620fd967a298089322032a69a6bc898cabe120b5834e6','2',0,2,2),
 'lit-b3-014':('080c6b2fb9898e3494a620fd967a298089322032a69a6bc898cabe120b5834e6','2',0,2,3),
 'lit-b4-002':('1c5e73e92824dca418702524d99af26642f385b7a7c6880d375d95086c26f1ba','1',0,1,4),
}
def fresh_observation(r,url):
 if r['id'] not in FRESH_OBSERVATIONS:return None
 h,num,occ,ri,ci=FRESH_OBSERVATIONS[r['id']];p=Path('/tmp/rewire-existing-review/retrieved-'+h)
 if not p.is_file() or sha(p.read_bytes())!=h:return None
 ts=tables(p.read_bytes());t=([t for t in ts if t['number']==num] if num else ts)[occ];cell=t['rows'][ri][ci];original=cell
 if r['id']=='lit-b4-002':
  pair=re.fullmatch(r'(\d+\.\d+) vs (\d+\.\d+)',cell)
  if pair:cell=pair[1]
 n=cell_number(cell)
 return {'retrieved_at':'2026-09-19','source_url':url,'artifact_sha256':h,'source_cell':original,'selected_scalar':str(n[0]) if n else None,'scalar_agrees':n is not None and n[0]==Decimal(str(r['attributes'].get('numeric_value'))),'source_row':t['rows'][ri],'source_caption':t['caption'],'coordinate':{'table_number':num,'table_occurrence_zero_based':occ,'expanded_row_zero_based':ri,'column_zero_based':ci},'status':'fresh_version_observation_only; historical artifact bytes not recovered; no verification upgrade'}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--records',type=Path,default=ROOT/'public/omics/releases/2026-09-19-f5c67a009c10/records.jsonl');ap.add_argument('--cache',type=Path,default=Path('/tmp/rewire-catalogue-source-audit'));ap.add_argument('--output',type=Path,default=ROOT/'data/omics/audits/2026-09-19-existing-verification.receipts.jsonl');args=ap.parse_args()
 allrecords=[json.loads(l) for l in args.records.open()];results=[r for r in allrecords if r['kind']=='result'];byid={r['id']:r for r in allrecords};parsed={};receipts=[]
 batches={}
 for p in (ROOT/'data/omics/reviewed').glob('*.jsonl'):
  for l in p.open():
   r=json.loads(l)
   if r.get('kind')=='result':batches[r['id']]=(p,r)
 for r in results:
  a=r['attributes'];review=a.get('review',{});sid=r.get('source_ids',[None])[0];source=byid.get(sid,{}).get('attributes',{})
  ah=review.get('artifact_sha256') or source.get('artifact_sha256');loc=a.get('source_locator');path=args.cache/(ah or '_missing');artifact=None
  own_artifact=None
  if r['id'].startswith('rewire-result-') and re.fullmatch(r'[0-9a-f]{40}',source.get('version','')):
   target=loc.split(' :: ')[0]
   if target.startswith('benchmarks/mfass/results/') and target.endswith('.json') and '..' not in target:
    result=subprocess.run(['git','show',source['version']+':'+target],cwd=ROOT.parent/'rewire-benchmarks',capture_output=True)
    if result.returncode==0:
     own_artifact=result.stdout;ah=sha(own_artifact);parsed[ah]=('ownrun',json.loads(own_artifact));Path('/tmp/rewire-existing-review/'+ah+'.json').write_bytes(own_artifact)
  common={'record_id':r['id'],'record_sha256':sha(canonical(r)),'checked_at':'2026-09-19','source_id':sid,'source_locator':loc,'artifact_sha256':ah,'source_url':review.get('retrieval_url') or source.get('artifact_url') or source.get('url'),'human_review':False,'scientific_reproduction':False}
  # Historical receipt explicitly verifies preservation, not source correctness.
  matched=batches.get(r['id']);histfields=['printed_value','numeric_value','unit','uncertainty','source_locator']
  same=matched and all(a.get(f)==matched[1]['attributes'].get(f) for f in histfields)
  receipts.append({**common,'check_category':'historical_receipt','field_paths':['attributes.'+f for f in histfields],'outcome':'supported' if same and review else 'insufficient_evidence','method':'comparison_to_committed_reviewed_batch_and_original_receipt','verification_level':'historical_review_preservation_only','evidence':{'batch_path':str(matched[0].relative_to(ROOT)) if matched else None,'batch_sha256':sha(matched[0].read_bytes()) if matched else None,'original_review':review,'warning':'Preservation of an earlier review is not a new verification of values or scientific context.'}})
  reason=None;resolved=None;caption=None
  if own_artifact is not None:common['source_url']='https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/'+source['version']+'/'+target
  if own_artifact is None and (not ah or not path.is_file()):reason='Pinned primary artifact unavailable in supplied content-addressed cache'
  else:
   if ah not in parsed:
    b=path.read_bytes()
    if sha(b)!=ah:parsed[ah]=('invalid',None)
    elif b.startswith(b'%PDF'):parsed[ah]=('pdf',subprocess.check_output(['pdftotext','-layout',str(path),'-'],text=True,stderr=subprocess.DEVNULL))
    elif b.startswith(b'PK'):
     try:parsed[ah]=('xlsx',xlsx_cells(b))
     except Exception:parsed[ah]=('unsupported',None)
    elif ah=='e223ab712ff55997a3abe659f280d4ea2952700e767b87e02c434701da9833c1':parsed[ah]=('openproblems',openproblems_rows(b))
    elif b.lstrip().startswith(b'<'):parsed[ah]=('tables',tables(b))
    elif r['source_ids'][0]=='src-discovery-songlab-cal-tape':parsed[ah]=('tape_markdown',b.decode('utf8'))
    else:parsed[ah]=('unsupported',None)
   fmt,data=parsed[ah]
   if fmt=='ownrun':
    metric={'average_precision':'average_precision_sklearn','precision_at_100':'precision_at_capacity'}.get(a.get('metric'),a.get('metric'))
    metrics=data.get('metrics',{})
    if metric in metrics:resolved=(str(metrics[metric]),'Existing MFASS metrics artifact at source-pinned Git revision; no new execution',[metric,str(metrics[metric])]);reason=None
    else:reason='Metric missing from pinned MFASS artifact'
   elif fmt=='tape_markdown':
    resolved,reason=tape_markdown_resolve(r,data)
   elif fmt=='openproblems':
    resolved,reason=openproblems_resolve(r,data)
    if resolved:cell,caption,row=resolved
   elif fmt=='pdf':
    resolved,reason=pdf_resolve(r,data)
    if resolved:cell,caption,row=resolved
   elif fmt=='tables':
    resolved,reason=legacy_table_resolve(r,data,ah) if r['id'] in LEGACY_COORDINATES else resolve_table(r,data)
    if resolved:cell,caption,row=resolved
   elif fmt=='xlsx':
    cells=a.get('source_cells',[])
    if cells and all(c in data for c in cells) and len({data[c] for c in cells})==1:cell=data[cells[0]];resolved=(cell,'OOXML stored scalar; all cited duplicate occurrences agree',[]);caption='OOXML stored scalar'
    else:reason='Workbook locator unavailable or has multiple cells; requires formula/aggregation review'
   else:reason={'pdf':'PDF multi-column table needs a separate layout-specific reader; historical extraction receipt retained without new source verification','invalid':'Primary artifact checksum mismatch','unsupported':'Unsupported artifact format for independent reader'}.get(fmt,'Unsupported source')
  paths=['attributes.printed_value','attributes.numeric_value'];outcome='insufficient_evidence';evidence={'reason':reason}
  if resolved:
   cell,caption,row=resolved
   original_cell=cell
   if r['id'].startswith('proteinbench-') and '/' in cell and 'mean/median' in caption.lower():
    pair=cell.split('/');metric=a.get('metric','')
    if len(pair)==2 and metric.endswith(('_mean','_median')):cell=pair[0 if metric.endswith('_mean') else 1].strip()
   # These source cells explicitly list AUROC then AUPRC in one cell.
   if r['id'] in ['lit-031','lit-032'] and 'AUROC AUPRC' in row:
    pair=re.fullmatch(r'([0-9.]+\s*±\s*[0-9.]+)\s+([0-9.]+\s*±\s*[0-9.]+)',cell)
    if pair:cell=pair[1]
   # Publisher's fallback LaTeX for the ± symbol is printed inline in JATS.
   if r['id']=='lit-b4-006':
    cell=re.sub(r'\\documentclass.*?\\end\{document\}',lambda m:'±' if r'\pm' in m[0] else m[0],cell)
   n=cell_number(cell)
   try:expected=Decimal(str(a['numeric_value']))
   except (InvalidOperation,KeyError,TypeError):expected=None
   if expected is None and norm(cell) in ['N/A','NA','—','–','-'] and a.get('numeric_value') is None:
    outcome='supported';paths=['attributes.numeric_value'];evidence={'source_cell':cell,'missing_value_confirmed':True,'source_caption':caption[:500],'reason':'Source explicitly omits this measurement; no numeric value inferred.'}
   elif n and expected is not None:
    outcome='supported' if n[0]==expected else 'contradicted'
    # XLSX raw scalar can differ from formatted printed_value; only numeric value checked.
    if parsed[ah][0]=='xlsx':paths=['attributes.numeric_value']
    elif norm(cell)!=norm(str(a.get('printed_value'))):paths=['attributes.numeric_value']
    evidence={'source_cell':cell,'original_source_cell':original_cell,'source_caption':caption[:500],'resolved_source_row':row,'numeric_agreement':n[0]==expected}
    unc=a.get('uncertainty')
    if n[1] is not None and isinstance(unc,dict) and unc.get('value') is not None:
     try:
      spread_agrees=Decimal(str(unc['value']))==Decimal(n[1])
      paths.append('attributes.uncertainty.value');evidence['spread_agreement']=spread_agrees
      if not spread_agrees:outcome='contradicted'
     except InvalidOperation:pass
    if '%' in cell and a.get('unit')=='percent':paths.append('attributes.unit');evidence['unit_evidence']='Percent sign printed in the exact source cell'
    if isinstance(unc,dict) and unc.get('type')=='standard_deviation' and re.search(r'standard deviations?',caption,re.I):
     paths.append('attributes.uncertainty.type');evidence['uncertainty_type_evidence']=caption[:500]
   else:evidence={'source_cell':cell,'reason':'Complete numeric grammar not supported or numeric value absent; no partial numeric parse'}
  if outcome=='insufficient_evidence' and r['id'] in FRESH_OBSERVATIONS:
   observed=fresh_observation(r,common['source_url'])
   if observed:
    evidence['fresh_source_observation']=observed
    evidence['reason']='Historical pinned primary artifact unavailable in supplied cache; fresh retrieval at the same primary URL has a different hash. Fresh source cell observation retained without certifying the historical version.'
  receipts.append({**common,'check_category':'source_transcription','field_paths':paths,'outcome':outcome,'method':'independent_source_cell_reader:'+parsed.get(ah,('unavailable',None))[0],'verification_level':'new_source_cell_check' if resolved else 'not_newly_verified','evidence':evidence})
  # Context is not certified by matching a scalar. Keep an explicit separate check.
  receipts.append({**common,'check_category':'scientific_context','field_paths':['attributes.unit','attributes.uncertainty','attributes.metric','attributes.metric_direction'],'outcome':'insufficient_evidence','method':'scoped_review_boundary','verification_level':'not_newly_verified','evidence':{'reason':'Numerical transcription and historical receipt preservation do not independently establish metric units, uncertainty meaning, denominators, selection, or compatible protocols. Requires table caption/methods adjudication.'}})
 args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(''.join(json.dumps(x,sort_keys=True,ensure_ascii=False,allow_nan=False)+'\n' for x in receipts))
 summary={'results':len(results),'receipts':len(receipts),'outcomes':dict(Counter((r['check_category']+':'+r['outcome']) for r in receipts)),'input_sha256':sha(args.records.read_bytes())}
 print(json.dumps(summary,indent=2))
 Path('/tmp/rewire-existing-review/summary.json').write_text(json.dumps(summary,indent=2))
 (ROOT/'data/omics/audits/2026-09-19-existing-gaps.json').write_text(json.dumps([{'record_id':r['record_id'],'record_sha256':r['record_sha256'],'source_id':r['source_id'],'source_locator':r['source_locator'],'artifact_sha256':r['artifact_sha256'],'source_url':r['source_url'],'reason':r['evidence'].get('reason'),'fresh_source_observation':r['evidence'].get('fresh_source_observation'),'limitation_type':'historical_source_version_unavailable' if r['evidence'].get('fresh_source_observation') else 'pinned_artifact_not_in_local_cache' if 'unavailable in supplied' in str(r['evidence'].get('reason')) else 'independent_reader_does_not_yet_resolve_exact_context','reviewed_at':'2026-09-19','next_action':'Retrieve and authenticate pinned source bytes' if 'unavailable in supplied' in str(r['evidence'].get('reason')) else 'Manually adjudicate exact original table row, column and context, then add a source-specific reader; do not search for the stored number','prior_receipt_preserved':True} for r in receipts if r['check_category']=='source_transcription' and r['outcome']=='insufficient_evidence'],indent=2))
if __name__=='__main__':main()
