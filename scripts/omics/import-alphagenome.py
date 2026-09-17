"""Build the reviewed AlphaGenome batch from checked source transcriptions.

No network, model inference or score recomputation. Run from repository root.
The workbook cell evidence and protocol review are versioned alongside this file.
"""
import copy
import hashlib
import json
import re
from pathlib import Path

ROOT = Path('data/omics/reviews/alphagenome-2026')
TABLES = json.loads((ROOT / 'tables.json').read_text())
FETCH = json.loads((ROOT / 'retrieval.json').read_text())
PAPER = 'evidence-official-56e5abfb5f12f1cd3b20'
METHODS = 'source-alphagenome-nature2026-supplementary-methods'
WORKBOOK = 'source-alphagenome-nature2026-tables'
NOTEBOOK = 'source-alphagenome-nature2026-evaluation-notebook'
FAMILY = 'catalog-model-alphagenome'
DATE = '2026-09-17'
SOURCES = [WORKBOOK, METHODS, PAPER]
FACETS = {'areas': ['dna-genomes']}
REVIEW = {'method': 'automated_source_review', 'date': DATE,
          'note': 'Primary-source transcription and separate automated source review. No human sign-off or independent experimental reproduction.'}
records = {}
occurrences = []


def stable(prefix, identity):
    return prefix + '-' + hashlib.sha256(identity.encode()).hexdigest()[:16]


def add(id, kind, name, description, attributes=None, links=None, sources=None, status='needs_review'):
    value = dict(id=id, kind=kind, name=name, description=description, status=status,
                 facets=FACETS, source_ids=SOURCES if sources is None else sources,
                 links=links or [], attributes=attributes or {})
    if id in records and records[id] != value:
        raise ValueError('Conflicting generated identity: ' + id)
    records[id] = value
    return value


def citation(text, locator, sources=SOURCES):
    return dict(text=text, source_ids=sources, source_locator=locator)


def fact(label, value, locator, status='source_checked', sources=SOURCES):
    return dict(label=label, value=value, status=status, source_ids=sources, source_locator=locator)


def profile(summary, locator, sections, facts, gaps, diagram=None, limitations=None):
    p = dict(summary=summary, summary_source_ids=SOURCES, summary_source_locator=locator,
             sections=sections, facts=facts, strengths=[], limitations=limitations or [],
             coverage='limited', gaps=gaps, review=REVIEW)
    if diagram:
        p['diagram'] = diagram
    return p


def section(title, body, locator):
    return dict(title=title, body=body, source_ids=SOURCES, source_locator=locator)


def association(subject, relation, target, locator):
    r = records[subject]
    link = dict(relation=relation, target_id=target)
    if link not in r['links']:
        r['links'].append(link)
    return add(stable('alphagenome-association', subject+relation+target), 'claim',
               r['name'] + ': ' + relation.replace('_', ' '),
               'Primary-source identity relationship; this does not establish checkpoint equivalence across evaluations.',
               dict(field=f'links:{relation}:{target}', target_id=target,
                    source_locator=locator, review=REVIEW),
               [dict(relation='subject', target_id=subject)], status='source_checked')


methods = json.loads((ROOT / 'methods-source.json').read_text())
methods['attributes']['hash_scope'] = 'SHA-256 of exact publisher PDF bytes'
records[METHODS] = methods
for id, name, receipt, fmt, locator in [
    (WORKBOOK, 'AlphaGenome Nature 2026 supplementary comparison tables', FETCH['workbook'], 'xlsx', 'Supplementary Tables 3 and 4; all source rows'),
    (NOTEBOOK, 'AlphaGenome pinned evaluation example notebook', FETCH['notebook'], 'ipynb', 'Stored example outputs for eQTL coefficient and sign evaluation'),
]:
    add(id, 'source', name, 'Pinned primary artifact. Review is limited to the cited cells or passages.',
        dict(url=receipt['url'], artifact_url=receipt['url'], artifact_sha256=receipt['sha256'],
             retrieved_at=receipt.get('retrieved_at', FETCH['fetched_at']),
             version=receipt.get('revision', TABLES['source']['paper_version']),
             doi=TABLES['source']['paper_doi'] if id == WORKBOOK else None,
             artifact_format=fmt, hash_scope='SHA-256 of exact retrieved original artifact bytes',
             locator=locator, review_method='automated_source_review'), sources=[], status='source_checked')

# Protocol content is separately checked against the primary Methods before import.
PROTOCOL_INPUT = json.loads((ROOT / 'protocol-map.json').read_text())


