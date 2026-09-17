import sys, gzip
import json,pathlib,collections,hashlib,re,copy
R=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'workbench/benchmark-evidence-rebuild');base=json.loads((R/'baseline-catalogue.json').read_text()) if (R/'baseline-catalogue.json').exists() else json.loads(json.loads(gzip.decompress(pathlib.Path('data/omics/releases/2026-09-17-a757f4af4277.bundle.json.gz').read_bytes()))['catalogue.json']);old={r['id']:r for r in base['records']};sources={};groups=[];audits=[]
def put_source(s):
 sid=s.get('id') or s.get('source_id');s={**s,'id':sid}
 if 'attributes' not in s:
  s['artifact_sha256']=s.get('artifact_sha256') or s.get('sha256');s['title']=s.get('title') or s.get('verified_title') or s.get('name');s['version']=s.get('version') or 'Retrieved primary source, 2026-09-17'
 sources[sid]=s

def reconcile(g):
 existing=[old[r['existing_result_ids'][0]] for r in g['rows'] if r.get('existing_result_ids')]
 if existing:
  metrics={r['attributes']['metric'] for r in existing};units={r['attributes']['unit'] for r in existing}
  if len(metrics)==len(units)==1:
   metric=next(iter(metrics));unit=next(iter(units))
   # Alias the exact same source column to its preserved historical label.
   for r in g['rows']:
    r['source_metric_label']=r['metric'];r['metric']=metric
    if r['unit']==unit or {r['unit'],unit} <= {'unitless','dimensionless','fraction','correlation'} or {r['unit'],unit} <= {'percent','%'}:r['unit']=unit
   g['metric']=metric
 groups.append(g)

# Part1 common row-oriented source tables.
p1=json.load(open(R/'part-1/extracted-batches.json'))
for b in p1['batches']:
 for s in b['source_receipts']:put_source(s)
 for cg in b['chart_groups']:
  rows=[]
  for r in b['results']:
   if r['chart_group_id']!=cg['id']:continue
   rows.append({**r,'locator':r['source_locator'],'printed_value':r.get('source_printed_cell',r['printed_value']),'numeric_value':None if r['numeric_value'] is None else str(r['numeric_value']), 'display_name':r['model_name']+(' (no pretraining)' if r['configuration'].startswith('No pretraining') else ' (pretrained)' if r['configuration'].startswith('Self-supervised') else '')+(' · '+r['configuration'].split('learning rate ')[-1] if 'learning rate ' in r['configuration'] else ''), 'quarantined':r.get('status')=='disputed'})
  reconcile({'id':cg['id'],'title':cg['title'],'benchmark_id':cg['benchmark_id'],'parent_ids':([cg['suite_id']] if cg.get('suite_id') else [])+b.get('related_broad_task_ids',[]),'sources':[cg['source_id']],'locator':b.get('table_title','Comparison table')+'; '+('; '.join(r['locator'] for r in rows)),'dataset':cg['dataset'],'split':cg['split'],'context':cg['split'],'metric':cg['metric'],'direction':cg['direction'],'population':{'count':cg['population_count'],'unit':cg['population_count_unit']} if cg.get('population_count') else None,'caveats':[cg['compatibility']],'rows':rows,'study_label':b['batch_id'],'reuse_protocol':b['batch_id']=='tape-2019-table2'})
# Part2 papers and MassSpecGym structured tables.
p2=json.load(open(R/'part-2/extracted-batches.json'))
for s in p2.get('sources',[]):put_source(s)
for b in p2['batches']:
 put_source(b['source']);grouped=collections.defaultdict(list)
 for r in b['rows']:
  for c in r['cells']:
   if 'unit' not in c:
    template=next(cell for rr in b['rows'] for cell in rr['cells'] if cell['metric']==c['metric'] and 'unit' in cell)
    c={**c,'unit':template['unit'],'direction':template['direction']}
   c={**c,'unit':c.get('unit') or 'unresolved'}
   grouped[(r['subset'],c['metric'],c['unit'],c['direction'])].append({**c,'model_name':r['model_name'],'configuration':r['configuration'],'origin':{'quoted_from_another_source':'paper_compilation'}.get(r.get('origin'),r.get('origin','author_reported')),'display_name':r['model_name']+(' ('+r['subset']+')' if r['subset'] in ['main','formula'] else ''),'quarantined':'quarantin' in c.get('review_status','') or c.get('status')=='disputed','existing_result_ids':c.get('existing_result_ids',[])})
 for (subset,metric,unit,direction),rows in grouped.items():
  gid=b['batch_id']+'-'+hashlib.sha256((subset+'|'+metric).encode()).hexdigest()[:10]
  dataset=b['dataset']['name'] if 'name' in b['dataset'] else 'MassSpecGym'
  dataset+=' · '+subset if subset in ['main','formula'] else ''
  parent=b['benchmark_ids'][-1]
  caveats=b.get('caveats') or [*(b.get('comparison_policy',{}).get('caveats',[]) if isinstance(b.get('comparison_policy'),dict) else [b['comparison_policy']] if b.get('comparison_policy') else []), *([b['uncertainty_missing']] if b.get('uncertainty_missing') else [])]
  context=b['procedure']+' '+b['dataset']['split']
  reconcile({'id':gid,'title':dataset+' · '+b['table'],'benchmark_id':parent,'parent_ids':b['benchmark_ids'][:-1],'sources':[b['source']['id']],'locator':b['table']+': '+metric+', '+subset,'dataset':dataset,'split':b['dataset']['split'],'subset':subset,'context':context,'metric':metric,'direction':direction,'population':None,'caveats':caveats,'rows':rows,'study_label':b['source']['id'],'aggregation':b.get('aggregation')})
