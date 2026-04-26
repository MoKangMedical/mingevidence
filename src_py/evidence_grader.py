"""
GRADE证据质量分级器

基于 GRADE (Grading of Recommendations Assessment, Development and Evaluation) 框架，
从五大维度评估证据质量：

降级因素：
1. 偏倚风险 (Risk of Bias)
2. 不一致性 (Inconsistency) — I² > 50%
3. 不精确性 (Imprecision) — 宽CI/小样本量
4. 间接性 (Indirectness) — PICO不匹配
5. 发表偏倚 (Publication Bias)

升级因素：
- 效应量大 (大2-3倍)
- 剂量反应关系
- 负偏倚 (所有混杂因素均降低效应)

最终分级: ⊕⊕⊕⊕ High / ⊕⊕⊕◯ Moderate / ⊕⊕◯◯ Low / ⊕◯◯◯ Very Low
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
class GRADEAssessment:
    """GRADE评估结果"""
    evidence_type: str = ""     # rct / observational
    initial_quality: str = ""   # high (RCT) / low (observational)
    final_quality: str = ""     # high / moderate / low / very_low
    final_score: int = 0        # 4=high, 3=moderate, 2=low, 1=very_low

    # 降级因素 (0=不降级, 1=降1级, 2=降2级)
    risk_of_bias: int = 0
    inconsistency: int = 0
    indirectness: int = 0
    imprecision: int = 0
    publication_bias: int = 0

    # 升级因素 (0=不升级, 1=升1级, 2=升2级)
    large_effect: int = 0
    dose_response: int = 0
    confounding: int = 0

    # 详细说明
    explanations: list[str] = field(default_factory=list)
    confidence: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def score_label(self) -> str:
        labels = {4: "⊕⊕⊕⊕ High", 3: "⊕⊕⊕◯ Moderate", 2: "⊕⊕◯◯ Low", 1: "⊕◯◯◯ Very Low"}
        return labels.get(self.final_score, "Unknown")

    @property
    def downgrades_total(self) -> int:
        return (self.risk_of_bias + self.inconsistency + self.indirectness +
                self.imprecision + self.publication_bias)

    @property
    def upgrades_total(self) -> int:
        return self.large_effect + self.dose_response + self.confounding


class EvidenceGrader:
    """GRADE证据质量分级器"""

    def __init__(self, grades_path: Optional[str] = None):
        self.grade_definitions = self._load_definitions(grades_path)

    def _load_definitions(self, path: Optional[str]) -> dict:
        """加载证据等级定义"""
        if path:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"加载证据等级定义失败: {e}")

        return {
            "high": {"score": 4, "label": "⊕⊕⊕⊕ High", "description": "非常确信估计值接近真实效应"},
            "moderate": {"score": 3, "label": "⊕⊕⊕◯ Moderate", "description": "对估计值有中等信心，真实效应可能接近估计值"},
            "low": {"score": 2, "label": "⊕⊕◯◯ Low", "description": "对估计值的信心有限，真实效应可能与估计值明显不同"},
            "very_low": {"score": 1, "label": "⊕◯◯◯ Very Low", "description": "对估计值几乎没有信心，真实效应可能与估计值大不相同"},
        }

    def assess(
        self,
        evidence_type: str = "rct",
        risk_of_bias: str = "low",
        inconsistency: str = "low",
        indirectness: str = "low",
        imprecision: str = "low",
        publication_bias: str = "undetected",
        large_effect: bool = False,
        dose_response: bool = False,
        confounding: bool = False,
        i_squared: float = 0.0,
        total_n: int = 0,
        ci_crosses_null: bool = True,
    ) -> GRADEAssessment:
        """
        评估证据质量

        Args:
            evidence_type: 证据类型 (rct / observational)
            risk_of_bias: 偏倚风险 (low / moderate / high / unclear)
            inconsistency: 不一致性 (low / moderate / high)
            indirectness: 间接性 (low / moderate / high)
            imprecision: 不精确性 (low / moderate / high)
            publication_bias: 发表偏倚 (undetected / suspected / detected)
            large_effect: 效应量是否大
            dose_response: 是否存在剂量反应关系
            confounding: 混杂因素方向是否支持效应
            i_squared: I²值
            total_n: 总样本量
            ci_crosses_null: CI是否跨越无效线

        Returns:
            GRADEAssessment 对象
        """
        assessment = GRADEAssessment(evidence_type=evidence_type)

        # 初始质量
        if evidence_type == "rct":
            assessment.initial_quality = "high"
            assessment.final_score = 4
        else:
            assessment.initial_quality = "low"
            assessment.final_score = 2

        # ── 降级因素 ──────────────────────────────────────

        # 1. 偏倚风险
        rob_downgrade = self._assess_risk_of_bias(risk_of_bias)
        assessment.risk_of_bias = rob_downgrade
        if rob_downgrade > 0:
            assessment.explanations.append(
                f"偏倚风险{'严重' if rob_downgrade == 2 else '存在一定'}问题 → 降{rob_downgrade}级"
            )

        # 2. 不一致性
        inc_downgrade = self._assess_inconsistency(inconsistency, i_squared)
        assessment.inconsistency = inc_downgrade
        if inc_downgrade > 0:
            assessment.explanations.append(
                f"研究间不一致性{'较大' if inc_downgrade == 2 else '存在'} "
                f"(I²={i_squared:.1f}%) → 降{inc_downgrade}级"
            )

        # 3. 间接性
        ind_downgrade = self._assess_indirectness(indirectness)
        assessment.indirectness = ind_downgrade
        if ind_downgrade > 0:
            assessment.explanations.append(
                f"存在一定间接证据 → 降{ind_downgrade}级"
            )

        # 4. 不精确性
        imp_downgrade = self._assess_imprecision(imprecision, total_n, ci_crosses_null)
        assessment.imprecision = imp_downgrade
        if imp_downgrade > 0:
            assessment.explanations.append(
                f"不精确性{'严重' if imp_downgrade == 2 else '存在'} "
                f"(总n={total_n}) → 降{imp_downgrade}级"
            )

        # 5. 发表偏倚
        pub_downgrade = self._assess_publication_bias(publication_bias)
        assessment.publication_bias = pub_downgrade
        if pub_downgrade > 0:
            assessment.explanations.append(
                f"发表偏倚{'存在' if pub_downgrade == 2 else '疑似'} → 降{pub_downgrade}级"
            )

        # ── 升级因素 ──────────────────────────────────────

        # 大效应量
        if large_effect:
            assessment.large_effect = 1
            assessment.explanations.append("效应量大 → 升1级")

        # 剂量反应
        if dose_response:
            assessment.dose_response = 1
            assessment.explanations.append("存在剂量反应关系 → 升1级")

        # 混杂因素
        if confounding:
            assessment.confounding = 1
            assessment.explanations.append("混杂因素方向支持效应 → 升1级")

        # ── 计算最终质量 ──────────────────────────────────

        total_down = assessment.downgrades_total
        total_up = assessment.upgrades_total

        assessment.final_score = max(1, min(4, assessment.final_score - total_down + total_up))

        quality_map = {4: "high", 3: "moderate", 2: "low", 1: "very_low"}
        assessment.final_quality = quality_map[assessment.final_score]

        # 计算置信度
        assessment.confidence = self._calculate_confidence(assessment)

        logger.info(
            f"GRADE分级完成: {evidence_type} → {assessment.final_quality} "
            f"({assessment.score_label}), 降级{total_down}次, 升级{total_up}次"
        )

        return assessment

    def _assess_risk_of_bias(self, rob: str) -> int:
        """评估偏倚风险降级"""
        if rob == "high":
            return 2
        elif rob in ("moderate", "some_concerns", "unclear"):
            return 1
        return 0

    def _assess_inconsistency(self, inconsistency: str, i_squared: float = 0) -> int:
        """评估不一致性降级"""
        # 优先使用I²值
        if i_squared > 0:
            if i_squared > 75:
                return 2
            elif i_squared > 50:
                return 1
            return 0

        if inconsistency == "high":
            return 2
        elif inconsistency == "moderate":
            return 1
        return 0

    def _assess_indirectness(self, indirectness: str) -> int:
        """评估间接性降级"""
        if indirectness == "high":
            return 2
        elif indirectness in ("moderate", "some"):
            return 1
        return 0

    def _assess_imprecision(
        self, imprecision: str, total_n: int, ci_crosses_null: bool
    ) -> int:
        """评估不精确性降级"""
        # 基于样本量
        if total_n > 0:
            if total_n < 100:
                return 2  # 样本量过小
            elif total_n < 400:
                if ci_crosses_null:
                    return 1  # 样本量不足且CI跨越无效线
            return 0

        if imprecision == "high":
            return 2
        elif imprecision in ("moderate", "some"):
            return 1
        return 0

    def _assess_publication_bias(self, pb: str) -> int:
        """评估发表偏倚降级"""
        if pb == "detected":
            return 2
        elif pb == "suspected":
            return 1
        return 0

    def _calculate_confidence(self, assessment: GRADEAssessment) -> float:
        """计算评估置信度"""
        # 基于解释数量和清晰度
        if not assessment.explanations:
            return 0.8  # 无降级/升级说明，说明证据清晰
        return min(0.95, 0.6 + len(assessment.explanations) * 0.05)

    def assess_from_meta_result(self, meta_result: dict, rob_judgment: str = "low") -> GRADEAssessment:
        """
        从Meta分析结果直接评估

        Args:
            meta_result: Meta分析结果字典 (来自MetaAnalyzer)
            rob_judgment: 偏倚风险总体判断

        Returns:
            GRADEAssessment 对象
        """
        heterogeneity = meta_result.get("heterogeneity", {})
        i_squared = heterogeneity.get("I_squared", 0)
        n_studies = meta_result.get("n_studies", 0)

        # 评估不一致性
        if i_squared > 75:
            inconsistency = "high"
        elif i_squared > 50:
            inconsistency = "moderate"
        else:
            inconsistency = "low"

        # 评估不精确性
        total_n = sum(
            s.get("n_treatment", 0) + s.get("n_control", 0)
            for s in meta_result.get("studies", [])
        )
        ci_lower = meta_result.get("ci_lower", 0)
        ci_upper = meta_result.get("ci_upper", 0)
        measure = meta_result.get("measure", "OR")

        if measure in ("OR", "RR", "HR"):
            ci_crosses_null = ci_lower < 1.0 < ci_upper
        else:
            ci_crosses_null = ci_lower < 0.0 < ci_upper

        if total_n < 400 and ci_crosses_null:
            imprecision = "high" if total_n < 100 else "moderate"
        else:
            imprecision = "low"

        return self.assess(
            evidence_type="rct",
            risk_of_bias=rob_judgment,
            inconsistency=inconsistency,
            indirectness="low",
            imprecision=imprecision,
            publication_bias="undetected",
            i_squared=i_squared,
            total_n=total_n,
            ci_crosses_null=ci_crosses_null,
        )

    def generate_summary_table(self, assessments: list[GRADEAssessment]) -> str:
        """
        生成GRADE证据概要表 (文本格式)

        Args:
            assessments: 评估结果列表

        Returns:
            格式化的表格字符串
        """
        lines = [
            "┌─────────────────────────────────────────────────────────────────┐",
            "│                    GRADE 证据质量分级                          │",
            "├──────┬──────┬──────┬──────┬──────┬──────┬──────┬────────────────┤",
            "│ 偏倚 │不一致│间接性│不精确│发表  │ 大   │剂量  │  最终质量      │",
            "│ 风险 │ 性   │      │      │偏倚  │ 效应 │反应  │                │",
            "├──────┼──────┼──────┼──────┼──────┼──────┼──────┼────────────────┤",
        ]

        for a in assessments:
            line = (
                f"│ {'⬇'*a.risk_of_bias or '✓':^4} "
                f"│ {'⬇'*a.inconsistency or '✓':^4} "
                f"│ {'⬇'*a.indirectness or '✓':^4} "
                f"│ {'⬇'*a.imprecision or '✓':^4} "
                f"│ {'⬇'*a.publication_bias or '✓':^4} "
                f"│ {'⬆'*a.large_effect or '·':^4} "
                f"│ {'⬆'*a.dose_response or '·':^4} "
                f"│ {a.score_label:^14} │"
            )
            lines.append(line)

        lines.append("└──────┴──────┴──────┴──────┴──────┴──────┴──────┴────────────────┘")
        return "\n".join(lines)


def main():
    """命令行入口"""
    parser = argparse.ArgumentParser(description="MingEvidence GRADE证据质量分级器")
    parser.add_argument("--evidence-type", "-t", default="rct",
                        choices=["rct", "observational"],
                        help="证据类型")
    parser.add_argument("--risk-of-bias", default="low",
                        choices=["low", "moderate", "high", "unclear"],
                        help="偏倚风险")
    parser.add_argument("--inconsistency", default="low",
                        choices=["low", "moderate", "high"],
                        help="不一致性")
    parser.add_argument("--indirectness", default="low",
                        choices=["low", "moderate", "high"],
                        help="间接性")
    parser.add_argument("--imprecision", default="low",
                        choices=["low", "moderate", "high"],
                        help="不精确性")
    parser.add_argument("--publication-bias", default="undetected",
                        choices=["undetected", "suspected", "detected"],
                        help="发表偏倚")
    parser.add_argument("--large-effect", action="store_true", help="效应量大")
    parser.add_argument("--dose-response", action="store_true", help="剂量反应关系")
    parser.add_argument("--confounding", action="store_true", help="混杂因素支持效应")
    parser.add_argument("--i-squared", type=float, default=0, help="I²值")
    parser.add_argument("--total-n", type=int, default=0, help="总样本量")
    parser.add_argument("--output", "-o", default="", help="输出文件路径")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    grader = EvidenceGrader()
    result = grader.assess(
        evidence_type=args.evidence_type,
        risk_of_bias=args.risk_of_bias,
        inconsistency=args.inconsistency,
        indirectness=args.indirectness,
        imprecision=args.imprecision,
        publication_bias=args.publication_bias,
        large_effect=args.large_effect,
        dose_response=args.dose_response,
        confounding=args.confounding,
        i_squared=args.i_squared,
        total_n=args.total_n,
    )

    print(f"\n📊 GRADE 证据质量分级:\n")
    print(f"  证据类型:    {result.evidence_type}")
    print(f"  初始质量:    {result.initial_quality}")
    print(f"  最终质量:    {result.score_label}")
    print(f"  降级:        {result.downgrades_total} 级")
    print(f"  升级:        {result.upgrades_total} 级")
    print()

    if result.explanations:
        print("  详细说明:")
        for exp in result.explanations:
            print(f"    • {exp}")
        print()

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(result.to_dict(), f, ensure_ascii=False, indent=2)
        print(f"✅ 结果已保存到 {args.output}")


if __name__ == "__main__":
    main()
