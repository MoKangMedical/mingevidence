"""
PICO要素提取器 — 从临床问题自动提取 Population/Intervention/Comparison/Outcome

支持：
- 中英文临床问题解析
- 基于规则的关键词提取
- 基于模板的PICO映射
- 与PubMed MeSH术语对齐
"""

import re
import json
import logging
import argparse
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional

logger = logging.getLogger(__name__)

# 数据目录
DATA_DIR = Path(__file__).parent.parent / "data"


@dataclass
class PICOFramework:
    """PICO框架"""
    population: str = ""       # 目标人群
    intervention: str = ""     # 干预措施
    comparison: str = ""       # 对照措施
    outcome: str = ""          # 结局指标
    study_design: str = ""     # 研究设计类型
    time_frame: str = ""       # 时间范围
    confidence: float = 0.0    # 提取置信度 0-1

    def to_dict(self) -> dict:
        return asdict(self)

    def to_query(self) -> str:
        """转换为检索式"""
        parts = []
        if self.population:
            parts.append(f"({self.population})")
        if self.intervention:
            parts.append(f"({self.intervention})")
        if self.comparison:
            parts.append(f"({self.comparison})")
        if self.outcome:
            parts.append(f"({self.outcome})")
        return " AND ".join(parts)

    def is_complete(self) -> bool:
        """PICO要素是否完整"""
        return bool(self.population and self.intervention and self.outcome)


# ── 常用医学术语映射 ─────────────────────────────────────

POPULATION_PATTERNS = {
    # 中文
    r"([\u4e00-\u9fff]+患者)": "population",
    r"([\u4e00-\u9fff]+病人)": "population",
    r"(?:对于|针对|在)([\u4e00-\u9fff]+?)(?:中|的|而言)": "population",
    r"([\u4e00-\u9fff]+综合征)": "population",
    r"([\u4e00-\u9fff]+病)": "population",
    # English
    r"(?:in|among|for)\s+(.*?)\s+(?:with|who|patients)": "population",
    r"(patients?\s+with\s+[\w\s]+)": "population",
    r"(adults?\s+with\s+[\w\s]+)": "population",
    r"(children\s+with\s+[\w\s]+)": "population",
}

INTERVENTION_PATTERNS = {
    # 中文
    r"(?:使用|给予|采用|应用|服用)([\u4e00-\u9fff\w]+?)(?:治疗|干预|后)": "intervention",
    r"([\u4e00-\u9fff]+治疗)": "intervention",
    r"([\u4e00-\u9fff]+疗法)": "intervention",
    # English
    r"(?:treated?\s+with|receiving|given|using)\s+([\w\s]+)": "intervention",
    r"([\w]+\s+therapy)": "intervention",
    r"([\w]+\s+treatment)": "intervention",
}

COMPARISON_PATTERNS = {
    # 中文
    r"(?:对比|比较|对照|vs|相比)([\u4e00-\u9fff\w]+)": "comparison",
    r"(?:与|和)([\u4e00-\u9fff]+?)(?:相比|对比|比较)": "comparison",
    # English
    r"(?:compared?\s+to|versus|vs\.?|control)\s+([\w\s]+)": "comparison",
    r"(?:placebo|sham|standard\s+care|usual\s+care)": "comparison",
}

OUTCOME_PATTERNS = {
    # 中文
    r"(?:的|其)?([\u4e00-\u9fff]*?风险)": "outcome",
    r"(?:的|其)?([\u4e00-\u9fff]*?率)": "outcome",
    r"(?:的|其)?([\u4e00-\u9fff]*?效果)": "outcome",
    r"(?:的|其)?([\u4e00-\u9fff]*?结局)": "outcome",
    # English
    r"(?:on|regarding|for)\s+(mortality|survival|efficacy|safety)": "outcome",
    r"(?:risk\s+of\s+[\w\s]+)": "outcome",
    r"(?:incidence\s+of\s+[\w\s]+)": "outcome",
}

# 研究设计类型
STUDY_DESIGNS = {
    "rct": ["随机对照", "RCT", "randomized controlled trial", "randomised"],
    "cohort": ["队列研究", "cohort study", "prospective", "retrospective"],
    "case_control": ["病例对照", "case-control", "case control"],
    "meta_analysis": ["meta分析", "meta-analysis", "systematic review", "系统综述"],
    "cross_sectional": ["横断面", "cross-sectional"],
}


