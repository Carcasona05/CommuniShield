import csv
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from audit_supporting_training import audit_rows
import build_single_words as miner
import check_supporting_validation as checker
import numpy as np


class TrainingAuditTests(unittest.TestCase):
    def test_audit_counts_single_words_and_flags_conflicts_without_relabelling(self):
        rows=[{'text':'word','language':'english','label':'negative'},
              {'text':' WORD ','language':'english','label':'neutral'},
              {'text':'a phrase','language':'english','label':'positive'}]
        result=audit_rows(rows)
        self.assertEqual(result['conflicting_keys'],1)
        self.assertEqual(result['languages']['english']['rows'],3)
        self.assertEqual(rows[0]['label'],'negative')

    def test_word_mining_reads_raw_train_only_and_maps_zero_based_rating_codes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            for split in ('train','validation','test'):
                for source in ('tweet_eval','filipino_shopee'):
                    path=root/f'{source}_{split}.csv'
                    with path.open('w',encoding='utf-8',newline='') as handle:
                        writer=csv.DictWriter(handle,fieldnames=['text','label']); writer.writeheader()
                        writer.writerows([{'text':f'{source} {i}','label':str(i)} for i in range(5)])
            original=miner.read_rows
            def guarded(path):
                self.assertNotIn('_validation',path.name)
                self.assertNotIn('_test',path.name)
                return original(path)
            with patch.object(miner,'read_rows',side_effect=guarded):
                rows=list(miner.labeled_sentences(root,root))
            filipino=[label for language,_,label in rows if language=='filipino']
            self.assertEqual(filipino,['negative','negative','neutral','positive','positive'])

    def test_validation_checker_reads_only_validation_and_detects_export_drift(self):
        rows=[{'text':str(i),'language':lang,'label':label}
              for lang in checker.LANGUAGES for label in checker.LABELS for i in range(12)]
        perfect=np.repeat(np.eye(3)*.9+.05*(1-np.eye(3)),12,axis=0)
        class Model:
            classes_=np.array(checker.LABELS)
            def predict_proba(self,texts): return perfect
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary)
            (root/'validation.csv').write_text('fixture',encoding='utf-8')
            def guarded(path):
                self.assertEqual(path.name,'validation.csv')
                return rows
            with patch.object(checker,'read_rows',side_effect=guarded), \
                 patch.object(checker.joblib,'load',return_value={'pipeline':Model(),'metadata':{}}), \
                 patch.object(checker,'probabilities',return_value=perfect):
                report=checker.check(root,root)
                self.assertTrue(report['validation_passed'])
                self.assertFalse(report['test_read'])
            with patch.object(checker,'read_rows',side_effect=guarded), \
                 patch.object(checker.joblib,'load',return_value={'pipeline':Model(),'metadata':{}}), \
                 patch.object(checker,'probabilities',return_value=np.roll(perfect,1,axis=1)):
                report=checker.check(root,root)
                self.assertFalse(report['validation_passed'])
                self.assertIn('Exported ONNX and fitted classifier disagree',report['languages']['english']['reasons'])


if __name__=='__main__': unittest.main()
