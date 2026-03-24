import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { requireDoctorSession } from "@/lib/auth";
import { findPopulationSignals } from "@/lib/population-signal-service";
import {
  brandSummary,
  getConsultMatrix,
  getConsultSignals,
  getConsultTracks,
} from "@/lib/platform-data";

function readQuery(value: string | string[] | undefined) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value) && value[0]?.trim()) {
    return value[0].trim();
  }

  return "";
}

export default async function DeepConsultPage(props: PageProps<"/deep-consult">) {
  const searchParams = await props.searchParams;
  const query = readQuery(searchParams.q);
  const doctor = await requireDoctorSession(
    query ? `/deep-consult?q=${encodeURIComponent(query)}` : "/deep-consult",
  );

  const tracks = getConsultTracks();
  const signals = getConsultSignals();
  const matrix = getConsultMatrix();
  const resolvedQuery = query || `${doctor.specialty} 中国人群 预测 预警 监测`;
  const population = await findPopulationSignals({
    query: resolvedQuery,
    specialty: doctor.specialty,
    maxItems: 6,
  });

  return (
    <main className="app-shell">
      <div className="aurora aurora--left" />
      <div className="aurora aurora--right" />
      <SiteHeader current="consult" />

      <section className="subhero">
        <div className="subhero__copy">
          <span className="eyebrow">DeepConsult</span>
          <h1>复杂病例进入研究工作流，而不是直接生成结论。</h1>
          <p>
            当前 DeepConsult 已经接入中国人群预测预警与全病程信号，可以按病例问题或专科默认路径组织研究工作流。
          </p>
        </div>
        <form className="query-panel query-panel--compact" action="/deep-consult">
          <label htmlFor="q">输入病例问题或病程场景</label>
          <textarea
            id="q"
            name="q"
            defaultValue={query}
            rows={4}
            placeholder="例如：EGFR 突变肺癌术后 MRD 阳性患者，如何组织中国人群复发预警与随访监测路径？"
          />
          <div className="query-panel__actions">
            <button type="submit">更新 DeepConsult 工作流</button>
            <Link href="/search">回到搜索页</Link>
            <Link href={`/cases?q=${encodeURIComponent(resolvedQuery)}`}>转入病例工作台</Link>
          </div>
        </form>
      </section>

      {population.pathway ? (
        <section className="result-shell">
          <div className="summary-card">
            <span className="eyebrow">Pathway Focus</span>
            <h2>{population.pathway.diseaseArea} 全病程路径</h2>
            <p>{population.pathway.summary}</p>
          </div>

          <div className="summary-card">
            <span className="eyebrow">阶段覆盖</span>
            <ul className="bullet-list">
              {population.pathway.stagesCovered.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="summary-card">
            <span className="eyebrow">执行重点</span>
            <ul className="bullet-list">
              {population.pathway.nextFocus.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="section-block">
        <div className="signal-card">
          <p className="signal-card__lead">{brandSummary.name} 的模式映射</p>
          <div className="signal-grid">
            {signals.map((signal) => (
              <div className="signal-grid__item" key={signal.label}>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <span className="eyebrow">Population Signals</span>
          <h2>中国人群预测预警与全病程信号工作台</h2>
          <p>
            当前问题：`{resolvedQuery}`。DeepConsult 会优先把中国人群证据组织成病程阶段，而不是直接给单点结论。
            {population.pathway?.matchedTerms.length ? ` 当前主匹配词：${population.pathway.matchedTerms.join("、")}。` : ""}
          </p>
        </div>
        {population.signals.length ? (
          <div className="timeline-grid">
            {population.signals.map((signal) => (
              <article className="timeline-card" key={signal.id}>
                <span>{signal.stage}</span>
                <h3>{signal.signalName}</h3>
                <p>{signal.targetPopulation}</p>
                <p>{signal.operatingNote}</p>
                <strong>
                  {signal.intent} · 命中文献 {signal.evidenceCount} 篇
                </strong>
                {signal.leadEvidence ? (
                  <a
                    className="evidence-card__link"
                    href={signal.leadEvidence.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    查看代表文献：{signal.leadEvidence.title}
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-card">
            <span className="eyebrow">Signal Gap</span>
            <h2>当前问题还没有形成稳定的中国人群病程路径。</h2>
            <p>继续补充分型、分期、线别、药物或监测目标后，再进入 DeepConsult 会更稳。</p>
          </div>
        )}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <span className="eyebrow">Case Workflow</span>
          <h2>第一版 DeepConsult 的四段式引擎</h2>
          <p>这部分还没有接真实病例检索，但流程和治理边界已经能直接往后端推进。</p>
        </div>
        <div className="timeline-grid">
          {tracks.map((track) => (
            <article className="timeline-card" key={track.phase}>
              <span>{track.phase}</span>
              <h3>{track.goal}</h3>
              <p>{track.output}</p>
              <strong>{track.risk}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <span className="eyebrow">Evidence Matrix</span>
          <h2>中国版 OpenEvidence 必须做的本地化约束</h2>
        </div>
        <div className="matrix-table" role="table" aria-label="证据矩阵">
          <div className="matrix-row matrix-row--head" role="row">
            <span role="columnheader">维度</span>
            <span role="columnheader">产品策略</span>
            <span role="columnheader">证据信号</span>
            <span role="columnheader">执行要点</span>
          </div>
          {matrix.map((item) => (
            <div className="matrix-row" key={item.dimension} role="row">
              <span role="cell">{item.dimension}</span>
              <span role="cell">{item.guidance}</span>
              <span role="cell">{item.evidenceSignal}</span>
              <span role="cell">{item.operationalNote}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-strip">
        <div>
          <span className="eyebrow">Next Step</span>
          <h2>下一步该把病例结构化输入、RAG 和中国人群分层提示串成闭环。</h2>
          <p>搜索、监管文件和中国人群信号都已经在了，DeepConsult 现在适合继续往真实病例流升级。</p>
        </div>
        <div className="cta-strip__actions">
          <Link href="/search">继续看搜索页</Link>
          <a href={`/api/consult?q=${encodeURIComponent(resolvedQuery)}`}>查看受保护的 Consult API</a>
        </div>
      </section>
    </main>
  );
}
