import Link from "next/link";
import { headers } from "next/headers";

import { EvidenceCard } from "@/components/evidence-card";
import { SearchFeedback } from "@/components/search-feedback";
import { SiteHeader } from "@/components/site-header";
import { requireDoctorSession } from "@/lib/auth";
import { runEvidenceSearch } from "@/lib/search-service";

function readQuery(value: string | string[] | undefined) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value) && value[0]?.trim()) {
    return value[0].trim();
  }

  return "";
}

export default async function SearchPage(props: PageProps<"/search">) {
  const searchParams = await props.searchParams;
  const query = readQuery(searchParams.q);
  const doctor = await requireDoctorSession(query ? `/search?q=${encodeURIComponent(query)}` : "/search");
  const headerStore = await headers();

  const result = query
    ? await runEvidenceSearch({
        query,
        actor: doctor,
        channel: "page",
        route: "/search",
        requestMeta: {
          ip: headerStore.get("x-forwarded-for"),
          userAgent: headerStore.get("user-agent"),
        },
      })
    : null;

  return (
    <main className="app-shell">
      <div className="aurora aurora--left" />
      <div className="aurora aurora--right" />
      <SiteHeader current="search" />

      <section className="subhero">
        <div className="subhero__copy">
          <span className="eyebrow">Evidence Search</span>
          <h1>先检索中国指南与监管文件，再补充 FDA 和 PubMed 证据。</h1>
          <p>
            这版 `/api/search` 已经不再是 mock。当前会先检索由中国指南、NMPA 文件和 FDA 标签组成的正式证据库，再实时查询 PubMed 摘要，并对高风险问题做拒答。
          </p>
        </div>
        <form className="query-panel query-panel--compact" action="/search">
          <label htmlFor="q">输入临床问题</label>
          <textarea
            id="q"
            name="q"
            defaultValue={query}
            rows={4}
            placeholder="例如：EGFR 突变肺癌二线耐药后，中国本地可执行证据路径是什么？"
          />
          <div className="query-panel__actions">
            <button type="submit">生成证据视图</button>
            <Link href="/deep-consult">进入 DeepConsult</Link>
          </div>
        </form>
      </section>

      {!result ? (
        <section className="empty-card">
          <span className="eyebrow">Search Ready</span>
          <h2>输入临床问题后，将返回中国指南、NMPA/FDA 监管文件和 PubMed 摘要级证据的统一证据视图。</h2>
          <p>当前搜索页已经绑定医生身份、审计日志和高风险问题风控，可以直接往试点版本迭代。</p>
        </section>
      ) : result.allowed ? (
        <>
          <section className="result-shell">
            <div className="summary-card">
              <span className="eyebrow">AI 结论摘要</span>
              <h2>{result.specialty}专科证据结论</h2>
              <p>{result.summary}</p>
            </div>

            <div className="summary-card">
              <span className="eyebrow">临床关注点</span>
              <ul className="bullet-list">
                {result.clinicianFocus.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="summary-card">
              <span className="eyebrow">建议下一步</span>
              <ul className="bullet-list">
                {result.suggestedActions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </section>

          {result.populationPathway ? (
            <section className="result-shell">
              <div className="summary-card">
                <span className="eyebrow">Population Pathway</span>
                <h2>{result.populationPathway.diseaseArea}中国人群路径</h2>
                <p>{result.populationPathway.summary}</p>
              </div>

              <div className="summary-card">
                <span className="eyebrow">覆盖阶段</span>
                <ul className="bullet-list">
                  {result.populationPathway.stagesCovered.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="summary-card">
                <span className="eyebrow">下一步重点</span>
                <ul className="bullet-list">
                  {result.populationPathway.nextFocus.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>
          ) : null}

          <section className="section-block">
            <div className="section-heading">
              <span className="eyebrow">Retrieval</span>
              <h2>统一证据视图</h2>
              <p>
                当前命中本地证据 {result.retrieval.localCount} 条，PubMed 摘要证据 {result.retrieval.pubmedCount} 条。排序会优先中国指南，再给 NMPA/FDA 监管证据和国际补充证据。
              </p>
            </div>
            <div className="evidence-grid">
              {result.evidence.map((item) => (
                <EvidenceCard item={item} key={item.id} />
              ))}
            </div>
          </section>

          {result.populationSignals.length ? (
            <section className="section-block">
              <div className="section-heading">
                <span className="eyebrow">Population Signals</span>
                <h2>中国人群预测预警与全病程信号</h2>
                <p>
                  这一层不直接替代诊疗结论，而是补充中国人群的风险分层、预警和监测路径。
                  {result.populationPathway?.matchedTerms.length ? ` 当前主匹配词：${result.populationPathway.matchedTerms.join("、")}。` : ""}
                </p>
              </div>
              <div className="timeline-grid">
                {result.populationSignals.map((signal) => (
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
            </section>
          ) : null}

          <SearchFeedback
            context="search-result"
            query={result.query}
            requestId={result.requestId}
          />
        </>
      ) : (
        <>
          <section className="refusal-card">
            <span className="eyebrow">Guardrail</span>
            <h2>{result.risk?.title ?? "高风险问题已拒答"}</h2>
            <p>{result.risk?.reason ?? result.summary}</p>
            <ul className="bullet-list">
              {result.suggestedActions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <SearchFeedback
            context="search-refusal"
            query={result.query}
            requestId={result.requestId}
          />
        </>
      )}
    </main>
  );
}
