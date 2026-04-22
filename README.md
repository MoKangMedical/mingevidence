# MingEvidence

医学证据挖掘平台 — 从海量文献中精准提取临床证据

## 一句话定义

MingEvidence 不卖文献检索工具，卖结构化临床证据。输入PICO问题，输出按GRADE分级的证据摘要。

## 核心能力

- 文献自动检索: PubMed/Cochrane/ClinicalTrials
- 纳入排除筛选: AI辅助文献筛选
- 数据自动提取: 效应量/CI/样本量
- 偏倚评估: ROB2/Newcastle-Ottawa
- 证据合成: Meta分析+森林图

## 快速开始

    git clone https://github.com/MoKangMedical/mingevidence.git
    cd mingevidence
    pip install -r requirements.txt
    python src/main.py --pico "GLP-1 AND cardiovascular"

MIT License
