import Link from "next/link";

import { CreateCaseForm } from "@/components/create-case-form";
import { SiteHeader } from "@/components/site-header";
import { requireDoctorSession } from "@/lib/auth";
import { listCaseWorkspaces } from "@/lib/case-workspace";

function readQuery(value: string | string[] | undefined) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value) && value[0]?.trim()) {
    return value[0].trim();
  }

  return "";
}

export default async function CaseWorkspaceIndex(props: PageProps<"/cases">) {
  const searchParams = await props.searchParams;
  const defaultQuery = readQuery(searchParams.q);
  const doctor = await requireDoctorSession(
    defaultQuery ? `/cases?q=${encodeURIComponent(defaultQuery)}` : "/cases",
  );
  const cases = await listCaseWorkspaces(doctor.id);

  return (
    <main className="app-shell">
      <div className="aurora aurora--left" />
      <div className="aurora aurora--right" />
      <SiteHeader current="cases" />

      <section className="subhero">
        <div className="subhero__copy">
          <span className="eyebrow">Case Workspace</span>
          <h1>把复杂问题升级成连续病例工作流。</h1>
          <p>
            病例工作台会保存当前问题、病程摘要、追问历史和病例助手回答。它不是搜索结果的替代，而是把搜索和
            DeepConsult 变成一个可连续使用的病例会话。
          </p>
          {defaultQuery ? (
            <p>
              当前已经从其他入口带入问题：`{defaultQuery}`。你可以直接补充病程摘要后创建病例，不需要重新整理上下文。
            </p>
          ) : null}
        </div>
        <CreateCaseForm defaultQuery={defaultQuery} />
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <span>当前医生</span>
          <strong>{doctor.name}</strong>
          <p>
            {doctor.hospital} / {doctor.specialty}
          </p>
        </article>
        <article className="stat-card">
          <span>病例总数</span>
          <strong>{cases.length}</strong>
          <p>最近更新的病例会优先排在最前面。</p>
        </article>
        <article className="stat-card">
          <span>入口联动</span>
          <strong>Search + Consult</strong>
          <p>搜索页和 DeepConsult 的问题都可以带入这里建立新病例。</p>
        </article>
        <article className="stat-card">
          <span>当前状态</span>
          <strong>可保存 / 可追问</strong>
          <p>病例工作台已经具备本地持久化和受保护 API。</p>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <span className="eyebrow">My Cases</span>
          <h2>最近病例</h2>
          <p>点击任意病例进入详情页，继续追问、查看阶段路径或回到搜索 / DeepConsult。</p>
        </div>

        {cases.length ? (
          <div className="case-card-grid">
            {cases.map((item) => (
              <Link className="case-card" href={`/cases/${item.id}`} key={item.id}>
                <span className="case-card__status">{item.status === "active" ? "进行中" : "监测中"}</span>
                <h3>{item.title}</h3>
                <p>{item.focusQuery}</p>
                <div className="case-card__meta">
                  <strong>{item.pathway?.diseaseArea ?? "待补充路径"}</strong>
                  <span>{new Date(item.updatedAt).toLocaleString("zh-CN")}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-card">
            <span className="eyebrow">No Cases</span>
            <h2>还没有病例工作台。</h2>
            <p>从上面的表单创建第一条病例后，这里会显示持续可追问的病例列表。</p>
          </div>
        )}
      </section>
    </main>
  );
}
