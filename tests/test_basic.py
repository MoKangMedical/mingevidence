"""
MingEvidence 基础测试
"""

import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
import numpy as np


class TestPICOExtractor:
    """PICO提取器测试"""

    def test_extract_chinese(self):
        from src_py.pico_extractor import PICOExtractor
        extractor = PICOExtractor()
        pico = extractor.extract("GLP-1受体激动剂能否降低2型糖尿病患者的心血管事件风险？")
        assert pico.population != "" or pico.intervention != "" or pico.outcome != ""
        assert pico.confidence >= 0

    def test_extract_english(self):
        from src_py.pico_extractor import PICOExtractor
        extractor = PICOExtractor()
        pico = extractor.extract("Does metformin reduce mortality in patients with type 2 diabetes?")
        assert pico.confidence >= 0

    def test_to_query(self):
        from src_py.pico_extractor import PICOFramework
        pico = PICOFramework(population="diabetes", intervention="metformin", outcome="mortality")
        query = pico.to_query()
        assert "diabetes" in query
        assert "metformin" in query

    def test_is_complete(self):
        from src_py.pico_extractor import PICOFramework
        pico = PICOFramework(population="P", intervention="I", outcome="O")
        assert pico.is_complete()

        pico2 = PICOFramework(population="P")
        assert not pico2.is_complete()


class TestDataExtractor:
    """数据提取器测试"""

    def test_extract_or(self):
        from src_py.data_extractor import DataExtractor
        extractor = DataExtractor()
        text = "The odds ratio was 1.5 (95% CI: 1.2-1.8)"
        study = extractor.extract_from_text(text)
        assert len(study.effect_sizes) > 0
        assert study.effect_sizes[0].measure == "OR"

    def test_extract_rr(self):
        from src_py.data_extractor import DataExtractor
        extractor = DataExtractor()
        text = "Relative risk: 0.75 (95% CI 0.60-0.95)"
        study = extractor.extract_from_text(text)
        assert len(study.effect_sizes) > 0

    def test_2x2_table(self):
        from src_py.data_extractor import DataExtractor
        extractor = DataExtractor()
        es = extractor.extract_2x2_table(
            events_treatment=20, total_treatment=100,
            events_control=30, total_control=100
        )
        assert es.measure == "OR"
        assert es.value > 0
        assert es.ci_lower > 0
        assert es.ci_upper > 0


class TestBiasAssessor:
    """偏倚评估器测试"""

    def test_rob2_low(self):
        from src_py.bias_assessor import BiasAssessor
        assessor = BiasAssessor()
        text = "This was a randomized, double-blind, placebo-controlled trial with intention-to-treat analysis and blinded outcome assessment."
        result = assessor.assess_rob2(text, "test_study")
        assert result.overall_judgment in ("low", "some_concerns", "high", "unclear")
        assert len(result.domains) == 5

    def test_rob2_high(self):
        from src_py.bias_assessor import BiasAssessor
        assessor = BiasAssessor()
        text = "This open-label, quasi-randomized study used per-protocol analysis with self-reported outcomes and selective reporting."
        result = assessor.assess_rob2(text, "test_study")
        assert result.overall_judgment == "high"

    def test_nos(self):
        from src_py.bias_assessor import BiasAssessor
        assessor = BiasAssessor()
        text = "A population-based cohort study using medical records, adjusted for age and sex, with adequate follow-up and complete outcome assessment."
        result = assessor.assess_nos(text, "test_study")
        assert result.total_stars > 0
        assert result.quality in ("high", "moderate", "low")


class TestMetaAnalyzer:
    """Meta分析测试"""

    def test_random_effects(self):
        from src_py.meta_analyzer import MetaAnalyzer
        analyzer = MetaAnalyzer()
        studies = [
            {"study_id": "S1", "effect": 1.5, "se": 0.2},
            {"study_id": "S2", "effect": 1.3, "se": 0.3},
            {"study_id": "S3", "effect": 1.8, "se": 0.25},
        ]
        result = analyzer.run_meta_analysis(studies, measure="OR", method="random")
        assert result.n_studies == 3
        assert result.pooled_effect > 0
        assert result.ci_lower > 0
        assert result.ci_upper > 0
        assert result.heterogeneity.I_squared >= 0

    def test_fixed_effects(self):
        from src_py.meta_analyzer import MetaAnalyzer
        analyzer = MetaAnalyzer()
        studies = [
            {"study_id": "S1", "effect": 0.5, "se": 0.1},
            {"study_id": "S2", "effect": 0.6, "se": 0.15},
        ]
        result = analyzer.run_meta_analysis(studies, measure="MD", method="fixed")
        assert result.n_studies == 2
        assert result.method == "fixed"

    def test_insufficient_studies(self):
        from src_py.meta_analyzer import MetaAnalyzer
        analyzer = MetaAnalyzer()
        studies = [{"study_id": "S1", "effect": 1.5, "se": 0.2}]
        result = analyzer.run_meta_analysis(studies)
        assert result.n_studies == 1


class TestEvidenceGrader:
    """GRADE分级测试"""

    def test_high_quality_rct(self):
        from src_py.evidence_grader import EvidenceGrader
        grader = EvidenceGrader()
        result = grader.assess(
            evidence_type="rct",
            risk_of_bias="low",
            inconsistency="low",
            indirectness="low",
            imprecision="low",
            publication_bias="undetected",
        )
        assert result.final_quality == "high"
        assert result.final_score == 4

    def test_low_quality_observational(self):
        from src_py.evidence_grader import EvidenceGrader
        grader = EvidenceGrader()
        result = grader.assess(
            evidence_type="observational",
            risk_of_bias="high",
            inconsistency="high",
        )
        assert result.final_quality in ("low", "very_low")

    def test_downgrades(self):
        from src_py.evidence_grader import EvidenceGrader
        grader = EvidenceGrader()
        result = grader.assess(
            evidence_type="rct",
            risk_of_bias="high",
            inconsistency="moderate",
            i_squared=60,
            total_n=200,
            ci_crosses_null=True,
        )
        assert result.downgrades_total > 0
        assert result.final_score < 4

    def test_upgrades(self):
        from src_py.evidence_grader import EvidenceGrader
        grader = EvidenceGrader()
        result = grader.assess(
            evidence_type="observational",
            risk_of_bias="low",
            large_effect=True,
            dose_response=True,
        )
        assert result.upgrades_total == 2
        assert result.final_score > 2  # 从low升级

    def test_score_label(self):
        from src_py.evidence_grader import GRADEAssessment
        a = GRADEAssessment(final_score=4)
        assert "High" in a.score_label
        a2 = GRADEAssessment(final_score=1)
        assert "Very Low" in a2.score_label


class TestSearchEngine:
    """搜索引擎测试（不调用API）"""

    def test_build_pico_query(self):
        from src_py.search_engine import SearchEngine
        engine = SearchEngine()
        query = engine.build_pico_query(
            population="diabetes",
            intervention="metformin",
            outcome="mortality",
        )
        assert "diabetes" in query
        assert "metformin" in query
        assert "AND" in query

    def test_study_record(self):
        from src_py.search_engine import StudyRecord
        record = StudyRecord(pmid="12345", title="Test Study", year=2024)
        d = record.to_dict()
        assert d["pmid"] == "12345"
        assert d["year"] == 2024


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
