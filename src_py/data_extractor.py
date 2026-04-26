"""
数据提取器 — 从文献中自动提取效应量、置信区间、样本量等数据

支持提取：
- 效应量: OR, RR, HR, MD, SMD, RD
- 95% 置信区间
- 样本量 (干预组/对照组)
- P值
- 事件数
"""

import re
import json
import logging
import argparse
from dataclasses import dataclass, field, asdict
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class EffectSize:
    """效应量数据"""
    measure: str = ""           # OR / RR / HR / MD / SMD / RD
    value: float = 0.0          # 效应量值
    ci_lower: float = 0.0       # 95% CI 下限
    ci_upper: float = 0.0       # 95% CI 上限
    p_value: float = 1.0        # P值
    se: float = 0.0             # 标准误
    n_total: int = 0            # 总样本量
    n_treatment: int = 0        # 干预组样本量
    n_control: int = 0          # 对照组样本量
    events_treatment: int = 0   # 干预组事件数
    events_control: int = 0     # 对照组事件数
    weight: float = 0.0         # Meta分析权重

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def log_value(self) -> float:
        """对数效应量（用于Meta分析）"""
        if self.measure in ("OR", "RR", "HR"):
            return np.log(self.value) if self.value > 0 else 0.0
        return self.value

    @property
    def log_se(self) -> float:
        """对数标准误"""
        if self.measure in ("OR", "RR", "HR") and self.ci_lower > 0 and self.ci_upper > 0:
            return (np.log(self.ci_upper) - np.log(self.ci_lower)) / (2 * 1.96)
        return self.se

    def is_valid(self) -> bool:
        """数据是否有效"""
        if self.measure in ("OR", "RR", "HR"):
            return self.value > 0 and self.ci_lower > 0 and self.ci_upper > 0
        return self.value != 0


@dataclass
class StudyData:
    """单篇研究的提取数据"""
    study_id: str = ""
    pmid: str = ""
    title: str = ""
    study_design: str = ""      # rct / cohort / case_control
    effect_sizes: list[EffectSize] = field(default_factory=list)
    raw_text: str = ""          # 原始提取文本
    extraction_confidence: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


# ── 效应量提取正则 ─────────────────────────────────────────

EFFECT_PATTERNS = {
    # OR: odds ratio
    "OR": [
        r"[Oo]dds\s+[Rr]atio\s*(?:[:=]|was)?\s*([\d.]+)\s*[\(,\s]*(?:95%?\s*CI[:\s]*)?([\d.]+)\s*[-–—to]+\s*([\d.]+)",
        r"OR\s*[:=]?\s*([\d.]+)\s*[\(,\s]*(?:95%?\s*CI[:\s]*)?([\d.]+)\s*[-–—to]+\s*([\d.]+)",
        r"OR\s*[:=]?\s*([\d.]+)",
    ],
    # RR: relative risk
    "RR": [
        r"[Rr]elative\s+[Rr]isk\s*[:=]?\s*([\d.]+)\s*[\(,\s]*(?:95%?\s*CI[:\s]*)?([\d.]+)\s*[-–—to]+\s*([\d.]+)",
        r"RR\s*[:=]?\s*([\d.]+)\s*[\(,\s]*(?:95%?\s*CI[:\s]*)?([\d.]+)\s*[-–—to]+\s*([\d.]+)",
        r"RR\s*[:=]?\s*([\d.]+)",
    ],
    # HR: hazard ratio
    "HR": [
        r"[Hh]azard\s+[Rr]atio\s*[:=]?\s*([\d.]+)\s*[\(,\s]*(?:95%?\s*CI[:\s]*)?([\d.]+)\s*[-–—to]+\s*([\d.]+)",
        r"HR\s*[:=]?\s*([\d.]+)\s*[\(,\s]*(?:95%?\s*CI[:\s]*)?([\d.]+)\s*[-–—to]+\s*([\d.]+)",
        r"HR\s*[:=]?\s*([\d.]+)",
    ],
    # MD: mean difference
    "MD": [
        r"[Mm]ean\s+[Dd]ifference\s*[:=]?\s*([−\-]?[\d.]+)\s*[\(,\s]*(?:95%?\s*CI[:\s]*)?([−\-]?[\d.]+)\s*[-–—to]+\s*([−\-]?[\d.]+)",
        r"MD\s*[:=]?\s*([−\-]?[\d.]+)",
    ],
    # SMD: standardized mean difference
    "SMD": [
        r"[Ss]tandardized\s+[Mm]ean\s+[Dd]ifference\s*[:=]?\s*([−\-]?[\d.]+)",
        r"SMD\s*[:=]?\s*([−\-]?[\d.]+)",
        r"Cohen'?s?\s+d\s*[:=]?\s*([−\-]?[\d.]+)",
    ],
}

