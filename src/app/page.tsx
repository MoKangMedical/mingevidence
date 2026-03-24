import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import {
  architectureLayers,
  brandSummary,
  executionRoadmap,
  landingStats,
  platformFlows,
  platformModules,
  productPillars,
} from "@/lib/platform-data";

export default function Home() {
  return (
    <main className="app-shell">
      <div className="aurora aurora--left" />
      <div className="aurora aurora--right" />
      <SiteHeader current="home" />

      <section className="hero">
        <div className="hero__copy">
          <span className="eyebrow">China Clinical Evidence Platform</span>
          <h1>
            {brandSummary.name}
            <span>{brandSummary.englishName}</span>
          </h1>
          <p className="hero__lede">{brandSummary.promise}</p>
          <p className="hero__detail">
            这是一套按 OpenEvidence 模式启动的中国版产品骨架。第一版先做医生专属的证据搜索和
            DeepConsult 工作台，再逐步接入真实数据源、检索后端和医院级治理能力。
          </p>
          <div className="hero__actions">
            <Link href="/search">进入证据搜索</Link>
            <Link href="/cases">进入病例工作台</Link>
            <Link href="/deep-consult">查看 DeepConsult</Link>
          </div>
        </div>

        <form className="query-panel" action="/search">
          <label htmlFor="hero-query">从一个真实临床问题开始</label>
          <textarea
            id="hero-query"
            name="q"
            rows={5}
            defaultValue="EGFR 突变肺癌二线耐药后，合并轻度肾功能下降的患者，当前最可执行的中国本地证据路径是什么？"
          />
          <div className="query-panel__footer">
            <span>输出格式：结构化结论 + 证据卡片 + 风险边界</span>
            <button type="submit">生成首版结果</button>
          </div>
        </form>
      </section>

      <section className="stats-grid">
        {landingStats.map((item) => (
          <article className="stat-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <span className="eyebrow">Product Pillars</span>
          <h2>先做可信度，再做规模</h2>
          <p>
            明证的第一原则不是“能答很多问题”，而是“医生愿意把它当成证据入口反复打开”。因此产品从第一天就围绕可信度和工作流来设计。
          </p>
        </div>
        <div className="pillar-grid">
          {productPillars.map((pillar) => (
            <article className="pillar-card" key={pillar.title}>
              <h3>{pillar.title}</h3>
              <p>{pillar.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block section-block--muted">
        <div className="section-heading">
          <span className="eyebrow">Platform Modules</span>
          <h2>把演示页扩成医生真的会反复打开的平台</h2>
          <p>
            真正可用的临床产品，不是只有一个搜索框，而是把搜索、病例、药品、预警和机构治理放到同一个连续工作流里。
          </p>
        </div>
        <div className="pillar-grid">
          {platformModules.map((module) => (
            <article className="pillar-card" key={module.name}>
              <span>{module.audience}</span>
              <h3>{module.name}</h3>
              <p>{module.value}</p>
              <p className="pillar-card__visual">{module.visualization}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block section-block--muted">
        <div className="section-heading">
          <span className="eyebrow">0-90 Days</span>
          <h2>从 0 到 1 的执行路径已经拆开</h2>
          <p>我已经把创业动作和产品动作合到一套路线里，下一步可以直接按这个节奏往试点推进。</p>
        </div>
        <div className="roadmap-grid">
          {executionRoadmap.map((item) => (
            <article className="roadmap-card" key={item.phase}>
              <span>{item.phase}</span>
              <h3>{item.objective}</h3>
              <ul className="bullet-list">
                {item.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <span className="eyebrow">User Journeys</span>
          <h2>平台要围绕场景闭环，而不是围绕接口闭环</h2>
          <p>
            首页、搜索、DeepConsult 只是入口。真正决定用户留存的，是门诊、住院、药品核查和机构更新能不能连成一条线。
          </p>
        </div>
        <div className="roadmap-grid">
          {platformFlows.map((flow) => (
            <article className="roadmap-card" key={flow.title}>
              <span>{flow.trigger}</span>
              <h3>{flow.title}</h3>
              <ul className="bullet-list">
                {flow.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block section-block--muted">
        <div className="section-heading">
          <span className="eyebrow">Architecture</span>
          <h2>产品架构需要从“答案生成”升级到“临床平台”</h2>
          <p>
            底层仍然是知识底座和检索引擎，但上层必须加上病例会话、机构治理和标准化集成，才能真正进入医院工作流。
          </p>
        </div>
        <div className="roadmap-grid">
          {architectureLayers.map((item) => (
            <article className="roadmap-card" key={item.layer}>
              <span>{item.layer}</span>
              <h3>{item.capability}</h3>
              <p>{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cta-strip">
        <div>
          <span className="eyebrow">Repository</span>
          <h2>现在这不是概念稿，而是一个可以继续开发的起点。</h2>
          <p>
            你可以继续在这个仓库上接真实检索服务、医生登录、内容治理和医院试点能力。
          </p>
        </div>
        <div className="cta-strip__actions">
          <a href="/api/search?q=房颤合并冠心病抗栓路径">查看 Search API</a>
          <a href="/api/consult">查看 Consult API</a>
        </div>
      </section>
    </main>
  );
}
