"""
偏倚评估器 — 支持 ROB2 (RCT) 和 Newcastle-Ottawa (观察性研究) 自动评估

ROB2 评估域：
1. 随机化过程产生的偏倚
2. 因偏离预期干预产生的偏倚
3. 结局数据缺失导致的偏倚
4. 结局测量中的偏倚
5. 选择性报告结果的偏倚

Newcastle-Ottawa 评估域：
1. 选择性 (4星)
2. 可比性 (2星)
3. 结局 (3星)
"""

import json
import logging
import argparse
from dataclasses import dataclass, field, asdict
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"


@dataclass
class BiasDomain:
    """单个偏倚评估域"""
    name: str = ""
    name_en: str = ""
    judgment: str = ""          # low / some_concerns / high / unclear
    support_text: str = ""      # 支持判断的文本
    rationale: str = ""         # 判断理由


@dataclass
class ROB2Assessment:
    """ROB2 偏倚评估结果"""
    study_id: str = ""
    overall_judgment: str = ""  # low / some_concerns / high
    domains: list[BiasDomain] = field(default_factory=list)
    confidence: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class NOSAssessment:
    """Newcastle-Ottawa 评估结果"""
    study_id: str = ""
    total_stars: int = 0
    max_stars: int = 9
    selection_stars: int = 0    # 最高4星
    comparability_stars: int = 0  # 最高2星
    outcome_stars: int = 0      # 最高3星
    domains: list[BiasDomain] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def quality(self) -> str:
        if self.total_stars >= 7:
            return "high"
        elif self.total_stars >= 5:
            return "moderate"
        else:
            return "low"


# ── ROB2 关键词 ─────────────────────────────────────────

ROB2_KEYWORDS = {
    "randomization": {
        "low": ["random", "randomized", "随机", "computer-generated", "block randomization"],
        "high": ["quasi-random", "alternation", "hospital number", "准随机"],
        "concerns": ["insufficient information", "unclear method"],
    },
    "deviation": {
        "low": ["blinded", "double-blind", "triple-blind", "盲法", "双盲", "sham"],
        "high": ["open-label", "unblinded", "open label", "非盲", "未设盲"],
        "concerns": ["single-blind", "单盲"],
    },
    "missing_data": {
        "low": ["intention-to-treat", "ITT", "all randomized", "意向治疗", "complete follow-up"],
        "high": ["per-protocol", "PP", "大量失访", ">20% lost", "高脱落率"],
        "concerns": ["moderate loss", "部分失访"],
    },
    "measurement": {
        "low": ["objective outcome", "blinded assessor", "实验室指标", "死亡"],
        "high": ["self-reported", "主观指标", "患者报告", "unblinded assessor"],
        "concerns": ["partially blinded"],
    },
    "selection": {
        "low": ["pre-registered", "protocol available", "all outcomes reported", "预注册"],
        "high": ["selective reporting", "选择性报告", "outcome changed"],
        "concerns": ["no protocol available"],
    },
}

# ── NOS 评分关键词 ─────────────────────────────────────

NOS_KEYWORDS = {
    "representativeness": {
        "truly": ["representative", "population-based", "社区", "population"],
        "somewhat": ["selected group", "volunteers"],
        "no": ["selected", "highly selected"],
    },
    "selection_nonexposed": {
        "yes": ["same community", "same database", "同一社区"],
        "no": ["different source"],
    },
    "exposure_ascertainment": {
        "yes": ["structured interview", "medical record", "record linkage", "medical records"],
        "no": ["self-report", "self reported"],
    },
    "outcome_not_present": {
        "yes": ["no history", "disease-free", "free of outcome"],
        "no": ["not reported"],
    },
    "comparability": {
        "yes": ["adjusted", "controlled for", "matching", "调整", "匹配", "multivariable"],
        "no": ["unadjusted", "crude"],
    },
    "outcome_assessment": {
        "yes": ["independent blind", "record linkage", "medical records"],
        "no": ["self-report"],
    },
    "followup_length": {
        "yes": ["adequate follow-up", "sufficient", "≥6 months", "≥1 year"],
        "no": ["short follow-up", "insufficient"],
    },
    "followup_adequacy": {
        "yes": ["complete follow-up", "all subjects", ">90%"],
        "no": ["significant loss", "<80%"],
    },
}