# 样本量提取
SAMPLE_SIZE_PATTERNS = [
    r"(?:n|N)\s*[:=]\s*(\d+)",
    r"(\d+)\s+patients?\s+?(?:were\s+)?(?:enrolled|randomized|recruited)",
    r"(\d+)\s+例",
    r"total\s+of\s+(\d+)",
    r"共\s*(\d+)\s*例",
]

# P值提取
P_VALUE_PATTERNS = [
    r"[Pp]\s*[<>=≤≥]\s*([\d.]+)",
    r"[Pp]-?value\s*[:=]?\s*([\d.]+)",
]

# 事件数
EVENT_PATTERNS = [
    r"(\d+)/(\d+)\s*(?:vs|versus|compared)\s*(\d+)/(\d+)",
    r"(\d+)\s*(?:of|out\s+of|/)\s*(\d+)\s*(?:vs|versus)\s*(\d+)\s*(?:of|out\s+of|/)\s*(\d+)",
]


class DataExtractor:
    """文献数据提取器"""

    def __init__(self):
        self.effect_patterns = EFFECT_PATTERNS

    def extract_from_text(self, text: str, study_id: str = "", pmid: str = "") -> StudyData:
        """
        从文本中提取研究数据

        Args:
            text: 文献摘要或全文文本
            study_id: 研究ID
            pmid: PubMed ID

        Returns:
            StudyData 对象
        """
        study = StudyData(
            study_id=study_id,
            pmid=pmid,
            raw_text=text,
        )

        # 提取各种效应量
        for measure, patterns in self.effect_patterns.items():
            effects = self._extract_effect_sizes(text, measure, patterns)
            study.effect_sizes.extend(effects)

        # 提取样本量
        total_n = self._extract_sample_size(text)
        if total_n > 0:
            for es in study.effect_sizes:
                if es.n_total == 0:
                    es.n_total = total_n

        # 提取P值
        p_values = self._extract_p_values(text)
        if p_values and study.effect_sizes:
            study.effect_sizes[0].p_value = p_values[0]

        # 计算提取置信度
        study.extraction_confidence = self._calculate_confidence(study)

        logger.info(f"数据提取完成: {study_id}, {len(study.effect_sizes)} 个效应量")
        return study

    def _extract_effect_sizes(self, text: str, measure: str, patterns: list[str]) -> list[EffectSize]:
        """提取效应量"""
        effects = []

        for pattern in patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                es = EffectSize(measure=measure)
                groups = match.groups()

                if len(groups) >= 1:
                    try:
                        es.value = float(groups[0].replace("−", "-"))
                    except ValueError:
                        continue

                if len(groups) >= 3:
                    try:
                        es.ci_lower = float(groups[1].replace("−", "-"))
                        es.ci_upper = float(groups[2].replace("−", "-"))
                    except ValueError:
                        pass

                # 从CI估算标准误
                if es.ci_lower > 0 and es.ci_upper > 0 and measure in ("OR", "RR", "HR"):
                    es.se = (np.log(es.ci_upper) - np.log(es.ci_lower)) / (2 * 1.96)
                elif es.ci_lower != 0 and es.ci_upper != 0:
                    es.se = (es.ci_upper - es.ci_lower) / (2 * 1.96)

                effects.append(es)
                break  # 只取第一个完整匹配

        return effects

    def _extract_sample_size(self, text: str) -> int:
        """提取样本量"""
        for pattern in SAMPLE_SIZE_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return int(match.group(1))
        return 0

    def _extract_p_values(self, text: str) -> list[float]:
        """提取P值"""
        p_values = []
        for pattern in P_VALUE_PATTERNS:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                try:
                    pv = float(match.group(1))
                    p_values.append(pv)
                except ValueError:
                    continue
        return p_values

    def _calculate_confidence(self, study: StudyData) -> float:
        """计算提取置信度"""
        if not study.effect_sizes:
            return 0.0

        score = 0.0
        es = study.effect_sizes[0]

        if es.value > 0:
            score += 0.3
        if es.ci_lower > 0 and es.ci_upper > 0:
            score += 0.3
        if es.n_total > 0:
            score += 0.2
        if es.p_value < 1.0:
            score += 0.1
        if es.se > 0:
            score += 0.1

        return min(score, 1.0)

    def extract_2x2_table(
        self,
        events_treatment: int,
        total_treatment: int,
        events_control: int,
        total_control: int,
    ) -> EffectSize:
        """
        从2x2列联表提取效应量

        Args:
            events_treatment: 干预组事件数
            total_treatment: 干预组总人数
            events_control: 对照组事件数
            total_control: 对照组总人数

        Returns:
            EffectSize 对象（含OR和RR）
        """
        # 添加0.5连续性校正
        a = events_treatment
        b = total_treatment - events_treatment
        c = events_control
        d = total_control - events_control

        if min(a, b, c, d) == 0:
            a += 0.5
            b += 0.5
            c += 0.5
            d += 0.5

        # OR
        or_val = (a * d) / (b * c)
        log_or = np.log(or_val)
        se_log_or = np.sqrt(1/a + 1/b + 1/c + 1/d)

        or_lower = np.exp(log_or - 1.96 * se_log_or)
        or_upper = np.exp(log_or + 1.96 * se_log_or)

        # RR
        p_treat = events_treatment / total_treatment if total_treatment > 0 else 0
        p_control = events_control / total_control if total_control > 0 else 0
        rr_val = p_treat / p_control if p_control > 0 else 0

        if rr_val > 0:
            log_rr = np.log(rr_val)
            se_log_rr = np.sqrt(
                (1 - p_treat) / (events_treatment) if events_treatment > 0 else 0 +
                (1 - p_control) / (events_control) if events_control > 0 else 0
            )
            rr_lower = np.exp(log_rr - 1.96 * se_log_rr)
            rr_upper = np.exp(log_rr + 1.96 * se_log_rr)
        else:
            rr_lower = rr_upper = 0

        # RD
        rd_val = p_treat - p_control
        se_rd = np.sqrt(
            p_treat * (1 - p_treat) / total_treatment +
            p_control * (1 - p_control) / total_control
        )

        return EffectSize(
            measure="OR",
            value=round(or_val, 4),
            ci_lower=round(or_lower, 4),
            ci_upper=round(or_upper, 4),
            se=round(se_log_or, 4),
            n_total=total_treatment + total_control,
            n_treatment=total_treatment,
            n_control=total_control,
            events_treatment=events_treatment,
            events_control=events_control,
        )

    def extract_from_json(self, json_path: str) -> list[StudyData]:
        """从JSON文件批量提取"""
        with open(json_path, "r", encoding="utf-8") as f:
            records = json.load(f)

        studies = []
        for record in records:
            text = record.get("abstract", "") or record.get("text", "")
            study = self.extract_from_text(
                text=text,
                study_id=record.get("pmid", ""),
                pmid=record.get("pmid", ""),
            )
            study.title = record.get("title", "")
            studies.append(study)

        return studies


def main():
    """命令行入口"""
    parser = argparse.ArgumentParser(description="MingEvidence 数据提取器")
    parser.add_argument("--input", "-i", required=True, help="输入文件 (JSON)")
    parser.add_argument("--output", "-o", default="", help="输出文件路径")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    extractor = DataExtractor()
    studies = extractor.extract_from_json(args.input)

    print(f"\n📊 数据提取结果: {len(studies)} 篇研究\n")
    for study in studies:
        print(f"  [{study.study_id}] 置信度: {study.extraction_confidence:.0%}")
        for es in study.effect_sizes:
            print(f"    {es.measure}: {es.value} (95% CI: {es.ci_lower}-{es.ci_upper})")

    if args.output:
        output_data = [s.to_dict() for s in studies]
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        print(f"\n✅ 结果已保存到 {args.output}")


if __name__ == "__main__":
    main()
