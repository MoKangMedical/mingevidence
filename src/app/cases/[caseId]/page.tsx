import Link from "next/link";
import { notFound } from "next/navigation";

import { CaseFollowUpForm } from "@/components/case-follow-up-form";
import { SiteHeader } from "@/components/site-header";
import { requireDoctorSession } from "@/lib/auth";
import { getCaseWorkspace } from "@/lib/case-workspace";

export default async function CaseWorkspaceDetail(
  props: PageProps<"/cases/[caseId]">,
) {
  const params = await props.params;
  const doctor = await requireDoctorSession(`/cases/${params.caseId}`);
  const workspace = await getCaseWorkspace(params.caseId, doctor.id);

  if (!workspace) {
    notFound();
  }

  return (
    <main className="app-shell">
      <div className="aurora aurora--left" />
      <div className="aurora aurora--right" />
      <SiteHeader current="cases" />

      <section className="subhero">
        <div className="subhero__copy">
          <span className="eyebrow">Case Workspace</span>
          <h1>{workspace.title}</h1>
          <p>{workspace.patientSummary}</p>
          <div className="hero__actions">
            <Link href={`/search?q=${encodeURIComponent(workspace.focusQuery)}`}>返回证据搜索</Link>
            <Link href={`/deep-consult?q=${encodeURIComponent(workspace.focusQuery)}`}>进入 DeepConsult</Link>
            <Link href="/cases">回到病例列表</Link>
          </div>
        </div>
        <div className="case-form-card">
          <span className="eyebrow">Case Focus</span>
          <h2>当前核心问题</h2>
          <p>{workspace.focusQuery}</p>
          <div className="signal-grid">
            <div className="signal-grid__item">
              <span>病例状态</span>
              <strong>{workspace.status === "active" ? "进行中" : "监测中"}</strong>
            </div>
            <div className="signal-grid__item">
              <span>最近更新</span>
              <strong>{new Date(workspace.updatedAt).toLocaleString("zh-CN")}</strong>
            </div>
          </div>
        </div>
      </section>

      {workspace.pathway ? (
        <section className="result-shell">
          <div className="summary-card">
            <span className="eyebrow">Population Pathway</span>
            <h2>{workspace.pathway.diseaseArea} 中国人群路径</h2>
            <p>{workspace.pathway.summary}</p>
          </div>
          <div className="summary-card">
            <span className="eyebrow">覆盖阶段</span>
            <ul className="bullet-list">
              {workspace.pathway.stagesCovered.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="summary-card">
            <span className="eyebrow">下一步重点</span>
            <ul className="bullet-list">
              {workspace.pathway.nextFocus.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="section-block">
        <div className="section-heading">
          <span className="eyebrow">Conversation</span>
          <h2>病例追问记录</h2>
          <p>每次追问都会保存在这个病例里，并生成一轮新的病例助手回答。</p>
        </div>
        <div className="case-thread">
          {workspace.messages.map((message) => (
            <article
              className={
                message.role === "doctor"
                  ? "case-thread__message case-thread__message--doctor"
                  : "case-thread__message case-thread__message--assistant"
              }
              key={message.id}
            >
              <span className="case-thread__role">
                {message.role === "doctor" ? "医生输入" : "病例助手"}
              </span>
              <p>{message.content}</p>
              {message.highlights?.length ? (
                <ul className="bullet-list bullet-list--compact">
                  {message.highlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {message.nextSteps?.length ? (
                <div className="case-thread__group">
                  <strong>下一步</strong>
                  <ul className="bullet-list bullet-list--compact">
                    {message.nextSteps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {message.citations?.length ? (
                <div className="case-thread__group">
                  <strong>代表证据</strong>
                  <ul className="bullet-list bullet-list--compact">
                    {message.citations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <CaseFollowUpForm caseId={workspace.id} />
      </section>

      {workspace.signals.length ? (
        <section className="section-block">
          <div className="section-heading">
            <span className="eyebrow">Signal Focus</span>
            <h2>当前病例命中的中国人群信号</h2>
          </div>
          <div className="timeline-grid">
            {workspace.signals.map((signal) => (
              <article className="timeline-card" key={signal.id}>
                <span>{signal.stage}</span>
                <h3>{signal.signalName}</h3>
                <p>{signal.targetPopulation}</p>
                <p>{signal.operatingNote}</p>
                <strong>
                  {signal.intent} · 命中文献 {signal.evidenceCount} 篇
                </strong>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
