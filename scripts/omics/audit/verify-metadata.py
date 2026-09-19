#!/usr/bin/env python3
"""Fresh bounded metadata checks; never promotes numerical review to model verification.

Reads a frozen release and freshly retrieved source bytes. Broad inventory results
remain insufficient unless a narrow bibliographic/claim check actually establishes
support. Historical profile reviews are retained as context, never replayed as fresh
review. No catalogue data is mutated.
"""
import gzip,hashlib,html,json,re,unicodedata,xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[3]
RELEASE='2026-09-19-f5c67a009c10'
BASE=ROOT/'data/omics/audits'
CACHE=Path('/tmp/rewire-catalogue-source-audit')
records=[json.loads(l) for l in gzip.open(ROOT/f'data/omics/releases/{RELEASE}/records.jsonl.gz','rt')]
byid={r['id']:r for r in records}
access={r['source_id']:r for r in map(json.loads,(BASE/'2026-09-19-source-access.receipts.jsonl').read_text().splitlines())}
receipts=[]; texts={}; xml={}; aliases={}

def normal(s):return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',html.unescape(str(s)))).strip().casefold()
def canonical(url):
 p=urlsplit(url)
 if p.netloc=='github.com' and '/blob/' in p.path:return 'https://raw.githubusercontent.com'+p.path.replace('/blob/','/',1)
 return url
for sid,a in access.items():
 h=a.get('retrieved_sha256');p=CACHE/(h or '-')
 if a['outcome']!='supported' or not p.is_file():continue
 b=p.read_bytes()
 if hashlib.sha256(b).hexdigest()!=h:raise ValueError('Cache bytes changed: '+sid)
 if b.startswith(b'%PDF') or b.startswith(b'PK'):continue
 try:s=b.decode('utf-8')
 except UnicodeDecodeError:continue
 try:
  doc=ET.fromstring(s)
  # Normalize XML namespaces; bibliographic checks remain restricted to article-meta.
  for el in doc.iter():el.tag=el.tag.rsplit('}',1)[-1]
  xml[sid]=doc;s=' '.join(doc.itertext())
 except ET.ParseError:s=html.unescape(re.sub(r'<[^>]+>',' ',s))
 texts[sid]=normal(s)
 aliases[canonical(a['url'])]=sid

def resolve(source_ids):
 out=[]
 for sid in source_ids:
  if sid in texts:out.append(sid);continue
  source=byid.get(sid,{})
  url=source.get('attributes',{}).get('artifact_url') or source.get('attributes',{}).get('url')
  if url and canonical(url) in aliases:out.append(aliases[canonical(url)])
 return list(dict.fromkeys(out))

