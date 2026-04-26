# 🔬 MingEvidence — 医学证据挖掘平台

> **从海量文献中精准提取临床证据，输入PICO问题，输出按GRADE分级的证据摘要**

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://python.org)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## 🎯 核心能力

| # | 功能 | 说明 |
|---|------|------|
| 1 | **文献检索** | 自动检索 PubMed / Cochrane / ClinicalTrials |
| 2 | **PICO提取** | 从临床问题自动提取 Population / Intervention / Comparison / Outcome 要素 |
| 3 | **文献筛选** | AI辅助纳入/排除筛选，减少人工筛选工作量 |
| 4 | **数据提取** | 自动提取效应量(OR/RR/MD)、95% CI、样本量 |
| 5 | **偏倚评估** | ROB2 (RCT) / Newcastle-Ottawa (观察性研究) 自动评估 |
| 6 | **证据合成** | 随机效应/固定效应 Meta分析 + 森林图生成 |
| 7 | **GRADE分级** | 基于五大维度的证据质量自动分级 |
| 8 | **报告生成** | 自动生成符合 PRISMA 2020 的系统综述报告 |

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────┐
│                   用户界面层                         │
│  Next.js 15 (App Router) + Streamlit (实验界面)      │
├─────────────────────────────────────────────────────┤
│                   API 网关层                         │
│  Next.js API Routes / FastAPI (Python)               │
├─────────────────────────────────────────────────────┤
│                   证据处理引擎                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ 文献检索  │ │ PICO提取 │ │ 数据提取  │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ 偏倚评估  │ │ Meta分析 │ │ GRADE分级 │            │
│  └──────────┘ └──────────┘ └──────────┘            │
├─────────────────────────────────────────────────────┤
│                   数据层                             │
│  JSON种子数据 / SQLite / PubMed API                  │
└─────────────────────────────────────────────────────┘
```

## 📁 项目结构

```
mingevidence/
├── src/                          # Next.js 前端
│   ├── app/                      # App Router 页面
│   │   ├── page.tsx              # 首页
│   │   ├── search/page.tsx       # 文献搜索
│   │   ├── cases/page.tsx        # 病例管理
│   │   └── deep-consult/page.tsx # 深度咨询
│   ├── components/               # UI 组件
│   │   ├── evidence-card.tsx     # 证据卡片
│   │   ├── search-feedback.tsx   # 搜索反馈
│   │   └── site-header.tsx       # 站点头部
│   └── lib/                      # 核心逻辑
│       ├── evidence-schema.ts    # 证据Schema
│       ├── search-service.ts     # 搜索服务
│       └── platform-data.ts      # 平台数据
├── src_py/                       # Python 证据处理引擎
│   ├── __init__.py
│   ├── search_engine.py          # PubMed/Cochrane 检索
│   ├── pico_extractor.py         # PICO要素提取
│   ├── data_extractor.py         # 数据提取
│   ├── bias_assessor.py          # 偏倚评估
│   ├── meta_analyzer.py          # Meta分析
│   ├── evidence_grader.py        # GRADE分级
│   └── app.py                    # Streamlit 实验界面
├── data/                         # 数据文件
│   ├── seeds/                    # 种子数据
│   ├── sources/                  # 数据源配置
│   ├── normalized/               # 标准化数据
│   └── pico-templates.json       # PICO模板
├── tests/                        # 测试
│   └── test_basic.py
├── scripts/                      # 脚本
│   ├── ingest-evidence.mjs       # 证据导入
│   └── run-source-refresh.mjs    # 数据源刷新
├── docs/                         # 文档
│   ├── 01_品牌与命名.md
│   ├── 02_系统架构.md
│   └── 03_0到1路线.md
├── package.json                  # Node.js 依赖
├── requirements.txt              # Python 依赖
├── Dockerfile                    # 容器化
├── CONTRIBUTING.md               # 贡献指南
├── CHANGELOG.md                  # 更新日志
└── LICENSE                       # MIT License
```

## 🚀 快速开始

### 前端 (Next.js)

```bash
git clone https://github.com/MoKangMedical/mingevidence.git
cd mingevidence
pnpm install
pnpm dev
```

访问 http://localhost:3000

### Python 证据引擎

```bash
pip install -r requirements.txt

# 运行 Streamlit 实验界面
streamlit run src_py/app.py

# 或直接调用
python -c "
from src_py.search_engine import SearchEngine
engine = SearchEngine()
results = engine.search('GLP-1 AND cardiovascular', max_results=10)
print(f'找到 {len(results)} 篇文献')
"
```

### 命令行使用

```bash
# 搜索文献
python src_py/search_engine.py --query "GLP-1 AND cardiovascular" --max 20

