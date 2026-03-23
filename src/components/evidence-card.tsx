import type { EvidenceItem } from "@/lib/platform-data";

type EvidenceCardProps = {
  item: EvidenceItem;
};

export function EvidenceCard({ item }: EvidenceCardProps) {
  return (
    <article className="evidence-card">
      <div className="evidence-card__meta">
        <span>{item.category}</span>
        <span>{item.year}</span>
      </div>
      <h3>{item.title}</h3>
      <p className="evidence-card__source">{item.source}</p>
      <dl className="evidence-card__grid">
        <div>
          <dt>证据等级</dt>
          <dd>{item.evidenceLevel}</dd>
        </div>
        <div>
          <dt>适用场景</dt>
          <dd>{item.fit}</dd>
        </div>
        <div>
          <dt>关键提醒</dt>
          <dd>{item.caution}</dd>
        </div>
      </dl>
      <p className="evidence-card__insight">{item.insight}</p>
      {item.url ? (
        <a
          className="evidence-card__link"
          href={item.url}
          rel="noreferrer"
          target="_blank"
        >
          查看来源
        </a>
      ) : null}
    </article>
  );
}