def add(record,path,outcome,category,ids,locator,explanation,method='automated scoped metadata review',**extra):
 ids=list(dict.fromkeys(ids))
 evidence=[{'source_id':s,'source_locator':locator,'artifact_sha256':access[s].get('retrieved_sha256'),'url':access[s]['url']} for s in ids if s in access and access[s].get('retrieved_sha256')]
 data=dict(record_id=record['id'],field_paths=path if isinstance(path,list) else [path],outcome=outcome,category=category,source_ids=ids,source_locator=locator,artifact_sha256=evidence[0]['artifact_sha256'] if len(evidence)==1 else None,evidence=evidence,explanation=explanation,review_method=method,checked_at='2026-09-19',release_id=RELEASE,record_sha256=hashlib.sha256(json.dumps(record,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest(),**extra)
 data['id']='metadata-check-'+hashlib.sha256(json.dumps(data,sort_keys=True,ensure_ascii=False).encode()).hexdigest()[:24]
 receipts.append(data)

# Every current record receives an explicit scientific-metadata scope outcome.
for r in records:
 cited=r['source_ids'] or ([r['id']] if r['kind']=='source' else [])
 available=resolve(cited)
 historical=r['attributes'].get('profile',{}).get('review')
 add(r,['name','description','attributes','links'],'insufficient_evidence','metadata-review-coverage',cited,'Record-level metadata inventory',
     'Metadata inventory reviewed; accessible source bytes do not establish every architecture, training-data, licence, protocol or relationship claim. Detailed findings are recorded separately. Numerical verification is a separate check.',
     available_text_source_ids=available,historical_review=historical,scope='scientific metadata; excludes numerical result verification')
 # Primary-source bibliographic identity is checked against article metadata, not reference lists.
 if r['kind']=='source' and r['id'] in xml:
  meta=xml[r['id']].find('.//article-meta')
  if meta is not None:
   title=meta.find('.//article-title')
   if title is not None:
    observed=''.join(title.itertext())
    if normal(observed)==normal(r['name']):
     add(r,'name','supported','bibliographic-source-identity',[r['id']],'article-meta/title-group/article-title','Exact primary-article title matches after Unicode and whitespace normalization. This does not verify publication status or any scientific claim.',observed_value=observed)
   doi=r['attributes'].get('doi')
   if doi:
    observed=[normal(''.join(e.itertext())) for e in meta.findall('article-id') if e.attrib.get('pub-id-type')=='doi']
    if normal(doi) in observed:add(r,'attributes.doi','supported','bibliographic-source-identity',[r['id']],'article-meta/article-id[@pub-id-type="doi"]','Exact DOI matches primary article metadata, not a bibliography citation.',observed_value=doi)
 # Every explanatory claim node gets its own source-scope outcome.
 profile=r['attributes'].get('profile')
 if not profile:continue
 nodes=[('attributes.profile.summary',{'value':profile.get('summary'),'source_ids':profile.get('summary_source_ids',[]),'source_locator':profile.get('summary_source_locator')})]
 for group,textkey in [('facts','value'),('sections','body'),('strengths','text'),('limitations','text')]:
  for i,node in enumerate(profile.get(group,[])):nodes.append((f'attributes.profile.{group}.{i}.{textkey}',dict(node,value=node.get(textkey))))
 for path,node in nodes:
  value=node.get('value')
  if not value:continue
  cited=node.get('source_ids',[]);available=resolve(cited);loc=node.get('source_locator') or 'No specific locator supplied'
  # Match only substantial exact text, and report occurrence separately from entailment.
  matches=[sid for sid in available if len(normal(value))>=50 and normal(value) in texts[sid]]
  if matches:add(r,path,'supported','source-text-transcription',matches,loc,'Full claim text occurs in freshly retrieved pinned source bytes. This check establishes text occurrence only, not attribution, scientific entailment or completeness.',recorded_value=value)
  if not available and cited:
   outcome='inaccessible';why='No cited, hash-verified readable source body was available for this fresh claim check. A landing page, JavaScript shell, blocked retrieval or binary source without a verified parser does not verify the claim.'
  else:
   outcome='insufficient_evidence';why='Cited source availability or text occurrence alone does not verify this paraphrased/scoped scientific claim. Fresh semantic review remains required; the existing historical review is not promoted.'
  if node.get('status') in ['unreported','unextracted','inapplicable','unavailable']:
   why+=' The record already declares missingness/inapplicability; this check does not invent the missing information or certify an absence without a scoped search.'
  add(r,path,outcome,'metadata-claim-interpretation',available or cited,loc,why,recorded_value=value,historical_status=node.get('status'))

# Targeted source reading by a separate agent. Assertions protect exact evidence
# anchors and record identity; these manually reasoned checks have a distinct method.
def fact(record_id,label):
 r=byid[record_id]
 for i,f in enumerate(r['attributes']['profile']['facts']):
  if f['label']==label:return r,f'attributes.profile.facts.{i}.value',f
 raise ValueError((record_id,label))
def reviewed(record_id,label,sids,anchors,explanation,locator):
 r,path,f=fact(record_id,label)
 for sid,fragments in anchors.items():
  assert sid in texts,sid
  for fragment in fragments:assert normal(fragment) in texts[sid],(sid,fragment)
 # Replace only the unproven interpretation outcome for this exact reviewed field;
 # this script's deterministic output is one run, not an edit of historical checks.
 global receipts
 receipts=[x for x in receipts if not(x['record_id']==record_id and x['field_paths']==[path] and x['category']=='metadata-claim-interpretation')]
 add(r,path,'supported','metadata-claim-interpretation',sids,locator,explanation,'AI-assisted primary-source reading with asserted evidence anchors; no human review or model execution',recorded_value=f['value'])

PAPER='evidence-alphafold-paper';LICENSE='evidence-alphafold-license';WEIGHTS='evidence-alphafold-weights-terms-of-use'
reviewed('discovery-model-alphafold-3','Architecture',[PAPER],{PAPER:['Each of the 48 blocks has an independent set of trainable parameters','diffusion module','confidence']},'Read Model architecture and Figure 2: Pairformer token/pair representations and 48 blocks feed atom-coordinate diffusion; confidence prediction is separate. Applies to described AF3 architecture, not hosted checkpoint identity.','Model architecture; Figure 2 caption')
reviewed('discovery-model-alphafold-3','Model type',[PAPER],{PAPER:['pairformer','diffusion module','biomolecular']},'Paper describes joint biomolecular structure prediction using Pairformer and diffusion. No trained-parameter total or specific checkpoint digest inferred.','Article title; Model architecture; Figure 2')
reviewed('discovery-model-alphafold-3','Code licence',[LICENSE],{LICENSE:['Apache License','Version 2.0, January 2004']},'Pinned official inference repository LICENSE is Apache 2.0. This scope does not license weights or the hosted service.','LICENSE header')
reviewed('discovery-model-alphafold-3','Weights licence',[WEIGHTS],{WEIGHTS:['Last Modified: 2024-11-09','non-commercial use by, or on behalf of, non-commercial organizations','must not* publish or share AlphaFold 3 model parameters']},'Read dated parameters terms: non-commercial use by/for non-commercial organizations, restrictions on output use for model training and parameter redistribution. Separate from Apache inference code.','Last Modified; Key things to know paragraphs 1–4')
PERF='evidence-alphafold-docs-performance'
reviewed('discovery-model-alphafold-3','Context limits',[PERF],{PERF:['By default, the largest bucket size is 5,120 tokens','Processing inputs larger than this maximum bucket size triggers','Unified Memory']},'Performance documentation states default compilation bucket and supports larger input via recompilation/configuration subject to memory. This is not an architectural hard context limit.','Compilation buckets; Unified Memory')
OUT='evidence-alphafold-docs-output'
reviewed('discovery-model-alphafold-3','Outputs',[OUT],{OUT:['mmCIF','pLDDT','PAE','pTM','ipTM']},'Output documentation explicitly specifies mmCIF structures and the four named confidence outputs. Confidence is not biological accuracy or binding affinity.','Output directory structure; Confidence metrics')
reviewed('discovery-model-alphafold-3','Access',['evidence-alphafold-readme',WEIGHTS],{'evidence-alphafold-readme':['implementation of the inference pipeline','received directly from Google'],WEIGHTS:['non-commercial use']},'Official README permits model parameters only when received directly from Google and links separate terms. Read terms separately; inference code availability does not make weights open-licensed.','README introduction and Obtaining Model Parameters; parameters terms')
SCIB='run-doc-scib-readme-md-cd679133'
reviewed('discovery-benchmark-scib','Metrics',[SCIB],{SCIB:['metrics for evaluating batch correction and biological conservation']},'Official pinned README explicitly separates batch correction and biological conservation in its metric module. This does not select a dataset, split or aggregation.','README Metrics')
reviewed('discovery-benchmark-scib','Datasets',[SCIB],{SCIB:['preprocessing an `anndata` object','running integration methods and evaluating']},'README establishes AnnData-based preprocessing and integration output evaluation. This is a software input description, not one fixed benchmark dataset.','README Package: scib')
# Intra-record contradiction: package/evaluator explanatory text under suite record.
r=byid['discovery-benchmark-scib'];path=next(p for p in [f'attributes.profile.facts.{i}.value' for i,f in enumerate(r['attributes']['profile']['facts']) if f['label']=='Entity type'])
add(r,['kind',path,'attributes.entity_classification.rationale'],'insufficient_evidence','entity-identity-scope',[SCIB],'README Package: scib; Resources; original study link','Current top-level benchmark record calls itself a single-cell integration evaluator while its kind/classification says benchmark suite. Official source distinguishes package, pipeline and study. Retain separate identities or clarify profile scope before asserting entity equivalence.','AI-assisted source and record consistency review')
# Missing supplement and server sources remain explicit targeted gaps.
r,path,f=fact('discovery-model-alphafold-3','Training data')
add(r,path,'inaccessible','source-scope-gap',f['source_ids'],f['source_locator'],'The sole cited supplement could not be freshly retrieved. Main-paper accessibility does not settle all supplement-specific training-data claims, including fine-tuning examples. Preserve historical claim and its review date; do not newly certify it.','AI-assisted targeted source-scope review')
r=byid['catalog-model-alphafold-3-server']
add(r,['links','attributes.profile.facts','attributes.profile.sections'],'inaccessible','hosted-service-scope',['evidence-alphafold-server-faq','evidence-alphafold-server-terms','evidence-alphafold-server-output-terms'],'Official server FAQ and terms URLs','Fresh retrievals returned an application shell without readable FAQ/terms. Cannot reverify current quotas, tokens, custom-input capabilities, weight equivalence or output restrictions. Local inference licences and paper architecture must not certify hosted-service claims.','AI-assisted targeted source-scope review')
assert len({r['id'] for r in receipts})==len(receipts)
assert {r['record_id'] for r in receipts}==set(byid)
output=BASE/'2026-09-19-metadata-verification.receipts.jsonl'
output.write_text(''.join(json.dumps(r,ensure_ascii=False,sort_keys=True)+'\n' for r in receipts))
print(json.dumps({'records':len(records),'receipts':len(receipts),'outcomes':dict(Counter(r['outcome'] for r in receipts)),'categories':dict(Counter(r['category'] for r in receipts)),'output_sha256':hashlib.sha256(output.read_bytes()).hexdigest()},indent=2))