# 提取PICO要素
python src_py/pico_extractor.py --question "GLP-1受体激动剂能否降低心血管事件风险？"

# 运行Meta分析
python src_py/meta_analyzer.py --input data/evidence.json --output results/
```

## 📊 数据流程

```
临床问题 → PICO提取 → 文献检索 → 纳入筛选 → 数据提取 → 偏倚评估 → Meta分析 → GRADE分级 → 报告
```

### 1. PICO要素提取

```python
from src_py.pico_extractor import PICOExtractor

extractor = PICOExtractor()
pico = extractor.extract("GLP-1受体激动剂能否降低2型糖尿病患者的心血管事件风险？")
# {
#   "population": "2型糖尿病患者",
#   "intervention": "GLP-1受体激动剂",
#   "comparison": "安慰剂/标准治疗",
#   "outcome": "心血管事件风险(MACE)"
# }
```

### 2. 文献检索

```python
from src_py.search_engine import SearchEngine

engine = SearchEngine()
results = engine.search(
    query="GLP-1 receptor agonist AND cardiovascular",
    databases=["pubmed", "cochrane"],
    max_results=50
)
```

### 3. Meta分析

```python
from src_py.meta_analyzer import MetaAnalyzer

analyzer = MetaAnalyzer()
result = analyzer.run_meta_analysis(
    studies=[...],
    measure="OR",           # OR/RR/MD/SMD
    method="random",        # random/fixed
    forest_plot=True
)
# 输出: 合并效应量、I²、tau²、森林图
```

### 4. GRADE分级

```python
from src_py.evidence_grader import EvidenceGrader

grader = EvidenceGrader()
grade = grader.assess(
    evidence_type="rct",
    risk_of_bias="low",
    inconsistency="low",
    indirectness="low",
    imprecision="low",
    publication_bias="undetected"
)
# "high" / "moderate" / "low" / "very_low"
```

## 🔧 配置

### 环境变量

```bash
# PubMed API (可选，提升检索速度)
PUBMED_API_KEY=your_ncbi_api_key

# 搜索配置
MAX_SEARCH_RESULTS=100
SEARCH_TIMEOUT=30
```

### 数据源

项目支持多种证据数据源：

| 数据源 | 类型 | 更新频率 |
|--------|------|----------|
| PubMed | 文献数据库 | 实时 |
| Cochrane Library | 系统综述 | 月度 |
| ClinicalTrials.gov | 临床试验 | 周度 |
| FDA Labels | 药品标签 | 月度 |
| NMPA药品说明书 | 国内药品 | 月度 |

## 🧪 测试

```bash
# Python 测试
pytest tests/ -v

# 前端测试
pnpm test
```

## 📖 文档

- [品牌与命名](docs/01_品牌与命名.md)
- [系统架构](docs/02_系统架构.md)
- [0到1路线](docs/03_0到1路线.md)
- [知识底座蓝图](docs/04_知识底座蓝图.md)
- [平台产品架构](docs/05_平台产品架构.md)

## 🤝 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

### 开发流程

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: 添加某功能'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 🔗 相关项目

| 项目 | 定位 |
|------|------|
| [OPC Platform](https://github.com/MoKangMedical/opcplatform) | 一人公司全链路学习平台 |
| [Digital Sage](https://github.com/MoKangMedical/digital-sage) | 与100位智者对话 |
| [Cloud Memorial](https://github.com/MoKangMedical/cloud-memorial) | AI思念亲人平台 |
| [天眼 Tianyan](https://github.com/MoKangMedical/tianyan) | 市场预测平台 |
| [MediChat-RD](https://github.com/MoKangMedical/medichat-rd) | 罕病诊断平台 |
| [MedRoundTable](https://github.com/MoKangMedical/medroundtable) | 临床科研圆桌会 |
| [DrugMind](https://github.com/MoKangMedical/drugmind) | 药物研发数字孪生 |
| [MediPharma](https://github.com/MoKangMedical/medi-pharma) | AI药物发现平台 |
| [Minder](https://github.com/MoKangMedical/minder) | AI知识管理平台 |
| [Biostats](https://github.com/MoKangMedical/Biostats) | 生物统计分析平台 |

## 📄 License

[MIT License](LICENSE) — 自由使用、修改、分发。

---

<p align="center">
  <b>MingEvidence</b> — 让循证医学更高效<br>
  <sub>Built with ❤️ by <a href="https://github.com/MoKangMedical">MoKangMedical</a></sub>
</p>