def text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return ' '.join(text(v) for v in value)
    if isinstance(value, dict):
        for key in ['text', 'value', 'body', 'summary']:
            if key in value:
                return text(value[key])
    return ''


def clean(value):
    # Source cell literals are never passed through this editorial whitespace repair.
    for old, new in [('with32bp', 'with 32 bp'), ('with128bp', 'with 128 bp'),
                     ('Orca4kb', 'Orca 4 kb'), ('histoneChIP', 'histone ChIP'),
                     ('logisticregression', 'logistic regression'), ('input-gradient feature', 'input × gradient feature')]:
        value = value.replace(old, new)
    return value


def decimal_transcription(score):
    # The original OOXML decimal is retained in numeric_value and raw_xml_value.
    # General has no fixed printed precision; do not call this rendered Excel text.
    if score['number_format'] == 'General':
        return str(score['numeric_value']), 'Canonical stored-number transcription of a General-format cell; visible spreadsheet precision depends on column width.'
    return score['printed_value'], 'Workbook number format ' + score['number_format']


protocols = PROTOCOL_INPUT.get('protocols', PROTOCOL_INPUT)
for row in TABLES['rows']:
    table, index, sheet_row = row['table'], row['evaluation_index'], row['sheet_row']
    key = f'table{table}:{index}'
    p = copy.deepcopy(protocols[key])
    overrides = p.get('row_overrides', {})
    if isinstance(overrides, dict):
        p.update(overrides.get(str(sheet_row), {}))
    subset = f'-row{sheet_row}' if table == 4 and index == 9 else ''
    protocol_id = f'alphagenome-2026-t{table}-protocol-{index}{subset}'
    dataset_id = protocol_id.replace('-protocol-', '-dataset-')
    locator = '; '.join([row['row_locator'], *row['protocol_source_locators']])
    name = text(p.get('name')) or text(p.get('title')) or row['eval_name'].replace('_', ' ')
    if subset:
        name += ' (' + row['comparator']['model_reported'].strip() + '-matched comparison)'
    fields = p.get('fields', {})
    question = text(fields.get('biological_question')) or f"{row['modality']} evaluation reported in the AlphaGenome paper."
    procedure = text(fields.get('procedure')) or ' '.join(row['protocol_notes'])
    dataset = text(fields.get('dataset')) or row['dataset_printed']
    split = text(fields.get('split')) or row['split']
    inputs = text(fields.get('inputs')) or 'See the source Methods for model-specific input information.'
    aggregation = text(fields.get('aggregation')) or row['metric_printed']
    limitations = text(fields.get('limitations')) or 'Per-score uncertainty and prediction coverage are not supplied in the summary table.'
    config = clean(row['alphagenome']['configuration'])
    config_context = text(p.get('configuration_name'))
    pipeline = table == 4 and row.get('zero_shot_printed') is False
    config_identity = text(p.get('configuration_key')) + '|' + config
    model_id = stable('alphagenome-2026-model', config_identity)
    metrics = sorted(set(r['metric_printed'] for r in TABLES['rows'] if r['table'] == table and r['evaluation_index'] == index))
    table_rows = [r for r in TABLES['rows'] if r['table'] == table and r['evaluation_index'] == index and (not subset or r['sheet_row'] == sheet_row)]
    protocol_locator = '; '.join(dict.fromkeys([r['row_locator'] for r in table_rows] + row['protocol_source_locators'] + [e['source'] + ': ' + e['locator'] for f in fields.values() for e in f.get('evidence', [])]))
    quarantine = row['publication_status'].startswith('quarantine')
    gaps = ['Exact checkpoint artifact identity is not established by this table.',
            'Summary-table scores have no reported uncertainty interval or per-cell scored count.']
    if model_id not in records:
        model_profile = profile(
            config + '. This is the configuration evaluated in the Nature paper, not an identification of the current hosted API revision.',
            locator,
            [section('Evaluated configuration', config_context + ' ' + procedure, locator)],
            [fact('Evaluated system', config, locator),
             fact('Checkpoint artifact', 'Not established for these paper scores; no released checkpoint is inferred.', locator, 'unextracted'),
             fact('Evaluation scope', 'Supervised downstream pipeline' if pipeline else 'Paper-evaluated AlphaGenome configuration', locator)],
            gaps,
            limitations=[citation('The publication result does not establish equivalence to another checkpoint or hosted service.', locator)])
        add(model_id, 'model', config, model_profile['summary'],
            dict(entity_level='method', configuration_type='pipeline' if pipeline else 'paper_evaluation', version=config, profile=model_profile))
        association(model_id, 'uses_model' if pipeline else 'family', FAMILY, locator)
    if protocol_id not in records:
        diagram_steps = p.get('diagram', {}).get('steps') or ['Prepare the source dataset', 'Apply the reported split', 'Predict with each specified configuration', 'Score using the reported metric']
        if not isinstance(diagram_steps, list):
            diagram_steps = ['Prepare the source dataset', 'Apply the reported split', 'Predict', 'Score']
        diag = dict(title=name + ': evaluation procedure', steps=[text(s) for s in diagram_steps],
                    caption='Conceptual summary of the cited procedure; model-specific conditions are given below.',
                    source_ids=SOURCES, source_locator=protocol_locator)
        bench_profile = profile(question, protocol_locator,
            [section('What is tested', question, protocol_locator),
             section('Procedure', procedure, protocol_locator)],
            [fact('Dataset and biological context', dataset, protocol_locator),
             fact('Split', split, protocol_locator),
             fact('Allowed inputs and adaptation', inputs, protocol_locator),
             fact('Metrics as reported', '; '.join(metrics), protocol_locator),
             fact('Aggregation', aggregation, protocol_locator),
             fact('Uncertainty', 'Not reported for these summary-table scores.', protocol_locator, 'unreported')],
            ['Per-score uncertainty, exact checkpoint hashes and scoring-failure counts are not resolved by this summary-table collection.', *p.get('unknowns', [])], diag,
            [citation(limitations, protocol_locator), citation('This is an author-reported protocol, not a rewire rerun. Different datasets, processing and adaptations cannot support an unrestricted leaderboard.', protocol_locator)])
        if quarantine:
            bench_profile['limitations'].append(citation('Primary artifact values differ and their evaluation equivalence is unresolved. The affected comparison is withheld from published result tables.', protocol_locator))
        add(protocol_id, 'benchmark', name + ' (AlphaGenome paper)', question,
            dict(entity_level='protocol', version=TABLES['source']['paper_version'],
                 source_evaluation_index=index, source_table=table, profile=bench_profile,
                 reference_levels=[dict(metric=r['metric_printed'], printed_value=r['random_reference']['cell']['printed_value'], numeric_value=r['random_reference']['cell']['raw_xml_value'], source_locator=r['sheet']+'!'+r['random_reference']['cell']['cell'], note='Source reference quantity for relative-performance calculation, not a measured baseline run.') for r in table_rows]))
        add(dataset_id, 'dataset', name + ': evaluated data subset', dataset,
            dict(entity_level='evaluation_subset', source_dataset_label=row['dataset_printed'],
                 source_subset_scope=split, exact_manifest=None, reported_dataset_counts=row['reported_dataset_counts'],
                 missing_metadata={'split_manifest': 'unextracted', 'per_score_denominator': 'unextracted'}),
            [dict(relation='benchmark', target_id=protocol_id)])
    for role in ['alphagenome', 'comparator']:
        item = row[role]
        if role == 'alphagenome':
            evaluated_model = model_id
            version = config
        else:
            reported = item['model_reported'].strip()
            # A paper-reported baseline configuration; no matching public checkpoint is inferred.
            comparator_key = f'{table}|{reported}' + (f'|supervised-{index}' if pipeline else '')
            evaluated_model = stable('alphagenome-2026-comparator', comparator_key)
            adaptation = ({6: 'retrained AbSplice', 10: 'multimodal features + LASSO', 12: 'variant scores + random forest', 16: 'ENCODE-rE2G extended logistic regression'}.get(index, '') if pipeline else '')
            version = reported + (': ' + adaptation if adaptation else '') + f' (paper Table {table})'
            if evaluated_model not in records:
                cp = profile(
                    version + '. A comparator reported by the AlphaGenome authors; protocol pages specify the dataset and adaptation.',
                    locator, [section('How this comparator was evaluated', 'The source table identifies '+reported+'. '+procedure, locator)],
                    [fact('Reported method', reported, locator), fact('Exact checkpoint', 'Not established by the summary table; inspect the protocol and original implementation.', locator, 'unextracted')],
                    ['Checkpoint hashes, training provenance and model-specific inference budgets have not been fully extracted for this comparison configuration.'],
                    limitations=[citation('A table label does not establish identity with any other catalogue configuration bearing the same name.', locator)])
                add(evaluated_model, 'model', version, cp['summary'], dict(entity_level='method', configuration_type='pipeline' if pipeline else 'reported_configuration', version=version, profile=cp))
        eval_id = stable('alphagenome-2026-evaluation', protocol_id+'|'+evaluated_model)
        if eval_id not in records:
            add(eval_id, 'evaluation', version + ': ' + name, procedure,
                dict(origin='author_reported', protocol=procedure, version=version,
                     source_evaluation_index=index, source_table=table,
                     comparison=dict(protocol_id=protocol_id, dataset_version=None, split=split,
                                     population=dataset, inputs=None, adaptation=version,
                                     metric_implementation=None, aggregation=aggregation, budget=None),
                     context=dict(allowed_inputs=inputs, limitations=limitations),
                     missing_metadata={'dataset_version': 'unextracted', 'exact_input_manifest': 'unextracted', 'inference_budget': 'unreported', 'scoring_failures': 'unreported'}),
                [dict(relation='model',target_id=evaluated_model), dict(relation='benchmark',target_id=protocol_id), dict(relation='dataset',target_id=dataset_id)])
        score = item['score']
        result_id = stable('alphagenome-2026-result', eval_id+'|'+row['metric_printed']+'|'+str(row['resolution_printed']))
        printed, basis = decimal_transcription(score)
        if result_id in records:
            existing = records[result_id]
            assert existing['attributes']['numeric_value'] == score['raw_xml_value'], 'Conflicting duplicate score'
            assert existing['attributes']['printed_value'] == printed, 'Conflicting duplicate display'
            existing['attributes']['source_cells'].append(item['evidence_locator'])
            existing['attributes']['source_locator'] = '; '.join(existing['attributes']['source_cells'])
        else:
            add(result_id, 'result', version + ': ' + name + ', ' + row['metric_printed'].replace('_', ' '),
                'Author-reported result transcribed from the complete comparison table. Source checked; not independently reproduced.',
                dict(printed_value=printed, printed_value_basis=basis, numeric_value=score['raw_xml_value'], raw_xml_value=score['raw_xml_value'],
                     workbook_number_format=score['number_format'], metric=row['metric_printed'],
                     metric_direction='lower' if row['direction'].startswith('lower') else 'higher',
                     unit='correlation' if 'pearson' in row['metric_printed'].lower() or 'spearman' in row['metric_printed'].lower() else 'dimensionless',
                     aggregation=aggregation, uncertainty=None, scored_count=None, eligible_count=None,
                     source_cells=[item['evidence_locator']], source_locator=item['evidence_locator'],
                     review=dict(method='OOXML extraction and separate automated primary-source review', date=DATE,
                                 artifact_sha256=TABLES['source']['workbook_sha256'], retrieval_url=TABLES['source']['workbook_url'],
                                 note='Checked against a second extraction. Fixed-format display and exact stored decimals preserved separately. No experiment rerun.'),
                     missing_metadata={'uncertainty': 'unreported', 'scored_count': 'unextracted', 'eligible_count': 'unextracted', 'seeds': 'unreported'},
                     source_warnings=row['warnings']),
                [dict(relation='evaluation', target_id=eval_id)], [WORKBOOK],
                status='disputed' if quarantine else 'source_checked')
        occurrences.append(dict(source_row_id=row['batch_row_id'], role=role, result_id=result_id, source_cell=item['evidence_locator'],
                                raw_xml_value=score['raw_xml_value'], printed_value=printed, disposition='quarantined' if quarantine else 'published'))

output = Path('data/omics/reviewed/alphagenome-2026.jsonl')
output.write_text(''.join(json.dumps(v, ensure_ascii=False, separators=(',', ':'))+'\n' for k,v in sorted(records.items())))
receipt = dict(review_date=DATE, review_method=REVIEW['note'], source_sha256=TABLES['source']['workbook_sha256'],
               comparison_rows=len(TABLES['rows']), source_score_cell_occurrences=len(occurrences),
               unique_results=sum(r['kind']=='result' for r in records.values()),
               published_results=sum(r['kind']=='result' and r['status']=='source_checked' for r in records.values()),
               quarantined_results=sum(r['kind']=='result' and r['status']=='disputed' for r in records.values()),
               records_sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
               extraction_inputs={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(ROOT.glob('*.json'))},
               occurrences=occurrences)
Path('data/omics/reviews/2026-09-17-alphagenome-results.json').write_text(json.dumps(receipt,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k not in ['occurrences','extraction_inputs']},indent=2))
