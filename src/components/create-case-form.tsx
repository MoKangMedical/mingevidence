"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type CreateCaseFormProps = {
  defaultQuery?: string;
};

export function CreateCaseForm({ defaultQuery = "" }: CreateCaseFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [focusQuery, setFocusQuery] = useState(defaultQuery);
  const [patientSummary, setPatientSummary] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitCase(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setStatus(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/cases", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: title.trim(),
            focusQuery: focusQuery.trim(),
            patientSummary: patientSummary.trim(),
          }),
        });

        const payload = (await response.json()) as {
          error?: string;
          item?: { id: string };
        };

        if (!response.ok || !payload.item) {
          setStatus(payload.error ?? "病例创建失败，请稍后重试。");
          return;
        }

        router.push(`/cases/${payload.item.id}`);
        router.refresh();
      } catch {
        setStatus("当前网络不可用，病例还没有保存成功。");
      }
    });
  }

  return (
    <form className="case-form-card" onSubmit={submitCase}>
      <div>
        <span className="eyebrow">New Case</span>
        <h2>创建病例工作台</h2>
        <p>把当前问题、病程摘要和后续追问都放进同一个病例会话，后面就不用每次重新描述上下文。</p>
      </div>

      <label className="feedback-card__label" htmlFor="case-title">
        病例标题
      </label>
      <input
        id="case-title"
        onChange={(event) => setTitle(event.target.value)}
        placeholder="例如：EGFR 术后 MRD 阳性患者复发预警"
        value={title}
      />

      <label className="feedback-card__label" htmlFor="case-focus">
        当前核心问题
      </label>
      <textarea
        id="case-focus"
        onChange={(event) => setFocusQuery(event.target.value)}
        placeholder="例如：EGFR 突变肺癌术后 MRD 阳性患者，如何组织中国人群复发预警与随访监测路径？"
        rows={4}
        value={focusQuery}
      />

      <label className="feedback-card__label" htmlFor="case-summary">
        病程摘要
      </label>
      <textarea
        id="case-summary"
        onChange={(event) => setPatientSummary(event.target.value)}
        placeholder="填写分期、既往治疗、并发症、器官功能和当前关注点。"
        rows={5}
        value={patientSummary}
      />

      <div className="query-panel__actions">
        <button disabled={isPending || !focusQuery.trim()} type="submit">
          {isPending ? "正在创建…" : "创建病例工作台"}
        </button>
      </div>

      {status ? <p className="feedback-card__status">{status}</p> : null}
    </form>
  );
}
