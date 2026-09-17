import sys, gzip
import json, pathlib, hashlib, re, collections, copy
ROOT=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'workbench/benchmark-evidence-rebuild')
base=json.loads((ROOT/'baseline-catalogue.json').read_text()) if (ROOT/'baseline-catalogue.json').exists() else json.loads(json.loads(gzip.decompress(pathlib.Path('data/omics/releases/2026-09-17-a757f4af4277.bundle.json.gz').read_bytes()))['catalogue.json']); old={r['id']:r for r in base['records']}; records={}; overlays={}; occurrences=[]; panels=[]
DATE='2026-09-17'
def digest(x): return hashlib.sha256(json.dumps(x,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def uid(kind,*parts): return 'paper-'+kind+'-'+digest(parts)[:18]
def text(x): return x if isinstance(x,str) else json.dumps(x,ensure_ascii=False)
def put(r):
 if r['id'] in old:return old[r['id']]
 if r['id'] in records:
  assert records[r['id']]==r, r['id'];return r
 records[r['id']]=r;return r
def rec(id,kind,name,description,sources,attrs,links=[],facets=None,status='needs_review'):
 return {'id':id,'kind':kind,'name':name,'description':description,'status':status,'facets':facets or {},'source_ids':sources,'links':links,'attributes':attrs}
def get(id): return records.get(id) or old[id]
def patch(id,attrs=None,sources=None,links=None):
 p=overlays.setdefault(id,{'record_id':id,'attributes':{},'source_ids':[],'replace_links':None})
 if attrs:p['attributes'].update(attrs)
 if sources:p['source_ids']=sorted(set(p['source_ids']+sources))
 if links is not None:p['replace_links']=links
 if id in records:
  records[id]['attributes'].update(p['attributes']);records[id]['source_ids']=sorted(set(records[id]['source_ids']+p['source_ids']))
  if p['replace_links'] is not None:records[id]['links']=p['replace_links']
  del overlays[id]
def source(s):
 if 'attributes' in s:
  r={k:v for k,v in s.items() if k in ['id','kind','name','description','status','facets','source_ids','links','attributes']}
 else:
  attrs={k:s[k] for k in ['url','doi','version','retrieved_at','artifact_sha256'] if s.get(k)}
  attrs.update({'artifact_url':s.get('artifact_url',s['url']),'hash_scope':'Exact retrieved primary paper artifact bytes.','review_scope':'Source identification and table transcription; no independent experimental reproduction.'})
  if not attrs.get('artifact_sha256'):attrs.update({'hash_scope':'No full-text artifact retrieved.','review_scope':'Bibliographic discovery only; full-text retrieval unavailable.','missing_metadata':{'artifact':'unavailable'}})
  r=rec(s['id'],'source',s.get('title') or s.get('name') or s['id'].replace('part2-','').replace('expansion-p3-','').replace('-',' '),'Primary reference; inspect retrieval status and review scope.',[],attrs,status='source_checked' if attrs.get('artifact_sha256') else 'discovered')
 return put(r)['id']
def claim(subject,field,value,sources,locator):
 if uid('claim',subject,field,value) in records:return records[uid('claim',subject,field,value)]
 return put(rec(uid('claim',subject,field,value),'claim',get(subject)['name']+': '+field,'Source-backed metadata or reviewed relationship.',sources,{'field':field,'value':value,'source_locator':locator,'review':{'method':'automated_source_review','date':DATE}},[{'relation':'subject','target_id':subject}],status='source_checked'))
def association(subject,target,sources,locator,relation='evaluates_task'):
 r=get(subject);link={'relation':relation,'target_id':target}
 links=copy.deepcopy(overlays.get(subject,{}).get('replace_links') or r['links'])
 if link not in links:links.append(link)
 patch(subject,links=links)
 claim(subject,f'links:{relation}:{target}',target,sources,locator)
def profile(summary,sources,locator,section,gaps):
 return {'summary':summary,'summary_source_ids':sources,'summary_source_locator':locator,'sections':[{'title':'Evaluation in this paper','body':section,'source_ids':sources,'source_locator':locator}],'facts':[], 'strengths':[], 'limitations':[], 'coverage':'limited','gaps':gaps,'review':{'method':'automated_source_review','date':DATE,'note':'Primary-source transcription and separate automated review. No human sign-off or experimental reproduction.'}}
def add_group(g):
 # g: reviewed exact cohort and one metric, every table row included.
 sources=g['sources']; parent=g['benchmark_id'];facets=get(parent)['facets'];rows=g['rows'];loc=g['locator']
 existing=[get(x['existing_result_ids'][0]) for x in rows if x.get('existing_result_ids')]
 existing_evs=[get(r['links'][0]['target_id']) for r in existing]
 # Retain original TAPE IDs; other broad reported tasks get exact cohort protocols.
 protocol=parent if g.get('reuse_protocol') else uid('protocol',sources[0],parent,g['dataset'],g['split'],g.get('subset',''))
 dataset=g.get('existing_dataset_id') or next((l['target_id'] for ev in existing_evs for l in ev['links'] if l['relation']=='dataset'),None) or uid('dataset',protocol)
 context=g.get('context') or g['split']; caveats=g.get('caveats') or ['This is a comparison reported in one paper, not a cross-study ranking. Exact checkpoints and scoring coverage remain unextracted where marked.']
 if protocol not in old and protocol not in records:
  summary=g.get('protocol_summary') or (g['title']+'. '+context)
  put(rec(protocol,'benchmark',g.get('protocol_title') or g['dataset']+' ('+get(parent)['name']+')',summary,sources,{'entity_level':'protocol','protocol':context,'profile':profile(summary,sources,loc,context,caveats)},facets=facets))
 if dataset not in old and dataset not in records:
  put(rec(dataset,'dataset',g['dataset'],'Dataset and cohort used in the cited comparison. Dataset population counts do not establish successful prediction coverage.',sources,{'split':g['split'],'subset':g.get('subset'),'reported_population':g.get('population'),'source_locator':loc,'missing_metadata':{'manifest':'unextracted','scored_count':'unreported'}},facets=facets))
 if protocol!=parent:association(protocol,parent,sources,loc)
 for ancestor in g.get('parent_ids',[]):
  if ancestor!=parent:association(protocol,ancestor,sources,loc,'part_of' if get(ancestor)['attributes'].get('entity_level')=='suite' else 'evaluates_task')
 comparison={'protocol_id':protocol,'dataset_version':None,'split':g['split'],'subset':g.get('subset'),'population':g.get('population'),'aggregation':g.get('aggregation'),'inputs':None,'adaptation':None,'budget':None,'metric_implementation':None}
 ids=[]
 for index,row in enumerate(rows):
  rid=(row.get('existing_result_ids') or [None])[0]
  origin=row.get('origin','author_reported'); assert origin in ['author_reported','independent_paper','paper_compilation','rewire_run'],origin
  config=text(row.get('configuration','Paper-reported method; exact checkpoint unextracted'))
  identity=row.get('identity_key') or [sources[0],row['model_name'],config]
  model=row.get('existing_model_id') or uid('model',identity)
  ev=row.get('existing_evaluation_id') or uid('evaluation',protocol,model)
  # A known source cell reuses its historical evaluation and model identity.
  if rid:
   prior=get(rid); assert row['numeric_value'] is not None and float(prior['attributes']['numeric_value'])==float(row['numeric_value']), (rid,row)
   pev=get(next(l['target_id'] for l in prior['links'] if l['relation']=='evaluation'))
   ev=pev['id'];model=next(l['target_id'] for l in pev['links'] if l['relation']=='model')
  model_summary=row['model_name']+' as evaluated in the cited study. '+config
  if model not in old and model not in records:
   put(rec(model,'model',row.get('display_name') or row['model_name']+' ('+g.get('study_label','paper configuration')+')',model_summary,sources,{'entity_level':'method','configuration_type':'reported_configuration','version':config,'profile':profile(model_summary,sources,row['locator'],config,['Exact checkpoint, full training inventory and licences are not established by this comparison table. Follow the original method source before reuse.'])},facets=facets))
  attrs={'origin':origin,'protocol':context,'version':config,'comparison':{**comparison,'adaptation':config},'source_locator':loc,'missing_metadata':{'checkpoint_revision':'unextracted','budget':'unreported','split_manifest':'unextracted'}}
  links=[{'relation':'model','target_id':model},{'relation':'benchmark','target_id':protocol},{'relation':'dataset','target_id':dataset}]
  if ev in old:
   patch(ev,attrs,sources,links)
  elif ev not in records:put(rec(ev,'evaluation',get(model)['name']+': '+g['dataset'],context,sources,attrs,links,facets))
  if not rid:rid=uid('result',ev,row['metric'],row['unit'])
  status='disputed' if row.get('quarantined') else 'source_checked'
  if rid not in old and rid not in records:
   put(rec(rid,'result',row['model_name']+': '+row['metric']+' on '+g['dataset'],'Published comparison value; source checked, not independently reproduced.',sources,{'printed_value':str(row['printed_value']),'numeric_value':str(row['numeric_value']) if row['numeric_value'] is not None else None,'metric':row['metric'],'metric_direction':row['direction'],'unit':row['unit'],'uncertainty':row.get('uncertainty'),'eligible_count':None,'scored_count':None,'reported_population':g.get('population'),'source_locator':row['locator'],'source_occurrences':[{'source_id':sources[0],'locator':row['locator']}],'review':{'method':'Primary-table transcription and separate automated source review','date':DATE,'note':'Source checked does not mean experimentally reproduced.'},'missing_metadata':{'scored_count':'unreported','eligible_count':'unextracted','checkpoint_revision':'unextracted','uncertainty':'unreported' if row.get('uncertainty') is None else 'inapplicable'}},[{'relation':'evaluation','target_id':ev}],facets,status))
  elif rid in records:
   r=records[rid];assert r['attributes']['numeric_value']==str(row['numeric_value']) or float(r['attributes']['numeric_value'])==float(row['numeric_value']),rid
   occurrence={'source_id':sources[0],'locator':row['locator']}
   if occurrence not in r['attributes']['source_occurrences']:r['attributes']['source_occurrences'].append(occurrence)
  else:
   # Preserve original numbers/printed values/units. Fill reviewed direction only.
   if get(rid)['attributes']['metric_direction']=='unknown':patch(rid,{'metric_direction':row['direction']},sources);claim(rid,'attributes.metric_direction',row['direction'],sources,row['locator'])
   else:patch(rid,sources=sources)
  occurrences.append({'group_id':g['id'],'result_id':rid,'source_id':sources[0],'source_locator':row['locator'],'printed_value':row['printed_value'],'numeric_value':row['numeric_value'],'existing':rid in old,'quarantined':status=='disputed'})
  if status!='disputed':ids.append(rid)
 # Existing scalar spelling and units remain authoritative; normalized aliases
 # need an explicit future metadata correction instead of silent conversions.
 units={get(id)['attributes']['unit'] for id in ids};metrics={get(id)['attributes']['metric'] for id in ids}
 if len(units)>1 or len(metrics)>1:
  g['chart_blocked']='Historical metric/unit labels require separately reviewed normalization';return
 if len({id for id in ids if get(id)['attributes']['numeric_value'] is not None})<2:return
 panel={'id':g['id'],'title':g['title'],'protocol_id':protocol,'dataset_id':dataset,'metric':next(iter(metrics)),'unit':next(iter(units)),'direction':g['direction'],'result_ids':list(dict.fromkeys(ids)),'source_ids':sources,'source_locator':loc,'context':context,'caveats':caveats,'review':{'method':'automated_source_review','date':DATE}}
 panels.append((panel,[protocol,parent,*g.get('parent_ids',[])]))

# Raw packs are normalized separately; this script is deterministic and rerunnable.
normalized=json.loads((ROOT/'normalized.json').read_text())
for s in normalized['sources']:source(s)
for g in normalized['groups']:add_group(g)
# Original AlphaGenome comparisons are already independently source-reviewed.
by={**old,**records}
agg=collections.defaultdict(list)
for r in old.values():
 if r['kind']=='result' and r['id'].startswith('alphagenome-2026-') and r['status']=='source_checked':
  ev=old[r['links'][0]['target_id']];bid=next(l['target_id'] for l in ev['links'] if l['relation']=='benchmark');did=next(l['target_id'] for l in ev['links'] if l['relation']=='dataset')
  agg[(bid,did,r['attributes']['metric'],r['attributes']['unit'],r['attributes']['metric_direction'])].append(r)
for (bid,did,metric,unit,direction),rs in agg.items():
 if len(rs)<2:continue
 b=old[bid];loc='; '.join(r['attributes']['source_locator'] for r in rs)
 panel={'id':uid('figure',bid,metric),'title':b['name'],'protocol_id':bid,'dataset_id':did,'metric':metric,'unit':unit,'direction':direction,'result_ids':[r['id'] for r in rs],'source_ids':['source-alphagenome-nature2026-tables'],'source_locator':loc,'context':b['description'],'caveats':['This is the AlphaGenome paper\u2019s comparison. Source-checked scores are not independent reproductions.','Model inputs, training and inference budgets differ or remain partly unextracted. This figure does not establish a controlled architectural advantage.','Superseded and quarantined score conflicts are excluded; comparator-specific subsets remain separate.'],'review':{'method':'automated_source_review','date':DATE}}
 panels.append((panel,[bid]))
for p,owners in panels:
 for owner in set(owners):
  if owner in old or owner in records:
   r=get(owner);prior=overlays.get(owner,{}).get('attributes',{}).get('comparison_panels',r['attributes'].get('comparison_panels',[]))
   if not any(x['id']==p['id'] for x in prior):patch(owner,{'comparison_panels':[*prior,p]},p['source_ids'])
# Audits are facts about the search, not an upgrade of every benchmark claim.
for a in normalized['audits']:
 bid=a['benchmark_id']; attrs={k:a.get(k,[]) for k in ['review_date','status','primary_sources','inspected_locators','searched_queries','gaps','claim_scope']}
 for sid in attrs['primary_sources']:assert sid in old or sid in records, (bid,sid)
 patch(bid,{'benchmark_research':attrs},attrs['primary_sources'])
# Link new exact protocols to the same source-search receipt as their parents.
for r in list(records.values()):
 if r['kind']=='benchmark' and 'benchmark_research' not in r['attributes']:
  parent=next((l['target_id'] for l in r['links'] if l['relation'] in ['evaluates_task','part_of']),None)
  if parent:
   a=overlays.get(parent,{}).get('attributes',{}).get('benchmark_research') or get(parent)['attributes'].get('benchmark_research')
   if a:patch(r['id'],{'benchmark_research':{**a,'inspected_locators':[r['attributes']['profile']['summary_source_locator']],'primary_sources':r['source_ids']}})
output=ROOT/'integrated';output.mkdir(exist_ok=True)
for filename,values in [('records.jsonl',records.values()),('overlays.jsonl',overlays.values())]:
 (output/filename).write_text(''.join(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n' for r in sorted(values,key=lambda x:x.get('id',x.get('record_id')))))
(output/'occurrences.json').write_text(json.dumps(occurrences,indent=2))
(output/'summary.json').write_text(json.dumps({'records':dict(collections.Counter(r['kind'] for r in records.values())),'panels':len(panels),'occurrences':len(occurrences),'old_observations_reused':len({o['result_id'] for o in occurrences if o['existing']}),'blocked_groups':[g['id'] for g in normalized['groups'] if g.get('chart_blocked')],'audited_benchmarks':len(normalized['audits'])},indent=2))
print((output/'summary.json').read_text())
