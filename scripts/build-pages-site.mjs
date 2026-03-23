import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const normalizedDir = path.join(repoRoot, "data", "normalized");
const outDir = path.join(repoRoot, "site-dist");

async function loadJson(fileName) {
  const content = await readFile(path.join(normalizedDir, fileName), "utf8");
  return JSON.parse(content);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function escapeHtml(input) {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusLabel(status) {
  switch (status) {
    case "healthy":
      return "运行正常";
    case "awaiting_direct_link_verification":
      return "待核验直链";
    case "verified":
      return "已核验";
    case "canonical_candidate_selected":
      return "主候选已选出";
    default:
      return status;
  }
}

function renderMetricCard(item) {
  return `
    <article class="metric-card">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <p>${escapeHtml(item.detail)}</p>
    </article>
  `;
}

function renderJobCard(job) {
  return `
    <article class="job-card">
      <div class="job-card__head">
        <h3>${escapeHtml(job.title)}</h3>
        <span class="status-chip ${job.status === "healthy" ? "status-chip--green" : "status-chip--red"}">
          ${escapeHtml(statusLabel(job.status))}
        </span>
      </div>
      <div class="job-stats">
        <div><strong>${job.activeSourceCount}</strong><span>活跃来源</span></div>
        <div><strong>${job.preferredSourceCount}</strong><span>优选来源</span></div>
      </div>
      <ul class="compact-list">
        ${job.preferredSources.slice(0, 3).map((source) => `<li>${escapeHtml(source.title)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function renderPriorityCard(target) {
  const candidate = target.canonicalCandidate;
  const tokens = (target.canonicalSearchTerms ?? [])
    .map((term) => `<span class="token-chip">${escapeHtml(term)}</span>`)
    .join("");

  return `
    <article class="priority-card">
      <div class="priority-card__head">
        <div>
          <span class="category">${escapeHtml(target.category)}</span>
          <h3>${escapeHtml(target.label)}</h3>
        </div>
        <span class="status-chip status-chip--amber">${escapeHtml(statusLabel(target.status))}</span>
      </div>
      <p class="priority-card__query">${escapeHtml(target.query)}</p>
      ${
        candidate
          ? `
        <dl class="definition-grid">
          <div><dt>批准文号</dt><dd>${escapeHtml(candidate.approvalNumber)}</dd></div>
          <div><dt>品牌 / 包装</dt><dd>${escapeHtml(candidate.brandName || "未命名")} / ${escapeHtml(candidate.packSize || candidate.specification)}</dd></div>
          <div><dt>渠道</dt><dd>${escapeHtml(candidate.channel === "import" ? "进口药库" : "国产药库")}</dd></div>
          <div><dt>批准日期</dt><dd>${escapeHtml(candidate.approvedAt)}</dd></div>
        </dl>
        <div class="token-row">${tokens}</div>
      `
          : `<p>当前还没有主候选。</p>`
      }
      <p class="priority-card__note">${escapeHtml(target.resolverNotes ?? "")}</p>
    </article>
  `;
}

function renderInventoryRow(item) {
  return `
    <article class="inventory-row">
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.id)}</span>
      </div>
      <span>${escapeHtml(item.sourceType)}</span>
      <span>${escapeHtml(item.publishedAt)}</span>
      <span>${escapeHtml(item.chunkCount)}</span>
    </article>
  `;
}

function renderHtml(model) {
  const metricsHtml = model.metrics.map(renderMetricCard).join("");
  const jobsHtml = model.jobs.map(renderJobCard).join("");
  const prioritiesHtml = model.priorityTargets.map(renderPriorityCard).join("");
  const mixHtml = model.sourceMix
    .map(
      (item) => `
        <article class="mix-card">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.count)}</strong>
        </article>
      `,
    )
    .join("");
  const inventoryHtml = model.inventory.map(renderInventoryRow).join("");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>明证 MingEvidence | GitHub Pages</title>
    <meta name="description" content="中国版 OpenEvidence 项目的公开展示页，展示官方源进展、统一证据库规模和 package insert 解析状态。" />
    <style>
      :root {
        --bg: #f8fafc;
        --paper: rgba(255, 255, 255, 0.96);
        --ink: #0f172a;
        --ink-soft: #475569;
        --line: rgba(148, 163, 184, 0.2);
        --accent: #1e40af;
        --pine: #0f766e;
        --cream: #f8fafc;
        --sky: #3b82f6;
        --cyan: #06b6d4;
        --shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
        --radius-xl: 30px;
        --radius-lg: 22px;
        --radius-md: 16px;
        --max-width: 1220px;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(59, 130, 246, 0.14), transparent 28%),
          radial-gradient(circle at top right, rgba(6, 182, 212, 0.12), transparent 34%),
          linear-gradient(180deg, #f8fbff 0%, #f1f5f9 100%);
        color: var(--ink);
        font-family: "Inter", "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      a { color: inherit; text-decoration: none; }
      .shell { width: min(calc(100% - 32px), var(--max-width)); margin: 0 auto; padding: 28px 0 72px; }
      .header,
      .hero,
      .metric-card,
      .job-card,
      .priority-card,
      .mix-card,
      .inventory,
      .footer-card {
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        background: var(--paper);
        box-shadow: var(--shadow);
      }
      .header {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: center;
        padding: 16px 20px;
        margin-bottom: 28px;
        border-radius: 999px;
        background: rgba(255,255,255,0.92);
        backdrop-filter: blur(18px);
      }
      .brand { display: flex; gap: 14px; align-items: center; }
      .brand-mark {
        width: 52px; height: 52px; border-radius: 18px;
        display: inline-flex; align-items: center; justify-content: center;
        background: linear-gradient(145deg, #1e3a8a, #2563eb 62%, #0ea5e9);
        color: var(--cream); font-size: 1.4rem; font-weight: 700; letter-spacing: .12em;
      }
      .brand-meta strong { display: block; font-size: .98rem; letter-spacing: .08em; text-transform: uppercase; }
      .brand-meta span { color: var(--ink-soft); font-size: .9rem; }
      .header-links { display: flex; gap: 12px; flex-wrap: wrap; }
      .header-links a {
        min-height: 42px; padding: 0 16px; border-radius: 999px;
        display: inline-flex; align-items: center; justify-content: center;
        background: linear-gradient(135deg, var(--accent), #1d4ed8); color: var(--cream);
        box-shadow: 0 10px 24px rgba(37, 99, 235, .18);
      }
      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(320px, .9fr);
        gap: 24px;
        padding: 32px;
        margin-bottom: 26px;
        background:
          linear-gradient(135deg, rgba(255,255,255,.98), rgba(248,250,252,.96)),
          radial-gradient(circle at top right, rgba(59,130,246,.12), transparent 34%);
      }
      .eyebrow {
        display: inline-block;
        margin-bottom: 16px;
        color: var(--accent);
        font-size: .8rem;
        font-weight: 700;
        letter-spacing: .16em;
        text-transform: uppercase;
      }
      h1, h2, h3 {
        margin: 0;
        font-family: "Inter", "Noto Sans SC", "PingFang SC", sans-serif;
        letter-spacing: -.04em;
      }
      .hero h1 { font-size: clamp(2.6rem, 5vw, 4.4rem); line-height: .95; margin-bottom: 14px; }
      .hero p { color: var(--ink-soft); line-height: 1.8; }
      .hero-meta { display: grid; gap: 14px; }
      .hero-pill, .stage-box {
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        padding: 18px 20px;
        background: rgba(255, 255, 255, .96);
      }
      .hero-pill span, .stage-box span {
        display: block;
        margin-bottom: 8px;
        color: var(--ink-soft);
        font-size: .82rem;
        font-weight: 700;
        letter-spacing: .08em;
        text-transform: uppercase;
      }
      .hero-pill strong, .stage-box strong { font-size: 1.04rem; line-height: 1.5; }
      .metrics, .jobs, .priorities, .mix {
        display: grid; gap: 18px;
      }
      .metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 28px; }
      .metric-card { min-height: 180px; padding: 24px; }
      .metric-card span, .mix-card span, .inventory-head span { color: var(--ink-soft); font-size: .84rem; }
      .metric-card strong, .mix-card strong { color: var(--accent); }
      .metric-card strong, .mix-card strong { display: block; margin: 14px 0 10px; font-size: 1.5rem; }
      .metric-card p { margin: 0; color: var(--ink-soft); line-height: 1.72; }
      section.block { margin-bottom: 26px; }
      .section-head { max-width: 56rem; margin-bottom: 20px; }
      .section-head h2 { font-size: clamp(2rem, 4vw, 3.1rem); margin-bottom: 14px; }
      .section-head p { margin: 0; color: var(--ink-soft); line-height: 1.78; }
      .jobs, .priorities { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .job-card, .priority-card { padding: 22px; }
      .job-card__head, .priority-card__head {
        display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 14px;
      }
      .category {
        display: inline-block; margin-bottom: 8px; color: var(--accent);
        font-size: .76rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
      }
      .status-chip, .token-chip {
        display: inline-flex; align-items: center; justify-content: center;
        min-height: 34px; padding: 0 12px; border-radius: 999px;
        font-size: .84rem; font-weight: 700;
      }
      .status-chip--green { background: rgba(26,74,67,.14); color: var(--pine); }
      .status-chip--amber { background: rgba(30,64,175,.1); color: var(--accent); }
      .status-chip--red { background: rgba(191,30,46,.1); color: #bf1e2e; }
      .job-stats {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px; margin: 16px 0;
      }
      .job-stats div, .definition-grid div {
        padding: 14px; border-radius: 16px; background: rgba(241,245,249,.92);
      }
      .job-stats strong, .definition-grid dd { display: block; font-weight: 700; }
      .job-stats span, .definition-grid dt { color: var(--ink-soft); font-size: .86rem; }
      .compact-list, .inventory-list {
        list-style: none; padding: 0; margin: 0; display: grid; gap: 10px;
      }
      .compact-list li {
        position: relative; padding-left: 18px; color: var(--ink-soft); line-height: 1.72;
      }
      .compact-list li::before {
        content: ""; position: absolute; top: .72rem; left: 0; width: 8px; height: 8px;
        border-radius: 999px; background: var(--sky);
      }
      .priority-card__query, .priority-card__note { color: var(--ink-soft); line-height: 1.72; }
      .priority-card__query { margin: 0 0 16px; }
      .priority-card__note { margin: 16px 0 0; }
      .definition-grid {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px;
      }
      .definition-grid dt { margin-bottom: 6px; }
      .definition-grid dd { margin: 0; line-height: 1.5; }
      .token-row { display: flex; flex-wrap: wrap; gap: 10px; }
      .token-chip { background: rgba(30,64,175,.08); color: var(--accent); }
      .mix { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 20px; }
      .mix-card { padding: 18px 20px; }
      .inventory { overflow: hidden; }
      .inventory-head, .inventory-row {
        display: grid;
        grid-template-columns: minmax(0, 2.4fr) 1fr .9fr .6fr;
        gap: 16px; align-items: center; padding: 16px 20px;
      }
      .inventory-head {
        background: rgba(241,245,249,.92);
        font-size: .82rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
      }
      .inventory-row + .inventory-row { border-top: 1px solid var(--line); }
      .inventory-row strong { display: block; margin-bottom: 4px; }
      .inventory-row span { color: var(--ink-soft); font-size: .92rem; }
      .footer-card {
        margin-top: 28px; padding: 24px 28px;
        display: flex; justify-content: space-between; gap: 20px; align-items: center;
      }
      .footer-card p { margin: 0; color: var(--ink-soft); line-height: 1.72; }
      .footer-card a {
        min-height: 46px; padding: 0 18px; border-radius: 999px;
        display: inline-flex; align-items: center; justify-content: center;
        background: linear-gradient(135deg, var(--accent), #1d4ed8); color: var(--cream);
        box-shadow: 0 10px 24px rgba(37, 99, 235, .18);
      }
      @media (max-width: 1120px) {
        .hero, .metrics, .jobs, .priorities, .mix { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .hero > :first-child { grid-column: 1 / -1; }
      }
      @media (max-width: 820px) {
        .shell { width: min(calc(100% - 20px), var(--max-width)); padding-top: 14px; }
        .header, .hero, .metrics, .jobs, .priorities, .mix, .definition-grid, .inventory-head, .inventory-row, .footer-card {
          grid-template-columns: 1fr;
          flex-direction: column;
        }
        .header, .job-card, .priority-card, .metric-card, .mix-card, .hero, .footer-card { padding: 22px; border-radius: 24px; }
        .header { border-radius: 28px; align-items: stretch; }
        .header-links { flex-direction: column; }
        .job-card__head, .priority-card__head { flex-direction: column; align-items: stretch; }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="header">
        <div class="brand">
          <span class="brand-mark">明</span>
          <div class="brand-meta">
            <strong>MingEvidence</strong>
            <span>中国版 OpenEvidence 的公开展示站</span>
          </div>
        </div>
        <nav class="header-links">
          <a href="#progress">项目进展</a>
          <a href="#corpus">证据库构成</a>
        </nav>
      </header>

      <section class="hero">
        <div>
          <span class="eyebrow">GitHub Pages</span>
          <h1>明证 MingEvidence</h1>
          <p>${escapeHtml(model.hero.statement)}</p>
        </div>
        <div class="hero-meta">
          <div class="hero-pill">
            <span>进展刷新</span>
            <strong>${escapeHtml(model.hero.lastUpdatedAt)}</strong>
          </div>
          <div class="hero-pill">
            <span>证据库刷新</span>
            <strong>${escapeHtml(model.hero.corpusUpdatedAt)}</strong>
          </div>
          <div class="stage-box">
            <span>当前阶段</span>
            <strong>从官方药品库锁定主候选，继续追 package insert 官方附件 URL</strong>
          </div>
        </div>
      </section>

      <section class="metrics">${metricsHtml}</section>

      <section class="block" id="progress">
        <div class="section-head">
          <span class="eyebrow">Priority Resolver</span>
          <h2>三条一级优先药当前进度</h2>
          <p>这里直接展示 package insert 解析器当前选出来的主候选批准文号、品牌和包装形态。</p>
        </div>
        <div class="priorities">${prioritiesHtml}</div>
      </section>

      <section class="block">
        <div class="section-head">
          <span class="eyebrow">Official Sources</span>
          <h2>正式源自动化健康度</h2>
          <p>这部分是仓库内真实运行结果，不是手工维护表格。</p>
        </div>
        <div class="jobs">${jobsHtml}</div>
      </section>

      <section class="block" id="corpus">
        <div class="section-head">
          <span class="eyebrow">Corpus</span>
          <h2>当前本地证据库构成</h2>
          <p>这里显示搜索页当前能命中的正式证据底座规模和来源分布。</p>
        </div>
        <div class="mix">${mixHtml}</div>
        <div class="inventory">
          <div class="inventory-head">
            <span>来源</span>
            <span>类型</span>
            <span>发布日期</span>
            <span>Chunk</span>
          </div>
          ${inventoryHtml}
        </div>
      </section>

      <section class="footer-card">
        <div>
          <span class="eyebrow">Repository</span>
          <p>GitHub Pages 只展示静态进展看板。本地完整系统仍保留 Next 搜索、DeepConsult、医生登录和 API 能力。</p>
        </div>
        <a href="${escapeHtml(model.repoUrl)}">查看 GitHub 仓库</a>
      </section>
    </main>
  </body>
</html>`;
}

async function main() {
  const [automation, priority, sync] = await Promise.all([
    loadJson("source-automation-report.json"),
    loadJson("package-insert-priority-report.json"),
    loadJson("source-sync-report.json"),
  ]);

  const verifiedPackageInserts = sync.sources.filter(
    (item) => item.sourceType === "drug_label" && item.documentClass === "drug_label",
  );
  const repoSlug = process.env.GITHUB_REPOSITORY || "";
  const repoUrl = repoSlug ? `https://github.com/${repoSlug}` : "#";

  const model = {
    hero: {
      lastUpdatedAt: formatDateTime(priority.generatedAt),
      corpusUpdatedAt: formatDateTime(sync.syncFinishedAt),
      statement:
        "当前页面展示的是仓库本地真实跑出来的自动化结果，包括官方源健康度、统一证据库规模，以及三条优先药的 package insert 解析状态。",
    },
    metrics: [
      {
        label: "自动化任务",
        value: `${automation.summary.healthyJobs}/${automation.summary.totalJobs}`,
        detail: "正式源更新任务健康运行",
      },
      {
        label: "统一证据库",
        value: `${sync.recordCount} 条`,
        detail: `${sync.sourceCount} 个正式来源，${sync.chunkCount} 个 chunk`,
      },
      {
        label: "已核验直链",
        value: `${verifiedPackageInserts.length} 条`,
        detail: "NMPA package insert 官方 PDF 直链",
      },
      {
        label: "一级优先药",
        value: `${priority.summary.priorityTier1Targets} 条`,
        detail: `${priority.summary.priorityTier1AwaitingDirectLinks} 条待核验附件 URL`,
      },
    ],
    jobs: automation.jobs,
    priorityTargets: priority.targets.filter((item) => item.priorityTier === 1),
    sourceMix: [
      { label: "中国指南", count: sync.sources.filter((item) => item.sourceType === "china_guideline").length },
      { label: "NMPA 核准", count: sync.sources.filter((item) => item.sourceType === "nmpa_drug_notice").length },
      { label: "Package Insert", count: verifiedPackageInserts.length },
      { label: "FDA 标签", count: sync.sources.filter((item) => item.sourceType === "fda_label").length },
    ],
    inventory: sync.sources,
    repoUrl,
  };

  await mkdir(outDir, { recursive: true });
  const html = renderHtml(model);
  await writeFile(path.join(outDir, "index.html"), `${html}\n`, "utf8");
  await writeFile(path.join(outDir, "404.html"), `${html}\n`, "utf8");
  await writeFile(path.join(outDir, ".nojekyll"), "", "utf8");

  console.log(`Wrote GitHub Pages site to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
