"""
MingEvidence Streamlit 实验界面

提供交互式证据挖掘工作流：
1. 输入临床问题
2. 自动提取PICO要素
3. 检索文献
4. 数据提取 & 偏倚评估
5. Meta分析 & GRADE分级
"""

import json
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import streamlit as st
    import pandas as pd
    HAS_STREAMLIT = True
except ImportError:
    HAS_STREAMLIT = False

from src_py.pico_extractor import PICOExtractor
from src_py.search_engine import SearchEngine
from src_py.data_extractor import DataExtractor
from src_py.bias_assessor import BiasAssessor
from src_py.meta_analyzer import MetaAnalyzer
from src_py.evidence_grader import EvidenceGrader


def main():
    if not HAS_STREAMLIT:
        print("请安装 streamlit: pip install streamlit")
        return

    st.set_page_config(
        page_title="MingEvidence — 医学证据挖掘平台",
        page_icon="🔬",
        layout="wide",
    )

    st.title("🔬 MingEvidence — 医学证据挖掘平台")
    st.caption("从海量文献中精准提取临床证据，输入PICO问题，输出按GRADE分级的证据摘要")

    # 侧边栏
    with st.sidebar:
        st.header("⚙️ 配置")
        api_key = st.text_input("PubMed API Key (可选)", type="password")
        max_results = st.slider("最大检索数", 5, 100, 20)
        measure = st.selectbox("效应量类型", ["OR", "RR", "HR", "MD", "SMD"])
        method = st.selectbox("Meta分析方法", ["random", "fixed"])

    # 主界面
    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "📋 PICO提取", "🔍 文献检索", "📊 数据提取", "⚖️ 偏倚评估", "📈 Meta分析"
    ])

    # ── Tab 1: PICO提取 ──────────────────────────────────

    with tab1:
        st.header("📋 PICO要素提取")
        question = st.text_area(
            "输入临床问题",
            placeholder="例: GLP-1受体激动剂能否降低2型糖尿病患者的心血管事件风险？",
            height=100,
        )

        if st.button("提取PICO", type="primary"):
            if question:
                extractor = PICOExtractor()
                pico = extractor.extract(question)

                col1, col2 = st.columns(2)
                with col1:
                    st.subheader("PICO 要素")
                    st.write(f"**P (人群):** {pico.population or '未识别'}")
                    st.write(f"**I (干预):** {pico.intervention or '未识别'}")
                    st.write(f"**C (对照):** {pico.comparison or '未识别'}")
                    st.write(f"**O (结局):** {pico.outcome or '未识别'}")
                    st.write(f"**研究设计:** {pico.study_design or '未识别'}")
                    st.metric("置信度", f"{pico.confidence:.0%}")

                with col2:
                    st.subheader("检索式")
                    st.code(pico.to_query(), language="sql")

                    suggestions = extractor.suggest_refinements(pico)
                    if suggestions:
                        st.subheader("💡 改进建议")
                        for s in suggestions:
                            st.write(s)

                # 存储到session
                st.session_state["pico"] = pico

    # ── Tab 2: 文献检索 ──────────────────────────────────

    with tab2:
        st.header("🔍 文献检索")

        query = st.text_input("检索式", value=st.session_state.get("pico", PICOExtractor().extract("")).to_query() if "pico" in st.session_state else "")
        databases = st.multiselect("数据库", ["pubmed", "cochrane", "clinicaltrials"], default=["pubmed"])

        if st.button("开始检索", type="primary"):
            if query:
                with st.spinner("正在检索..."):
                    engine = SearchEngine(api_key=api_key)
                    results = engine.search(
                        query=query,
                        max_results=max_results,
                        databases=databases,
                    )

                st.success(f"找到 {len(results)} 篇文献")

                if results:
                    df = pd.DataFrame([{
                        "PMID": r.pmid,
                        "标题": r.title[:80] + "..." if len(r.title) > 80 else r.title,
                        "年份": r.year,
                        "期刊": r.journal,
                        "来源": r.source,
                    } for r in results])
                    st.dataframe(df, use_container_width=True)

                    st.session_state["search_results"] = results

    # ── Tab 3: 数据提取 ──────────────────────────────────

    with tab3:
        st.header("📊 数据提取")

        text_input = st.text_area(
            "输入文献摘要（用于提取效应量数据）",
            placeholder="粘贴文献摘要文本...",
            height=200,
        )

        if st.button("提取数据", type="primary"):
            if text_input:
                extractor = DataExtractor()
                study = extractor.extract_from_text(text_input)

                if study.effect_sizes:
                    for es in study.effect_sizes:
                        st.write(f"**{es.measure}:** {es.value} (95% CI: {es.ci_lower}–{es.ci_upper})")
                        if es.p_value < 1:
                            st.write(f"  P = {es.p_value}")
                        if es.n_total > 0:
                            st.write(f"  样本量: {es.n_total}")
                    st.metric("提取置信度", f"{study.extraction_confidence:.0%}")
                else:
                    st.warning("未识别到效应量数据")

    # ── Tab 4: 偏倚评估 ──────────────────────────────────

    with tab4:
        st.header("⚖️ 偏倚评估")

        bias_type = st.radio("研究类型", ["rct (ROB2)", "cohort/case-control (NOS)"])
        bias_text = st.text_area(
            "输入研究方法描述",
            placeholder="描述随机化方法、盲法、随访等...",
            height=200,
        )

        if st.button("评估偏倚", type="primary"):
            if bias_text:
                assessor = BiasAssessor()

                if "rct" in bias_type:
                    result = assessor.assess_rob2(bias_text)
                    st.write(f"**总体判断:** {result.overall_judgment}")
                    for domain in result.domains:
                        st.write(f"  • {domain.name}: {domain.judgment}")
                else:
                    result = assessor.assess_nos(bias_text)
                    st.write(f"**NOS评分:** {result.total_stars}/{result.max_stars} 星")
                    st.write(f"**质量等级:** {result.quality}")

    # ── Tab 5: Meta分析 ──────────────────────────────────

    with tab5:
        st.header("📈 Meta分析")

        st.info("输入各研究的效应量数据进行Meta分析")

        n_studies = st.number_input("研究数量", 2, 50, 3)
        studies_data = []

        for i in range(n_studies):
            col1, col2, col3 = st.columns(3)
            with col1:
                sid = st.text_input(f"研究{i+1} ID", key=f"sid_{i}", value=f"Study {i+1}")
            with col2:
                effect = st.number_input(f"效应量", key=f"eff_{i}", value=1.0, format="%.4f")
            with col3:
                se = st.number_input(f"标准误", key=f"se_{i}", value=0.1, format="%.4f")
            studies_data.append({"study_id": sid, "effect": effect, "se": se})

        if st.button("运行Meta分析", type="primary"):
            if len(studies_data) >= 2:
                analyzer = MetaAnalyzer()
                result = analyzer.run_meta_analysis(
                    studies=studies_data,
                    measure=measure,
                    method=method,
                )

                col1, col2, col3 = st.columns(3)
                with col1:
                    st.metric(f"合并{measure}", f"{result.pooled_effect:.4f}")
                with col2:
                    st.metric("95% CI", f"{result.ci_lower:.4f}–{result.ci_upper:.4f}")
                with col3:
                    st.metric("I²", f"{result.heterogeneity.I_squared:.1f}%")

                st.write(f"**P值:** {result.p_value}")
                st.write(f"**Z值:** {result.z_value}")

                # GRADE分级
                grader = EvidenceGrader()
                grade = grader.assess_from_meta_result(result.to_dict())
                st.write(f"**GRADE:** {grade.score_label}")

    # ── Footer ───────────────────────────────────────────

    st.divider()
    st.caption("🔬 MingEvidence — 循证医学证据挖掘平台 | [GitHub](https://github.com/MoKangMedical/mingevidence)")


if __name__ == "__main__":
    main()
