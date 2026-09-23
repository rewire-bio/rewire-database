import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('review_runs', Path(__file__).parents[1] / 'review-submitted-runs.py')
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


class SubmittedRunReviewTests(unittest.TestCase):
    def fixture(self):
        entry = {
            'protocol_id': 'mfass-v2', 'protocol_version': 'revision', 'dataset_id': 'mfass-assay-pairs-v2',
            'scope': 'full', 'completion': 'complete', 'coverage': {'denominator': 8324, 'scored': 8324, 'unscored': 0},
            'predictions_sha256': 'a' * 64, 'prepared_sha256': 'b' * 64, 'model_name': 'Training prior',
            'metrics': {'auroc': 0.5, 'average_precision_sklearn': 315 / 8324}, 'metric_path': ['metrics'],
            'data_verification': 'pinned_source_bytes', 'audit_run': None,
        }
        report = {k: copy.deepcopy(v) for k, v in entry.items() if k not in ['model_name', 'metric_path', 'audit_run']}
        report['model'] = {'name': entry['model_name']}
        report['independently_reproduced'] = False
        return entry, {'report': report, 'bundle': copy.deepcopy(report), 'audit': {'checks': {'metrics': True}}}

    def test_valid_bound_artifacts(self):
        entry, docs = self.fixture()
        review.validate_artifacts(entry, docs)

    def test_rejects_changed_metrics_and_run_identities(self):
        for key, value in [('predictions_sha256', 'c' * 64), ('dataset_id', 'another'),
                           ('metrics', {'auroc': 0.7})]:
            with self.subTest(key=key):
                entry, docs = self.fixture()
                docs['bundle'][key] = value
                with self.assertRaises(ValueError):
                    review.validate_artifacts(entry, docs)

    def test_rejects_empty_or_failed_audit(self):
        for checks in [{}, [], {'metrics': False}, [{'status': 'failed'}]]:
            entry, docs = self.fixture()
            docs['audit']['checks'] = checks
            with self.assertRaises(ValueError):
                review.validate_artifacts(entry, docs)

    def test_rejects_paper_reproduction_and_full_proteingym_claims(self):
        entry, docs = self.fixture()
        docs['bundle']['independently_reproduced'] = True
        with self.assertRaises(ValueError):
            review.validate_artifacts(entry, docs)
        entry, docs = self.fixture()
        for obj in [entry, docs['report'], docs['bundle']]:
            obj['protocol_id'] = 'proteingym-v1.3-dms-substitutions'
        with self.assertRaisesRegex(ValueError, 'not a full track'):
            review.validate_artifacts(entry, docs)

    def test_rejects_unpinned_or_external_source_before_fetch(self):
        for url in ['https://example.org/private.json',
                    'https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/main/research/report.json',
                    'https://raw.githubusercontent.com/rewire-bio/rewire-benchmarks/' + 'a' * 40 + '/research/../private.json']:
            with self.assertRaisesRegex(ValueError, 'Unpinned'):
                review.load_artifacts({'artifacts': {'report': {'url': url}}})

    def test_reaudit_binds_prediction_and_metrics(self):
        entry, docs = self.fixture()
        docs['audit'] = {'metrics': entry['metrics'], 'prediction_digest_verification': 'passed',
                         'prepared_and_code_binding': 'passed', 'predictions_sha256': entry['predictions_sha256'],
                         'prepared_sha256': entry['prepared_sha256'], 'code_hash_start': 'code', 'code_hash_end': 'code'}
        review.validate_artifacts(entry, docs)
        docs['audit']['predictions_sha256'] = 'other'
        with self.assertRaisesRegex(ValueError, 'identity'):
            review.validate_artifacts(entry, docs)


if __name__ == '__main__':
    unittest.main()
