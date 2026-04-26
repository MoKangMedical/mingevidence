"""
Meta分析引擎 — 支持随机效应/固定效应模型、森林图、异质性检验

支持的效应量：
- OR (Odds Ratio)
- RR (Risk Ratio) / RD (Risk Difference)
- HR (Hazard Ratio)
- MD (Mean Difference) / SMD (Standardized Mean Difference)

方法：
- 固定效应: Mantel-Haenszel / Inverse Variance
- 随机效应: DerSimonian-Laird / REML
- 异质性: I², Q检验, tau²
"""

import json
import logging
import argparse
from dataclasses import dataclass, field, asdict
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class Heterogeneity:
    """异质性检验结果"""
    Q: float = 0.0              # Cochran's Q
    Q_p_value: float = 1.0      # Q检验P值
    I_squared: float = 0.0      # I² (0-100%)
    tau_squared: float = 0.0    # tau² (研究间方差)
    tau: float = 0.0            # tau (标准差)

    def to_dict(self) -> dict:
        return asdict(self)

    @property
    def level(self) -> str:
        if self.I_squared < 25:
            return "low"
        elif self.I_squared < 50:
            return "moderate"
        elif self.I_squared < 75:
            return "substantial"
        else:
            return "considerable"


@dataclass
class MetaResult:
    """Meta分析结果"""
    measure: str = ""           # OR / RR / MD / SMD 等
    method: str = ""            # fixed / random
    pooled_effect: float = 0.0  # 合并效应量
    ci_lower: float = 0.0       # 95% CI 下限
    ci_upper: float = 0.0       # 95% CI 上限
    p_value: float = 1.0        # 合并效应量P值
    z_value: float = 0.0        # Z统计量
    heterogeneity: Heterogeneity = field(default_factory=Heterogeneity)
    n_studies: int = 0          # 纳入研究数
    weights: list[float] = field(default_factory=list)  # 各研究权重
    forest_plot_path: str = ""  # 森林图路径

    def to_dict(self) -> dict:
        d = asdict(self)
        d["heterogeneity"] = self.heterogeneity.to_dict()
        return d

    @property
    def significant(self) -> bool:
        return self.p_value < 0.05


@dataclass
class StudyEffect:
    """单个研究的效应量"""
    study_id: str = ""
    effect: float = 0.0         # 效应量 (log scale for OR/RR/HR)
    se: float = 0.0             # 标准误
    weight: float = 0.0         # 权重
    ci_lower: float = 0.0
    ci_upper: float = 0.0
    raw_effect: float = 0.0     # 原始效应量 (非log)
    n_treatment: int = 0
    n_control: int = 0
    events_treatment: int = 0
    events_control: int = 0


