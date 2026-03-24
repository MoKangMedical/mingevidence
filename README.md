# 明证 MingEvidence

面向中国医生的 AI 临床证据平台。

这是一个从 0 到 1 启动的中国版 OpenEvidence 项目骨架，当前已经包含：

- 品牌与产品定位
- 证据搜索首页与结果页
- DeepConsult 工作台原型
- 医生登录、反馈和审计日志
- `/api/search` 和 `/api/consult` 两个受保护接口
- 统一 evidence schema 与 ingestion pipeline
- 产品与系统架构文档

## 名字

- 中文名：明证
- 英文工作名：MingEvidence

含义是“让证据更明，让临床判断更稳”。

## 本地运行

```bash
pnpm install
pnpm refresh:official-sources
pnpm ingest:evidence
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 演示账号

- `lin.oncology@mingzheng.local` / `doctor123`
- `zhou.cardio@mingzheng.local` / `oncology2026`

## 页面

- `/`：产品首页
- `/search`：证据搜索页
- `/deep-consult`：复杂病例 DeepConsult 工作台
- `/progress`：本地化进展看板

## GitHub 与 Pages

- GitHub 仓库名：`mingevidence`
- GitHub Pages：公开展示站，只承载项目进展、知识底座覆盖和 package insert 解析状态
- 本地 Next 应用：承载登录、搜索、DeepConsult 和 `/api/*` 等动态能力，不直接部署到 GitHub Pages

发布静态展示页：

```bash
pnpm build:pages-site
```

生成目录：

- `site-dist/index.html`
- `site-dist/404.html`
- `site-dist/.nojekyll`

GitHub Actions 工作流：

- [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml)

## API

- `/api/search?q=肺癌二线治疗证据`
- `/api/consult`
- `/api/feedback`
- `/api/auth/login`
- `/api/auth/logout`

以上接口当前都以医生 cookie 会话为前提，其中 `/api/search` 已经接入：

- 正式来源采集后的本地统一证据库检索
- 中国指南、NMPA 文件、FDA 标签统一纳管
- PubMed 摘要级实时补充
- 高风险问题拒答
- 搜索审计日志

另外，项目现在还提供一条中国人群分层信号同步链路：

- `pnpm sync:population-signals`
- 从 PubMed 持续拉取 `China/Chinese cohort` 相关证据
- 生成 `data/normalized/population-signals.json`
- 用于风险预测、预警、诊断、治疗选择、疗效监测和复发随访的结构化底座

项目现在还提供正式源自动化更新入口：

- `pnpm refresh:official-sources`
- 读取 `data/automation/source-refresh.jobs.json`
- 自动检查“中国指南正文更新”“NMPA 具体药品官方源更新”和“NMPA package insert 直链更新”三类任务的覆盖缺口
- 同步 `data/automation/package-insert-priority.targets.json`，补全肿瘤、抗凝、糖尿病、感染等高价值药品的官方药品库候选池
- 输出 `data/normalized/source-automation-report.json`
- 输出 `data/normalized/package-insert-priority-report.json`
- 追加运行日志到 `data/runtime/source-automation-log.ndjson`
- 追加候选池运行日志到 `data/runtime/package-insert-priority-log.ndjson`
- 然后重新执行 `ingest:evidence`，刷新统一证据库与 chunk 数据

仓库里还附带两条调度链路：

- GitHub Actions: [`.github/workflows/refresh-official-sources.yml`](./.github/workflows/refresh-official-sources.yml)
  每天北京时间 `02:15` 运行一次正式源刷新、人口信号同步和构建校验，并上传 artifacts。
- Cron 包装脚本: [`scripts/cron-refresh-official-sources.sh`](./scripts/cron-refresh-official-sources.sh)
  适合挂到服务器 `crontab`，自带简单锁和运行日志。

示例 `crontab`：

```cron
15 2 * * * cd /Users/linzhang/Desktop/      OPC/mingzheng && /bin/bash scripts/cron-refresh-official-sources.sh
```

第一批已经纳入的正文级/具体药品官方源包括：

- CSCO 原发性肺癌诊疗指南 2016.V1 正文 PDF
- CSC 非 ST 段抬高型急性冠脉综合征诊断和治疗指南（2024）正文 PDF
- NMPA 对 Limertinib、Ongericimab、Ganagliflozin Proline 的药品级官方批准页面
- NMPA 九价人乳头瘤病毒疫苗（酿酒酵母）核准说明书 PDF 直链
- NMPA 吸附无细胞百白破联合疫苗核准说明书 PDF 直链

第三批高价值 package insert 候选池已纳入自动发现：

- 肿瘤：甲磺酸奥希替尼片
- 抗凝：阿哌沙班片、利伐沙班片
- 糖尿病：达格列净片、司美格鲁肽注射液
- 感染：美罗培南、注射用头孢他啶阿维巴坦钠

## 文档

- [docs/01_品牌与命名.md](./docs/01_品牌与命名.md)
- [docs/02_系统架构.md](./docs/02_系统架构.md)
- [docs/03_0到1路线.md](./docs/03_0到1路线.md)
- [docs/04_知识底座蓝图.md](./docs/04_知识底座蓝图.md)
- [docs/05_平台产品架构.md](./docs/05_平台产品架构.md)

## 下一步

1. 把中国指南、NMPA 和 FDA 文件正式源扩展到更多病种与药物
2. 在 chunk rerank 之上接入向量召回和 cross-encoder 重排
3. 把中国人群分层信号接进 DeepConsult 和预警模块
4. 接入数据库替代本地文件日志与会话
