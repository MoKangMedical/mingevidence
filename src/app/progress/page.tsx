import { SiteHeader } from "@/components/site-header";
import { loadProgressDashboard } from "@/lib/progress-dashboard";

function statusLabel(status: string) {
  switch (status) {
    case "healthy":
      return "运行正常";
    case "awaiting_direct_link_verification":
      return "待核验直链";
    default:
      return status;
  }
}

export default async function ProgressPage() {
  const dashboard = await loadProgressDashboard();

  return (
    <main className="app-shell">
      <div className="aurora aurora--left" />
      <div className="aurora aurora--right" />
      <SiteHeader current="progress" />

      <section className="progress-hero">
        <div className="progress-hero__copy">
          <span className="eyebrow">Local Progress Board</span>
          <h1>本地化工程进展看板</h1>
          <p>{dashboard.hero.statement}</p>
        </div>
        <div className="progress-hero__meta">
          <div className="progress-pill">
            <span>进展刷新</span>
            <strong>{dashboard.hero.lastUpdatedAt}</strong>
          </div>
          <div className="progress-pill">
            <span>证据库刷新</span>
            <strong>{dashboard.hero.corpusUpdatedAt}</strong>
          </div>
          <div className="progress-stage">
            <span>当前阶段</span>
            <strong>从官方药品库锁定主候选，继续追 package insert 官方附件 URL</strong>
          </div>
        </div>
      </section>

      <section className="stats-grid">
        {dashboard.metrics.map((item) => (
          <article className="stat-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <span className="eyebrow">Priority Resolver</span>
          <h2>三条一级优先药当前进度</h2>
          <p>这里直接显示 package insert 解析器当前选出来的主候选批准文号、品牌和包装形态。</p>
        </div>
        <div className="progress-priority-grid">
          {dashboard.priorityTier1.map((item) => (
            <article className="priority-card" key={item.id}>
              <div className="priority-card__head">
                <div>
                  <span className="priority-card__category">{item.category}</span>
                  <h3>{item.label}</h3>
                </div>
                <span className="status-chip status-chip--amber">{statusLabel(item.status)}</span>
              </div>
              <p className="priority-card__query">{item.query}</p>
              {item.canonicalCandidate ? (
                <>
                  <dl className="progress-definition-list">
                    <div>
                      <dt>批准文号</dt>
                      <dd>{item.canonicalCandidate.approvalNumber}</dd>
                    </div>
                    <div>
                      <dt>品牌 / 包装</dt>
                      <dd>
                        {item.canonicalCandidate.brandName || "未命名"} /{" "}
                        {item.canonicalCandidate.packSize || item.canonicalCandidate.specification}
                      </dd>
                    </div>
                    <div>
                      <dt>渠道</dt>
                      <dd>{item.canonicalCandidate.channel === "import" ? "进口药库" : "国产药库"}</dd>
                    </div>
                    <div>
                      <dt>批准日期</dt>
                      <dd>{item.canonicalCandidate.approvedAt}</dd>
                    </div>
                  </dl>
                  <div className="token-row">
                    {item.canonicalSearchTerms.map((term) => (
                      <span className="token-chip" key={term}>
                        {term}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p>当前还没有主候选。</p>
              )}
              <p className="priority-card__note">{item.resolverNotes}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block section-block--muted">
        <div className="section-heading">
          <span className="eyebrow">Official Sources</span>
          <h2>正式源自动化健康度</h2>
          <p>这部分展示当前三条官方更新任务的实际运行状态和已接入来源数量。</p>
        </div>
        <div className="progress-job-grid">
          {dashboard.officialJobs.map((job) => (
            <article className="job-card" key={job.id}>
              <div className="job-card__head">
                <h3>{job.title}</h3>
                <span className="status-chip status-chip--green">{statusLabel(job.status)}</span>
              </div>
              <div className="job-card__stats">
                <div>
                  <strong>{job.activeSourceCount}</strong>
                  <span>活跃来源</span>
                </div>
                <div>
                  <strong>{job.preferredSourceCount}</strong>
                  <span>优选来源</span>
                </div>
              </div>
              <ul className="bullet-list bullet-list--compact">
                {job.preferredSources.slice(0, 3).map((source) => (
                  <li key={source.id}>{source.title}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <span className="eyebrow">Corpus</span>
          <h2>当前本地证据库构成</h2>
          <p>这里显示的是搜索页当前能命中的真实底座规模和来源分布。</p>
        </div>
        <div className="mix-strip">
          {dashboard.sourceMix.map((item) => (
            <article className="mix-card" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.count}</strong>
            </article>
          ))}
        </div>
        <div className="inventory-table">
          <div className="inventory-table__head">
            <span>来源</span>
            <span>类型</span>
            <span>发布日期</span>
            <span>Chunk</span>
          </div>
          {dashboard.sourceInventory.map((item) => (
            <article className="inventory-table__row" key={item.id}>
              <div>
                <strong>{item.title}</strong>
                <span>{item.id}</span>
              </div>
              <span>{item.sourceType}</span>
              <span>{item.publishedAt}</span>
              <span>{item.chunkCount}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