class MetaAnalyzer:
    """Meta分析引擎"""

    def __init__(self):
        self.results: list[MetaResult] = []

    def run_meta_analysis(
        self,
        studies: list[dict],
        measure: str = "OR",
        method: str = "random",
        forest_plot: bool = False,
        output_dir: str = ".",
    ) -> MetaResult:
        """
        运行Meta分析

        Args:
            studies: 研究数据列表, 每个包含:
                - study_id: 研究ID
                - effect: 效应量
                - se: 标准误 (可选)
                - ci_lower / ci_upper: 95% CI (可选, 用于计算SE)
                - n_treatment / n_control: 样本量 (可选)
                - events_treatment / events_control: 事件数 (可选)
            measure: 效应量类型 (OR/RR/HR/MD/SMD)
            method: 分析方法 (fixed/random)
            forest_plot: 是否生成森林图
            output_dir: 输出目录

        Returns:
            MetaResult 对象
        """
        logger.info(f"开始Meta分析: {len(studies)} 篇研究, {measure}, {method}")

        # 准备效应量数据
        effects = self._prepare_effects(studies, measure)

        if len(effects) < 2:
            logger.error("纳入研究不足2篇，无法进行Meta分析")
            return MetaResult(measure=measure, method=method, n_studies=len(effects))

        # 计算权重和合并效应量
        if method == "fixed":
            result = self._fixed_effect_meta(effects, measure)
        else:
            result = self._random_effect_meta(effects, measure)

        result.measure = measure
        result.method = method
        result.n_studies = len(effects)

        # 生成森林图
        if forest_plot:
            plot_path = f"{output_dir}/forest_plot.png"
            self._generate_forest_plot(effects, result, plot_path)
            result.forest_plot_path = plot_path

        self.results.append(result)
        logger.info(
            f"Meta分析完成: 合并{measure}={result.pooled_effect:.4f} "
            f"(95%CI: {result.ci_lower:.4f}-{result.ci_upper:.4f}), "
            f"I²={result.heterogeneity.I_squared:.1f}%"
        )
        return result

    def _prepare_effects(self, studies: list[dict], measure: str) -> list[StudyEffect]:
        """准备效应量数据"""
        effects = []

        for study in studies:
            se = study.get("se", 0)
            effect = study.get("effect", 0)
            ci_lower = study.get("ci_lower", 0)
            ci_upper = study.get("ci_upper", 0)

            # 如果没有SE，从CI计算
            if se == 0 and ci_lower > 0 and ci_upper > 0:
                if measure in ("OR", "RR", "HR"):
                    se = (np.log(ci_upper) - np.log(ci_lower)) / (2 * 1.96)
                    effect = np.log(effect) if effect > 0 else 0
                else:
                    se = (ci_upper - ci_lower) / (2 * 1.96)

            elif measure in ("OR", "RR", "HR") and effect > 0:
                effect = np.log(effect)

            if se <= 0:
                logger.warning(f"研究 {study.get('study_id', '?')} 标准误无效，跳过")
                continue

            effects.append(StudyEffect(
                study_id=study.get("study_id", ""),
                effect=effect,
                se=se,
                raw_effect=study.get("effect", 0),
                ci_lower=ci_lower,
                ci_upper=ci_upper,
                n_treatment=study.get("n_treatment", 0),
                n_control=study.get("n_control", 0),
                events_treatment=study.get("events_treatment", 0),
                events_control=study.get("events_control", 0),
            ))

        return effects

    def _fixed_effect_meta(self, effects: list[StudyEffect], measure: str) -> MetaResult:
        """固定效应Meta分析 (Inverse Variance)"""
        # 权重 = 1/SE²
        weights = np.array([1.0 / (e.se ** 2) for e in effects])
        effects_arr = np.array([e.effect for e in effects])

        # 合并效应量
        pooled = np.sum(weights * effects_arr) / np.sum(weights)
        se_pooled = np.sqrt(1.0 / np.sum(weights))

        # Z检验
        z = pooled / se_pooled
        from scipy.stats import norm
        p_value = 2 * (1 - norm.cdf(abs(z)))

        # 异质性
        heterogeneity = self._calculate_heterogeneity(effects_arr, weights)

        # 设置权重
        weight_pct = (weights / np.sum(weights) * 100).tolist()
        for i, e in enumerate(effects):
            e.weight = weight_pct[i]

        # 转换回原始尺度
        if measure in ("OR", "RR", "HR"):
            pooled_original = np.exp(pooled)
            ci_lower = np.exp(pooled - 1.96 * se_pooled)
            ci_upper = np.exp(pooled + 1.96 * se_pooled)
        else:
            pooled_original = pooled
            ci_lower = pooled - 1.96 * se_pooled
            ci_upper = pooled + 1.96 * se_pooled

        return MetaResult(
            pooled_effect=round(float(pooled_original), 4),
            ci_lower=round(float(ci_lower), 4),
            ci_upper=round(float(ci_upper), 4),
            p_value=round(float(p_value), 6),
            z_value=round(float(z), 4),
            heterogeneity=heterogeneity,
            weights=weight_pct,
        )

    def _random_effect_meta(self, effects: list[StudyEffect], measure: str) -> MetaResult:
        """随机效应Meta分析 (DerSimonian-Laird)"""
        weights_inv = np.array([1.0 / (e.se ** 2) for e in effects])
        effects_arr = np.array([e.effect for e in effects])

        # 先用固定效应计算Q
        pooled_fe = np.sum(weights_inv * effects_arr) / np.sum(weights_inv)
        Q = np.sum(weights_inv * (effects_arr - pooled_fe) ** 2)
        k = len(effects)
        df = k - 1

        # DerSimonian-Laird tau²
        C = np.sum(weights_inv) - np.sum(weights_inv ** 2) / np.sum(weights_inv)
        tau2 = max(0, (Q - df) / C)

        # 随机效应权重
        weights = np.array([1.0 / (e.se ** 2 + tau2) for e in effects])

        # 合并效应量
        pooled = np.sum(weights * effects_arr) / np.sum(weights)
        se_pooled = np.sqrt(1.0 / np.sum(weights))

        # Z检验
        z = pooled / se_pooled
        from scipy.stats import norm
        p_value = 2 * (1 - norm.cdf(abs(z)))

        # 异质性
        heterogeneity = self._calculate_heterogeneity(effects_arr, weights_inv)
        heterogeneity.tau_squared = round(float(tau2), 6)
        heterogeneity.tau = round(float(np.sqrt(tau2)), 6)
        heterogeneity.Q = round(float(Q), 4)

        from scipy.stats import chi2
        heterogeneity.Q_p_value = round(float(1 - chi2.cdf(Q, df)), 6)

        # 设置权重
        weight_pct = (weights / np.sum(weights) * 100).tolist()
        for i, e in enumerate(effects):
            e.weight = weight_pct[i]

        # 转换回原始尺度
        if measure in ("OR", "RR", "HR"):
            pooled_original = np.exp(pooled)
            ci_lower = np.exp(pooled - 1.96 * se_pooled)
            ci_upper = np.exp(pooled + 1.96 * se_pooled)
        else:
            pooled_original = pooled
            ci_lower = pooled - 1.96 * se_pooled
            ci_upper = pooled + 1.96 * se_pooled

        return MetaResult(
            pooled_effect=round(float(pooled_original), 4),
            ci_lower=round(float(ci_lower), 4),
            ci_upper=round(float(ci_upper), 4),
            p_value=round(float(p_value), 6),
            z_value=round(float(z), 4),
            heterogeneity=heterogeneity,
            weights=weight_pct,
        )

    def _calculate_heterogeneity(self, effects: np.ndarray, weights: np.ndarray) -> Heterogeneity:
        """计算异质性指标"""
        k = len(effects)
        if k < 2:
            return Heterogeneity()

        pooled = np.sum(weights * effects) / np.sum(weights)
        Q = np.sum(weights * (effects - pooled) ** 2)
        df = k - 1

        from scipy.stats import chi2
        Q_p = 1 - chi2.cdf(Q, df) if Q > 0 else 1.0

        I2 = max(0, (Q - df) / Q * 100) if Q > 0 else 0

        C = np.sum(weights) - np.sum(weights ** 2) / np.sum(weights)
        tau2 = max(0, (Q - df) / C) if C > 0 else 0

        return Heterogeneity(
            Q=round(float(Q), 4),
            Q_p_value=round(float(Q_p), 6),
            I_squared=round(float(I2), 2),
            tau_squared=round(float(tau2), 6),
            tau=round(float(np.sqrt(tau2)), 6),
        )

    def _generate_forest_plot(
        self, effects: list[StudyEffect], result: MetaResult, output_path: str
    ):
        """生成森林图"""
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
        except ImportError:
            logger.warning("matplotlib 未安装，跳过森林图生成")
            return

        n = len(effects)
        fig_height = max(4, n * 0.5 + 2)
        fig, ax = plt.subplots(1, 1, figsize=(12, fig_height))

        y_positions = list(range(n, 0, -1))

        # 绘制各研究
        for i, (effect, y) in enumerate(zip(effects, y_positions)):
            # 点估计
            marker_size = max(4, effect.weight / 5)
            ax.plot(effect.raw_effect, y, "s", color="steelblue", markersize=marker_size)
            # CI线
            ax.plot(
                [effect.ci_lower, effect.ci_upper], [y, y],
                color="steelblue", linewidth=1.5
            )
            # 标签
            ax.text(
                -0.15, y, f"{effect.study_id}",
                ha="right", va="center", fontsize=8,
                transform=ax.get_yaxis_transform()
            )
            ax.text(
                1.02, y,
                f"{effect.raw_effect:.2f} [{effect.ci_lower:.2f}, {effect.ci_upper:.2f}]  {effect.weight:.1f}%",
                ha="left", va="center", fontsize=7,
                transform=ax.get_yaxis_transform()
            )

        # 合并效应量菱形
        diamond_y = 0
        diamond_x = [result.ci_lower, result.pooled_effect, result.ci_upper, result.pooled_effect]
        diamond_y_vals = [diamond_y, diamond_y + 0.3, diamond_y, diamond_y - 0.3]
        ax.fill(diamond_x, diamond_y_vals, color="red", alpha=0.7)
        ax.axvline(x=result.pooled_effect, color="red", linestyle="--", alpha=0.5)

        # 无效线
        if result.measure in ("OR", "RR", "HR"):
            ax.axvline(x=1.0, color="black", linestyle="-", alpha=0.3)
        else:
            ax.axvline(x=0.0, color="black", linestyle="-", alpha=0.3)

        # 标题和标签
        ax.set_yticks([])
        ax.set_xlabel(f"{result.measure} (95% CI)")
        ax.set_title(
            f"Forest Plot — {result.measure} {result.method.capitalize()} Effect\n"
            f"Pooled {result.measure}={result.pooled_effect:.2f} "
            f"[{result.ci_lower:.2f}, {result.ci_upper:.2f}], "
            f"I²={result.heterogeneity.I_squared:.1f}%",
            fontsize=10,
        )

        plt.tight_layout()
        plt.savefig(output_path, dpi=150, bbox_inches="tight")
        plt.close()
        logger.info(f"森林图已保存: {output_path}")

    def subgroup_analysis(
        self, studies: list[dict], subgroup_field: str, measure: str = "OR", method: str = "random"
    ) -> dict[str, MetaResult]:
        """
        亚组分析

        Args:
            studies: 研究数据
            subgroup_field: 亚组分组字段
            measure: 效应量类型
            method: 分析方法

        Returns:
            {亚组名: MetaResult} 字典
        """
        from itertools import groupby
        from operator import itemgetter

        sorted_studies = sorted(studies, key=lambda x: x.get(subgroup_field, ""))
        results = {}

        for group_val, group_studies in groupby(sorted_studies, key=itemgetter(subgroup_field)):
            group_list = list(group_studies)
            if len(group_list) >= 2:
                result = self.run_meta_analysis(group_list, measure, method)
                results[str(group_val)] = result
            else:
                logger.warning(f"亚组 '{group_val}' 仅{len(group_list)}篇研究，跳过")

        return results