class BiasAssessor:
    """偏倚评估器"""

    def __init__(self, domains_path: Optional[str] = None):
        self.domains = self._load_domains(domains_path)

    def _load_domains(self, path: Optional[str]) -> dict:
        """加载偏倚评估域配置"""
        if path:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"加载偏倚域配置失败: {e}")
        return {}

    # ── ROB2 评估 ───────────────────────────────────────────

    def assess_rob2(self, text: str, study_id: str = "") -> ROB2Assessment:
        """
        ROB2 偏倚评估

        Args:
            text: 研究描述文本（摘要/方法部分）
            study_id: 研究ID

        Returns:
            ROB2Assessment 对象
        """
        assessment = ROB2Assessment(study_id=study_id)
        text_lower = text.lower()

        domain_definitions = [
            ("随机化过程", "randomization", ROB2_KEYWORDS["randomization"]),
            ("偏离预期干预", "deviation", ROB2_KEYWORDS["deviation"]),
            ("结局数据缺失", "missing_data", ROB2_KEYWORDS["missing_data"]),
            ("结局测量", "measurement", ROB2_KEYWORDS["measurement"]),
            ("选择性报告", "selection", ROB2_KEYWORDS["selection"]),
        ]

        for name_cn, name_en, keywords in domain_definitions:
            domain = BiasDomain(name=name_cn, name_en=name_en)

            # 检查高偏倚关键词
            for kw in keywords.get("high", []):
                if kw.lower() in text_lower:
                    domain.judgment = "high"
                    domain.rationale = f"检测到高偏倚关键词: '{kw}'"
                    break

            # 检查低偏倚关键词
            if not domain.judgment:
                for kw in keywords.get("low", []):
                    if kw.lower() in text_lower:
                        domain.judgment = "low"
                        domain.rationale = f"检测到低偏倚关键词: '{kw}'"
                        break

            # 检查存在疑虑的关键词
            if not domain.judgment:
                for kw in keywords.get("concerns", []):
                    if kw.lower() in text_lower:
                        domain.judgment = "some_concerns"
                        domain.rationale = f"检测到疑虑关键词: '{kw}'"
                        break

            # 默认为 unclear
            if not domain.judgment:
                domain.judgment = "unclear"
                domain.rationale = "信息不足，无法判断"

            assessment.domains.append(domain)

        # 综合判断
        judgments = [d.judgment for d in assessment.domains]
        if judgments.count("high") > 0:
            assessment.overall_judgment = "high"
        elif judgments.count("some_concerns") > 0 or judgments.count("unclear") >= 2:
            assessment.overall_judgment = "some_concerns"
        else:
            assessment.overall_judgment = "low"

        assessment.confidence = self._rob2_confidence(assessment)
        logger.info(f"ROB2评估完成: {study_id}, 总体判断: {assessment.overall_judgment}")
        return assessment

    def _rob2_confidence(self, assessment: ROB2Assessment) -> float:
        """计算ROB2评估置信度"""
        if not assessment.domains:
            return 0.0
        clear_judgments = sum(1 for d in assessment.domains if d.judgment != "unclear")
        return clear_judgments / len(assessment.domains)

    # ── Newcastle-Ottawa 评估 ──────────────────────────────

    def assess_nos(self, text: str, study_id: str = "", study_type: str = "cohort") -> NOSAssessment:
        """
        Newcastle-Ottawa Scale 偏倚评估

        Args:
            text: 研究描述文本
            study_id: 研究ID
            study_type: 研究类型 (cohort / case_control)

        Returns:
            NOSAssessment 对象
        """
        assessment = NOSAssessment(study_id=study_id)
        text_lower = text.lower()

        # 选择 (Selection) — 最高4星
        selection_items = [
            ("representativeness", NOS_KEYWORDS["representativeness"]),
            ("selection_nonexposed", NOS_KEYWORDS["selection_nonexposed"]),
            ("exposure_ascertainment", NOS_KEYWORDS["exposure_ascertainment"]),
            ("outcome_not_present", NOS_KEYWORDS["outcome_not_present"]),
        ]

        for item_name, keywords in selection_items:
            domain = BiasDomain(name=f"选择-{item_name}")
            if any(kw.lower() in text_lower for kw in keywords.get("yes", [])):
                domain.judgment = "low"
                assessment.selection_stars += 1
            else:
                domain.judgment = "high"
            assessment.domains.append(domain)

        # 可比性 (Comparability) — 最高2星
        domain = BiasDomain(name="可比性")
        comparability_keywords = NOS_KEYWORDS["comparability"]
        matches = sum(1 for kw in comparability_keywords.get("yes", []) if kw.lower() in text_lower)
        if matches >= 2:
            domain.judgment = "low"
            assessment.comparability_stars = 2
        elif matches == 1:
            domain.judgment = "some_concerns"
            assessment.comparability_stars = 1
        else:
            domain.judgment = "high"
        assessment.domains.append(domain)

        # 结局 (Outcome) — 最高3星
        outcome_items = [
            ("outcome_assessment", NOS_KEYWORDS["outcome_assessment"]),
            ("followup_length", NOS_KEYWORDS["followup_length"]),
            ("followup_adequacy", NOS_KEYWORDS["followup_adequacy"]),
        ]

        for item_name, keywords in outcome_items:
            domain = BiasDomain(name=f"结局-{item_name}")
            if any(kw.lower() in text_lower for kw in keywords.get("yes", [])):
                domain.judgment = "low"
                assessment.outcome_stars += 1
            else:
                domain.judgment = "high"
            assessment.domains.append(domain)

        assessment.total_stars = (
            assessment.selection_stars +
            assessment.comparability_stars +
            assessment.outcome_stars
        )

        logger.info(f"NOS评估完成: {study_id}, {assessment.total_stars}/{assessment.max_stars} 星")
        return assessment

    # ── 批量评估 ────────────────────────────────────────────

    def assess_batch(
        self, studies: list[dict], study_type: str = "rct"
    ) -> list[ROB2Assessment | NOSAssessment]:
        """
        批量偏倚评估

        Args:
            studies: 研究列表, 每个包含 study_id 和 text
            study_type: 研究类型 (rct / cohort / case_control)

        Returns:
            评估结果列表
        """
        results = []
        for study in studies:
            text = study.get("text", "") or study.get("abstract", "")
            study_id = study.get("study_id", "") or study.get("pmid", "")

            if study_type == "rct":
                result = self.assess_rob2(text, study_id)
            else:
                result = self.assess_nos(text, study_id, study_type)
            results.append(result)

        return results