class PICOExtractor:
    """PICO要素提取器"""

    def __init__(self, templates_path: Optional[str] = None):
        self.templates = self._load_templates(templates_path)

    def _load_templates(self, path: Optional[str]) -> dict:
        """加载PICO模板"""
        if path:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"加载模板失败: {e}")

        # 默认模板
        return {
            "drug_vs_placebo": {
                "pattern": "在{population}中，{intervention}对比{comparison}对{outcome}的影响",
                "keywords": ["药物", "安慰剂", "随机"]
            },
            "treatment_comparison": {
                "pattern": "{intervention}与{comparison}治疗{population}的{outcome}比较",
                "keywords": ["治疗", "对比", "效果"]
            },
            "diagnostic_accuracy": {
                "pattern": "{intervention}诊断{population}中{outcome}的准确性",
                "keywords": ["诊断", "灵敏度", "特异度"]
            },
        }

    def extract(self, question: str) -> PICOFramework:
        """
        从临床问题提取PICO要素

        Args:
            question: 临床问题文本

        Returns:
            PICOFramework 对象
        """
        pico = PICOFramework()

        # 规则提取
        pico.population = self._extract_field(question, POPULATION_PATTERNS)
        pico.intervention = self._extract_field(question, INTERVENTION_PATTERNS)
        pico.comparison = self._extract_field(question, COMPARISON_PATTERNS)
        pico.outcome = self._extract_field(question, OUTCOME_PATTERNS)

        # 研究设计识别
        pico.study_design = self._detect_study_design(question)

        # 计算置信度
        pico.confidence = self._calculate_confidence(pico)

        logger.info(f"PICO提取完成: P={pico.population}, I={pico.intervention}, "
                     f"C={pico.comparison}, O={pico.outcome}, 置信度={pico.confidence:.2f}")

        return pico

    def _extract_field(self, text: str, patterns: dict[str, str]) -> str:
        """使用正则模式提取字段"""
        for pattern, field_name in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                # 返回第一个捕获组，或整个匹配
                return (match.group(1) if match.lastindex else match.group(0)).strip()
        return ""

    def _detect_study_design(self, text: str) -> str:
        """识别研究设计类型"""
        text_lower = text.lower()
        for design, keywords in STUDY_DESIGNS.items():
            for kw in keywords:
                if kw.lower() in text_lower:
                    return design
        return ""

    def _calculate_confidence(self, pico: PICOFramework) -> float:
        """计算提取置信度"""
        score = 0.0
        weights = {"population": 0.3, "intervention": 0.3, "outcome": 0.3, "comparison": 0.1}

        if pico.population:
            score += weights["population"]
        if pico.intervention:
            score += weights["intervention"]
        if pico.outcome:
            score += weights["outcome"]
        if pico.comparison:
            score += weights["comparison"]
        if pico.study_design:
            score += 0.1  # bonus

        return min(score, 1.0)

    def extract_batch(self, questions: list[str]) -> list[PICOFramework]:
        """批量提取PICO要素"""
        return [self.extract(q) for q in questions]

    def suggest_refinements(self, pico: PICOFramework) -> list[str]:
        """建议PICO框架的改进"""
        suggestions = []
        if not pico.population:
            suggestions.append("❌ 缺少目标人群 (Population): 请明确研究对象")
        if not pico.intervention:
            suggestions.append("❌ 缺少干预措施 (Intervention): 请明确暴露/干预")
        if not pico.comparison:
            suggestions.append("⚠️ 缺少对照 (Comparison): 建议明确对照组（如安慰剂/标准治疗）")
        if not pico.outcome:
            suggestions.append("❌ 缺少结局指标 (Outcome): 请明确主要/次要结局")
        if not pico.study_design:
            suggestions.append("💡 建议明确研究设计类型（如RCT/队列研究）")
        return suggestions


def main():
    """命令行入口"""
    parser = argparse.ArgumentParser(description="MingEvidence PICO要素提取器")
    parser.add_argument("--question", "-q", required=True, help="临床问题")
    parser.add_argument("--output", "-o", default="", help="输出JSON文件路径")
    parser.add_argument("--templates", default="", help="PICO模板文件路径")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    extractor = PICOExtractor(templates_path=args.templates or None)
    pico = extractor.extract(args.question)

    print("\n📋 PICO要素提取结果:\n")
    print(f"  P (人群):   {pico.population or '未识别'}")
    print(f"  I (干预):   {pico.intervention or '未识别'}")
    print(f"  C (对照):   {pico.comparison or '未识别'}")
    print(f"  O (结局):   {pico.outcome or '未识别'}")
    print(f"  研究设计:    {pico.study_design or '未识别'}")
    print(f"  置信度:      {pico.confidence:.0%}")
    print()

    suggestions = extractor.suggest_refinements(pico)
    if suggestions:
        print("💡 改进建议:")
        for s in suggestions:
            print(f"  {s}")
        print()

    print(f"  检索式: {pico.to_query()}")

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(pico.to_dict(), f, ensure_ascii=False, indent=2)
        print(f"\n✅ 结果已保存到 {args.output}")


if __name__ == "__main__":
    main()