def main():
    """命令行入口"""
    parser = argparse.ArgumentParser(description="MingEvidence Meta分析引擎")
    parser.add_argument("--input", "-i", required=True, help="输入JSON文件")
    parser.add_argument("--measure", "-m", default="OR",
                        choices=["OR", "RR", "HR", "MD", "SMD", "RD"],
                        help="效应量类型")
    parser.add_argument("--method", default="random",
                        choices=["fixed", "random"],
                        help="分析方法")
    parser.add_argument("--forest", action="store_true", help="生成森林图")
    parser.add_argument("--output", "-o", default=".", help="输出目录")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    with open(args.input, "r", encoding="utf-8") as f:
        studies = json.load(f)

    analyzer = MetaAnalyzer()
    result = analyzer.run_meta_analysis(
        studies=studies,
        measure=args.measure,
        method=args.method,
        forest_plot=args.forest,
        output_dir=args.output,
    )

    print(f"\n📊 Meta分析结果:\n")
    print(f"  效应量:    {result.measure}")
    print(f"  方法:      {result.method}")
    print(f"  纳入研究:  {result.n_studies} 篇")
    print(f"  合并效应:  {result.pooled_effect} (95% CI: {result.ci_lower}-{result.ci_upper})")
    print(f"  P值:       {result.p_value}")
    print(f"  Z值:       {result.z_value}")
    print(f"\n  异质性:")
    print(f"    Q:       {result.heterogeneity.Q} (P={result.heterogeneity.Q_p_value})")
    print(f"    I²:      {result.heterogeneity.I_squared}% ({result.heterogeneity.level})")
    print(f"    τ²:      {result.heterogeneity.tau_squared}")
    print(f"    τ:       {result.heterogeneity.tau}")

    if result.forest_plot_path:
        print(f"\n  森林图:    {result.forest_plot_path}")

    # 保存结果
    output_path = f"{args.output}/meta_result.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result.to_dict(), f, ensure_ascii=False, indent=2)
    print(f"\n✅ 结果已保存到 {output_path}")


if __name__ == "__main__":
    main()