def main():
    """命令行入口"""
    parser = argparse.ArgumentParser(description="MingEvidence 偏倚评估器")
    parser.add_argument("--input", "-i", required=True, help="输入文件 (JSON)")
    parser.add_argument("--type", "-t", default="rct", choices=["rct", "cohort", "case_control"],
                        help="研究类型")
    parser.add_argument("--output", "-o", default="", help="输出文件路径")
    parser.add_argument("--domains", default="", help="偏倚域配置文件路径")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    assessor = BiasAssessor(domains_path=args.domains or None)

    with open(args.input, "r", encoding="utf-8") as f:
        studies = json.load(f)

    results = assessor.assess_batch(studies, args.type)

    print(f"\n📊 偏倚评估结果 ({args.type}): {len(results)} 篇研究\n")
    for result in results:
        if isinstance(result, ROB2Assessment):
            print(f"  [{result.study_id}] ROB2 总体: {result.overall_judgment}")
            for domain in result.domains:
                print(f"    {domain.name}: {domain.judgment}")
        elif isinstance(result, NOSAssessment):
            print(f"  [{result.study_id}] NOS: {result.total_stars}/{result.max_stars} 星 ({result.quality})")

    if args.output:
        output_data = [r.to_dict() for r in results]
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        print(f"\n✅ 结果已保存到 {args.output}")


if __name__ == "__main__":
    main()
