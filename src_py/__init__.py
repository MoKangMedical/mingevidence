"""
MingEvidence — 医学证据挖掘引擎

从海量文献中精准提取临床证据，支持：
- PubMed / Cochrane 文献检索
- PICO要素自动提取
- 效应量数据提取
- ROB2 / Newcastle-Ottawa 偏倚评估
- 随机效应/固定效应 Meta分析
- GRADE 证据质量分级
"""

__version__ = "0.1.0"
__author__ = "MoKangMedical"

from .search_engine import SearchEngine
from .pico_extractor import PICOExtractor
from .data_extractor import DataExtractor
from .bias_assessor import BiasAssessor
from .meta_analyzer import MetaAnalyzer
from .evidence_grader import EvidenceGrader

__all__ = [
    "SearchEngine",
    "PICOExtractor",
    "DataExtractor",
    "BiasAssessor",
    "MetaAnalyzer",
    "EvidenceGrader",
]