# Part3 GlycanML only: all table cells including explicitly marked copies.
p3=json.load(open(R/'part-3/extracted-batches.json'))
for s in p3.get('source_receipts',[]):put_source(s)
for b in p3['batches']:
 if not b['id'].startswith('glycanml-'):continue
 for cg in b['chart_groups']:
  assert len(cg['column_keys'])==1
  col=next(c for c in b['columns'] if c['key']==cg['column_keys'][0]);rows=[]
  if col['key']=='Mean Acc':col={**col,'dataset':'SugarBase taxonomy'}
  for i in cg['row_indices']:
   r=b['rows'][i];c=r['cells'][col['key']];config=r['configuration']
   if isinstance(config,dict):
    identity=[b['source_id'],config['backbone'],config['adaptation']]
    config='Backbone: '+config['backbone']+'; adaptation: '+config['adaptation']+'.'
   else:identity=[b['source_id'],r['model_label'],'Single-Task']
   rows.append({'model_name':r['model_label'],'display_name':r['model_label'],'configuration':config,'identity_key':identity,'metric':col['metric'],'unit':col['unit'],'direction':col['direction'],'printed_value':c['printed'],'numeric_value':str(c['value']),'uncertainty':c['uncertainty'],'origin':'author_reported','locator':r['source_locator']+', column '+col['printed_header'],'existing_result_ids':[]})
  dataset=col['dataset']+' · '+col['key']
  # Both tables share the same exact held-out protocol; adaptation belongs to model configurations.
  split=b['protocol']['dataset_split']
  if 'taxonomy' in col['dataset'].lower() or col['key']=='Mean Acc':split='SugarBase taxonomy: motif-frequency K-means cluster allocation 8:1:1.'
  reconcile({'id':cg['id'],'title':'GlycanML '+col['printed_header']+' · '+b['table_locator'],'benchmark_id':col['benchmark_id'],'parent_ids':['discovery-benchmark-glycanml'],'sources':[b['source_id']],'locator':b['table_locator']+', '+col['printed_header'],'dataset':dataset,'split':split,'context':cg['comparison_scope']+' '+split,'metric':col['metric'],'direction':col['direction'],'population':{'train_validation_test':col.get('counts_train_validation_test'),'note':'Dataset split sizes, not per-model scored counts.'},'aggregation':b['protocol']['aggregation'],'caveats':b['caveats'],'rows':rows,'study_label':'GlycanML'})
# Current audits plus all primary source receipts. Keep only used sources later.
for f in [R/'root-audit.jsonl',*[R/f'part-{n}/audit.jsonl' for n in [1,2,3]]]:
 if f.exists():audits += [json.loads(l) for l in f.read_text().splitlines() if l]
for f in [R/f'part-{n}/audit-sources.json' for n in [1,2,3]]:
 if f.exists():
  d=json.load(open(f));
  for s in (d if isinstance(d,list) else d.get('sources',[])):put_source(s)
# Normalize heterogeneous search receipt shapes into the public audit fields.
for audit in audits:
 queries=[]
 for query in audit.get('searched_queries',[]):
  if isinstance(query,str):queries.append(query)
  elif isinstance(query,dict):
   if isinstance(query.get('query'),str):queries.append(query['query'])
   queries.extend(q for q in query.get('queries',[]) if isinstance(q,str))
 audit['searched_queries']=list(dict.fromkeys(queries))
 if not isinstance(audit.get('claim_scope'),str):audit['claim_scope']='Primary-paper discovery and source inspection. Source-checked results are not independently reproduced experiments.'

# Reuse each verified table-row identity across all of its metric columns.
# TAPE's original Table 2 rows identify representation methods across its five
# tasks. Reuse verified historical method IDs, not checkpoint-level identities.
tape_models={}
for g in groups:
 if not g['id'].startswith('tape-2019-'):continue
 for r in g['rows']:
  if r.get('existing_result_ids'):
   prior=old[r['existing_result_ids'][0]];ev=old[prior['links'][0]['target_id']]
   tape_models[(r['model_name'],r['configuration'])]=next(l['target_id'] for l in ev['links'] if l['relation']=='model')
for g in groups:
 if g['id'].startswith('tape-2019-'):
  for r in g['rows']:
   model=tape_models.get((r['model_name'],r['configuration']))
   if model:r['existing_model_id']=model
cohorts=collections.defaultdict(list)
for g in groups:
 key=json.dumps([g['sources'][0],g['benchmark_id'],g['dataset'],g['split'],g.get('subset','')])
 cohorts[key].append(g)
for cohort in cohorts.values():
 identities={};dataset_id=None
 for g in cohort:
  for r in g['rows']:
   if r.get('existing_result_ids'):
    result=old[r['existing_result_ids'][0]];ev=old[result['links'][0]['target_id']]
    model=next(l['target_id'] for l in ev['links'] if l['relation']=='model')
    dataset_id=dataset_id or next(l['target_id'] for l in ev['links'] if l['relation']=='dataset')
    identities[json.dumps([r['model_name'],r['configuration']],sort_keys=True)]=(model,ev['id'])
 for g in cohort:
  g['existing_dataset_id']=dataset_id
  for r in g['rows']:
   identity=identities.get(json.dumps([r['model_name'],r['configuration']],sort_keys=True))
   if identity:r['existing_model_id'],r['existing_evaluation_id']=identity
json.dump({'sources':list(sources.values()),'groups':groups,'audits':audits},open(R/'normalized.json','w'),indent=2,ensure_ascii=False)
print(len(groups),'groups',sum(len(g['rows']) for g in groups),'cells',len(audits),'audits')
