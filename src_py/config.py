"""
MingEvidence 配置管理模块 — 系统配置、用户偏好、证据标准参数管理

支持：
- 多级配置（系统/用户/项目）
- 证据评级标准配置（GRADE、牛津CEBM）
- 数据库和API连接配置
- 导出格式和模板配置
"""

import json
import os
import logging
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any
from pathlib import Path

logger = logging.getLogger(__name__)

# 默认配置路径
DEFAULT_CONFIG_PATH = os.path.expanduser("~/.mingevidence/config.json")

# GRADE 证据等级定义
GRADE_LEVELS = {
    "high": {"score": 4, "label": "高", "description": "非常确信效应估计值接近真实值"},
    "moderate": {"score": 3, "label": "中", "description": "效应估计值可能接近真实值，但可能存在显著差异"},
    "low": {"score": 2, "label": "低", "description": "对效应估计值的信心有限，真实值可能与估计值显著不同"},
    "very_low": {"score": 1, "label": "极低", "description": "对效应估计值几乎没有信心，真实值可能与估计值完全不同"},
}

# 牛津CEBM证据等级
OXFORD_LEVELS = {
    "1a": "同质RCT的系统综述",
    "1b": "单个RCT（窄CI）",
    "1c": "全或无证据",
    "2a": "同质队列研究的系统综述",
    "2b": "单个队列研究/低质量RCT",
    "2c": "结局研究/生态学研究",
    "3a": "同质病例对照研究的系统综述",
    "3b": "单个病例对照研究",
    "4": "病例系列/低质量队列/病例对照研究",
    "5": "专家意见（无严格评价）",
}

# 偏倚风险评估域
ROB_DOMAINS = [
    "randomization_process",
    "deviations_from_intervention",
    "missing_outcome_data",
    "measurement_of_outcome",
    "selection_of_reported_result",
]

# Meta分析默认参数
META_ANALYSIS_DEFAULTS = {
    "model": "random_effects",  # fixed_effects / random_effects
    "method": "REML",  # REML / DerSimonian-Laird / Mantel-Haenszel
    "effect_measure": "OR",  # OR / RR / RD / HR / MD / SMD
    "confidence_level": 0.95,
    "heterogeneity_test": True,
    "publication_bias_test": True,
    "funnel_plot": True,
    "forest_plot": True,
    "sensitivity_analysis": True,
}


@dataclass
class DatabaseConfig:
    """数据库配置"""
    host: str = "localhost"
    port: int = 5432
    database: str = "mingevidence"
    username: str = ""
    password: str = ""
    pool_size: int = 10

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class APIConfig:
    """API服务配置"""
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    cors_origins: List[str] = field(default_factory=lambda: ["*"])
    rate_limit: str = "100/minute"
    auth_enabled: bool = True
    jwt_secret: str = "change-me-in-production"
    jwt_expire_hours: int = 24

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ExportConfig:
    """导出配置"""
    default_format: str = "docx"  # docx / pdf / html / json
    include_prisma: bool = True
    include_forest_plot: bool = True
    include_funnel_plot: bool = True
    include_summary_table: bool = True
    include_quality_assessment: bool = True
    template_dir: str = "./templates"
    output_dir: str = "./output"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class EvidenceConfig:
    """证据评估配置"""
    grading_system: str = "GRADE"  # GRADE / Oxford_CEBM
    default_effect_measure: str = "OR"
    confidence_level: float = 0.95
    min_studies_for_meta: int = 2
    heterogeneity_threshold_i2: float = 50.0  # I² > 50% 视为高异质性
    publication_bias_tests: List[str] = field(
        default_factory=lambda: ["egger", "begg", "trim_and_fill"]
    )
    sensitivity_excludes: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class SearchConfig:
    """检索配置"""
    databases: List[str] = field(
        default_factory=lambda: ["pubmed", "cochrane", "embase", "cnki"]
    )
    max_results_per_db: int = 1000
    deduplication: bool = True
    auto_translate_cn: bool = True
    date_range_years: int = 10
    language_filter: List[str] = field(default_factory=lambda: ["en", "zh"])

    def to_dict(self) -> dict:
        return asdict(self)


class ConfigManager:
    """配置管理器 — 统一管理系统、用户和项目级配置"""

    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or DEFAULT_CONFIG_PATH
        self.database = DatabaseConfig()
        self.api = APIConfig()
        self.export = ExportConfig()
        self.evidence = EvidenceConfig()
        self.search = SearchConfig()
        self.meta_defaults = META_ANALYSIS_DEFAULTS.copy()
        self._load_config()

    def _load_config(self):
        """加载配置文件"""
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if "database" in data:
                    self.database = DatabaseConfig(**data["database"])
                if "api" in data:
                    self.api = APIConfig(**data["api"])
                if "export" in data:
                    self.export = ExportConfig(**data["export"])
                if "evidence" in data:
                    self.evidence = EvidenceConfig(**data["evidence"])
                if "search" in data:
                    self.search = SearchConfig(**data["search"])
                if "meta_defaults" in data:
                    self.meta_defaults.update(data["meta_defaults"])
                logger.info(f"Loaded config from {self.config_path}")
            except Exception as e:
                logger.warning(f"Failed to load config: {e}, using defaults")

    def save_config(self):
        """保存配置到文件"""
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        data = {
            "database": self.database.to_dict(),
            "api": self.api.to_dict(),
            "export": self.export.to_dict(),
            "evidence": self.evidence.to_dict(),
            "search": self.search.to_dict(),
            "meta_defaults": self.meta_defaults,
        }
        with open(self.config_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logger.info(f"Saved config to {self.config_path}")

    def get_grade_description(self, level: str) -> Optional[Dict]:
        """获取GRADE等级描述"""
        return GRADE_LEVELS.get(level)

    def get_oxford_description(self, level: str) -> Optional[str]:
        """获取牛津CEBM等级描述"""
        return OXFORD_LEVELS.get(level)

    def validate_config(self) -> List[str]:
        """验证配置有效性"""
        errors = []
        if self.evidence.confidence_level <= 0 or self.evidence.confidence_level >= 1:
            errors.append("confidence_level must be between 0 and 1")
        if self.evidence.min_studies_for_meta < 2:
            errors.append("min_studies_for_meta must be >= 2")
        if self.evidence.grading_system not in ("GRADE", "Oxford_CEBM"):
            errors.append("grading_system must be GRADE or Oxford_CEBM")
        if self.api.port < 1 or self.api.port > 65535:
            errors.append("API port must be between 1 and 65535")
        return errors

    def to_dict(self) -> Dict[str, Any]:
        """导出全部配置"""
        return {
            "database": self.database.to_dict(),
            "api": self.api.to_dict(),
            "export": self.export.to_dict(),
            "evidence": self.evidence.to_dict(),
            "search": self.search.to_dict(),
            "meta_defaults": self.meta_defaults,
            "grade_levels": GRADE_LEVELS,
            "oxford_levels": OXFORD_LEVELS,
        }

    def __repr__(self):
        return f"ConfigManager(path={self.config_path}, grading={self.evidence.grading_system})"
