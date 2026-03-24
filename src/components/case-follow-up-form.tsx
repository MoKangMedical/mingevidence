"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type CaseFollowUpFormProps = {
  caseId: string;
};

export function CaseFollowUpForm({ caseId }: CaseFollowUpFormProps) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitFollowUp(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setStatus(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/cases/${caseId}/follow-ups`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: question.trim(),
          }),
        });

        const payload = (await response.json()) as { error?: string };

        if (!response.ok) {
          setStatus(payload.error ?? "追问提交失败，请稍后重试。");
          return;
        }

        setQuestion("");
        router.refresh();
      } catch {
        setStatus("当前网络不可用，追问还没有保存成功。");
      }
    });
  }

  return (
    <form className="case-form-card" onSubmit={submitFollowUp}>
      <div>
        <span className="eyebrow">Follow-up</span>
        <h2>继续追问这个病例</h2>
        <p>这里的追问会和当前病例上下文一起保存，并自动生成新一轮病例助手回答。</p>
      </div>

      <label className="feedback-card__label" htmlFor={`follow-up-${caseId}`}>
        继续追问
      </label>
      <textarea
        id={`follow-up-${caseId}`}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder="例如：如果患者已有轻度肾功能下降，预警和监测重点要怎么变？"
        rows={5}
        value={question}
      />

      <div className="query-panel__actions">
        <button disabled={isPending || !question.trim()} type="submit">
          {isPending ? "正在生成…" : "保存并继续追问"}
        </button>
      </div>

      {status ? <p className="feedback-card__status">{status}</p> : null}
    </form>
  );
}
