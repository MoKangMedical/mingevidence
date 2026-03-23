"use client";

import { useState, useTransition } from "react";

type SearchFeedbackProps = {
  requestId: string;
  query: string;
  context: "search-result" | "search-refusal";
};

export function SearchFeedback({
  requestId,
  query,
  context,
}: SearchFeedbackProps) {
  const [verdict, setVerdict] = useState<"helpful" | "not_helpful" | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitFeedback(nextVerdict: "helpful" | "not_helpful") {
    setVerdict(nextVerdict);
    setStatus(null);

    startTransition(async () => {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId,
          query,
          context,
          verdict: nextVerdict,
          note: note.trim(),
        }),
      });

      if (!response.ok) {
        setStatus("反馈提交失败，请稍后重试。");
        return;
      }

      setStatus("反馈已记录，后续会进入质控和审计日志。");
    });
  }

  return (
    <section className="feedback-card">
      <div>
        <span className="eyebrow">Doctor Feedback</span>
        <h3>这次结果对你有帮助吗？</h3>
        <p>
          反馈会写入审计日志，用于后续质控、医生偏好分析和高风险问题复盘。
        </p>
      </div>

      <div className="feedback-card__actions">
        <button
          className={verdict === "helpful" ? "is-selected" : ""}
          disabled={isPending}
          onClick={() => submitFeedback("helpful")}
          type="button"
        >
          有帮助
        </button>
        <button
          className={verdict === "not_helpful" ? "is-selected" : ""}
          disabled={isPending}
          onClick={() => submitFeedback("not_helpful")}
          type="button"
        >
          需修正
        </button>
      </div>

      <label className="feedback-card__label" htmlFor={`note-${requestId}`}>
        补充说明
      </label>
      <textarea
        id={`note-${requestId}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="例如：请补充中国指南与医保边界的差异，或说明为何拒答过严。"
        rows={4}
      />

      {status ? <p className="feedback-card__status">{status}</p> : null}
    </section>
  );
}
