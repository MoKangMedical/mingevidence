import { randomUUID } from "node:crypto";

import type {
  EvidenceDocumentClass,
  SearchResultView,
  UnifiedEvidenceChunk,
  UnifiedEvidenceRecord,
} from "@/lib/evidence-schema";
import { assessHighRiskQuestion } from "@/lib/risk";
import { readJsonFile } from "@/lib/storage";
import { writeAuditEvent } from "@/lib/audit";
import type { DoctorSession } from "@/lib/auth";
import { findPopulationSignals } from "@/lib/population-signal-service";

let cachedCorpus: UnifiedEvidenceRecord[] | null = null;
let cachedChunks: UnifiedEvidenceChunk[] | null = null;

type RankedCandidate = {
  record: UnifiedEvidenceRecord;
  bestChunk?: UnifiedEvidenceChunk;
  score: number;
};

type QueryProfile = {
  preferredSpecialty: string;
  asksRegulatory: boolean;
  asksGuideline: boolean;
  queryText: string;
  tokens: string[];
};

function normalizeText(input: string) {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenizeQuery(query: string) {
  const normalized = normalizeText(query);
  const tokens = new Set<string>();

  for (const token of normalized.split(/[^\p{L}\p{N}]+/u)) {
    if (token.length >= 2) {
      tokens.add(token);
    }
  }

  const hanSegments = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];

  for (const segment of hanSegments) {
    tokens.add(segment);

    const maxLength = Math.min(4, segment.length);
    for (let length = 2; length <= maxLength; length += 1) {
      for (let index = 0; index <= segment.length - length; index += 1) {
        tokens.add(segment.slice(index, index + length));
      }
    }
  }

  return Array.from(tokens).slice(0, 80);
}

function sourceWeight(sourceType: UnifiedEvidenceRecord["sourceType"]) {
  switch (sourceType) {
    case "china_guideline":
      return 42;
    case "nmpa_drug_notice":
      return 30;
    case "drug_label":
      return 28;
    case "fda_label":
      return 24;
    case "reimbursement":
      return 20;
    case "international_evidence":
      return 12;
    case "pubmed_abstract":
      return 10;
    default:
      return 0;
  }
}

function documentClassWeight(documentClass?: EvidenceDocumentClass) {
  switch (documentClass) {
    case "guideline":
      return 16;
    case "guideline_update":
      return 8;
    case "drug_label":
      return 6;
    case "regulatory_principle":
      return -6;
    case "announcement":
      return -40;
    default:
      return 0;
  }
}

function evidenceLabel(record: UnifiedEvidenceRecord) {
  switch (record.sourceType) {
    case "china_guideline":
      return "中国指南";
    case "nmpa_drug_notice":
      return "NMPA 核准";
    case "drug_label":
      return "说明书";
    case "fda_label":
      return "FDA 标签";
    case "reimbursement":
      return "医保";
    case "international_evidence":
      return "国际证据";
    case "pubmed_abstract":
      return "PubMed 摘要";
    default:
      return "证据";
  }
}

function evidenceLevelLabel(level: UnifiedEvidenceRecord["evidenceLevel"]) {
  switch (level) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "reference":
      return "参考";
    default:
      return "未分级";
  }
}

function compareCandidates(left: RankedCandidate, right: RankedCandidate) {
  const sourceDelta =
    sourceWeight(right.record.sourceType) - sourceWeight(left.record.sourceType);

  if (sourceDelta !== 0) {
    return sourceDelta;
  }

  return right.score - left.score;
}

function inferSpecialty(query: string, records: UnifiedEvidenceRecord[]) {
  const lowered = query.toLowerCase();

  if (lowered.includes("肺癌") || lowered.includes("egfr") || lowered.includes("乳腺癌")) {
    return "肿瘤";
  }

  if (lowered.includes("房颤") || lowered.includes("抗栓") || lowered.includes("冠心病")) {
    return "心血管";
  }

  if (lowered.includes("糖尿病") || lowered.includes("肾病") || lowered.includes("肥胖")) {
    return "内分泌";
  }

  if (lowered.includes("感染") || lowered.includes("抗菌") || lowered.includes("脓毒症")) {
    return "感染";
  }

  if (records[0]?.specialtyTags[0]) {
    return records[0].specialtyTags[0];
  }

  return "综合";
}

function buildQueryProfile(
  query: string,
  actorSpecialty: string,
  records: UnifiedEvidenceRecord[],
): QueryProfile {
  const queryText = normalizeText(query);
  const preferredSpecialty = inferSpecialty(query, records);
  const asksRegulatory =
    queryText.includes("说明书") ||
    queryText.includes("标签") ||
    queryText.includes("适应症") ||
    queryText.includes("禁忌") ||
    queryText.includes("剂量") ||
    queryText.includes("减量") ||
    queryText.includes("fda") ||
    queryText.includes("nmpa") ||
    queryText.includes("药监");
  const asksGuideline =
    queryText.includes("指南") ||
    queryText.includes("共识") ||
    queryText.includes("推荐");

  return {
    preferredSpecialty:
      preferredSpecialty === "综合" && actorSpecialty ? actorSpecialty : preferredSpecialty,
    asksRegulatory,
    asksGuideline,
    queryText,
    tokens: tokenizeQuery(query),
  };
}

async function loadCorpus() {
  if (!cachedCorpus) {
    cachedCorpus = await readJsonFile<UnifiedEvidenceRecord[]>(
      "normalized",
      "evidence-records.json",
    );
  }

  return cachedCorpus;
}

async function loadChunks() {
  if (cachedChunks) {
    return cachedChunks;
  }

  try {
    cachedChunks = await readJsonFile<UnifiedEvidenceChunk[]>(
      "normalized",
      "evidence-chunks.json",
    );
    return cachedChunks;
  } catch {
    const records = await loadCorpus();
    cachedChunks = records.map((record) => ({
      id: `${record.id}#fallback`,
      recordId: record.id,
      sourceType: record.sourceType,
      documentClass: record.documentClass,
      title: record.title,
      sourceName: record.sourceName,
      publishedAt: record.publishedAt,
      keywords: record.keywords,
      section: "fallback",
      content: record.contentText || record.summary,
      searchText: record.searchText,
    }));
    return cachedChunks;
  }
}

function recencyScore(publishedAt: string) {
  const year = Number(publishedAt.slice(0, 4));
  if (Number.isNaN(year)) {
    return 0;
  }

  return Math.max(0, Math.min(6, year - 2021));
}

function countTokenHits(haystack: string, tokens: string[]) {
  let hits = 0;

  for (const token of tokens) {
    if (haystack.includes(token)) {
      hits += 1;
    }
  }

  return hits;
}

function tagMatchCount(queryText: string, tags: string[]) {
  let matches = 0;

  for (const tag of tags) {
    const normalizedTag = normalizeText(tag);

    if (!normalizedTag) {
      continue;
    }

    if (queryText.includes(normalizedTag)) {
      matches += 1;
      continue;
    }

    if (normalizedTag.length >= 3 && queryText.includes(normalizedTag.slice(0, 3))) {
      matches += 1;
    }
  }

  return matches;
}

function searchPolicyPenalty(profile: QueryProfile, record: UnifiedEvidenceRecord) {
  switch (record.searchPolicy) {
    case "exclude":
      return -999;
    case "regulatory":
      return profile.asksRegulatory ? 8 : -14;
    default:
      return 0;
  }
}

function relevanceAdjustment(profile: QueryProfile, record: UnifiedEvidenceRecord) {
  const specialtyMatches = tagMatchCount(profile.queryText, record.specialtyTags);
  const conditionMatches = tagMatchCount(profile.queryText, record.conditionTags);
  const interventionMatches = tagMatchCount(profile.queryText, record.interventionTags);
  const queryHasSpecificCondition = profile.tokens.some((token) => token.length >= 3);
  let score = 0;

  score += documentClassWeight(record.documentClass);
  score += Math.round((record.searchPriority ?? 0.5) * 12);
  score += specialtyMatches * 8;
  score += conditionMatches * 10;
  score += interventionMatches * 8;
  score += searchPolicyPenalty(profile, record);

  if (
    profile.preferredSpecialty &&
    profile.preferredSpecialty !== "综合" &&
    record.specialtyTags.length
  ) {
    if (record.specialtyTags.includes(profile.preferredSpecialty)) {
      score += 14;
    } else {
      score -= 24;
    }
  }

  if (queryHasSpecificCondition && !conditionMatches && !interventionMatches) {
    score -= 12;
  }

  if (profile.asksGuideline && record.sourceType === "china_guideline") {
    score += 6;
  }

  if (!profile.asksRegulatory && record.documentClass === "regulatory_principle") {
    score -= 10;
  }

  return score;
}

function isRecordEligible(profile: QueryProfile, record: UnifiedEvidenceRecord) {
  if (record.searchPolicy === "exclude") {
    return false;
  }

  const conditionMatches = tagMatchCount(profile.queryText, record.conditionTags);
  const interventionMatches = tagMatchCount(profile.queryText, record.interventionTags);
  const hasSpecificMatch = conditionMatches > 0 || interventionMatches > 0;

  if (
    profile.preferredSpecialty &&
    profile.preferredSpecialty !== "综合" &&
    record.specialtyTags.length > 0 &&
    !record.specialtyTags.includes(profile.preferredSpecialty) &&
    !hasSpecificMatch
  ) {
    return false;
  }

  if (
    record.searchPolicy === "regulatory" &&
    !profile.asksRegulatory &&
    !hasSpecificMatch
  ) {
    return false;
  }

  return true;
}

function keywordBoost(query: string, record: UnifiedEvidenceRecord) {
  let score = 0;

  for (const keyword of record.keywords) {
    const normalizedKeyword = normalizeText(keyword);

    if (!normalizedKeyword) {
      continue;
    }

    if (query.includes(normalizedKeyword) || normalizedKeyword.includes(query)) {
      score += 8;
      continue;
    }

    if (query.includes(normalizedKeyword.slice(0, Math.min(4, normalizedKeyword.length)))) {
      score += 4;
    }
  }

  return score;
}

function scoreChunk(
  profile: QueryProfile,
  record: UnifiedEvidenceRecord,
  chunk: UnifiedEvidenceChunk,
) {
  const queryText = profile.queryText;
  const chunkText = normalizeText(chunk.searchText);
  const titleText = normalizeText(record.title);
  const exactQueryHit = chunkText.includes(queryText) ? 18 : 0;
  const chunkTokenHits = countTokenHits(chunkText, profile.tokens);
  const titleTokenHits = countTokenHits(titleText, profile.tokens);
  const sectionBoost =
    chunk.section &&
    (queryText.includes(normalizeText(chunk.section)) ||
      normalizeText(chunk.section).includes(queryText))
      ? 8
      : 0;

  return (
    sourceWeight(record.sourceType) +
    relevanceAdjustment(profile, record) +
    recencyScore(record.publishedAt) +
    exactQueryHit +
    sectionBoost +
    chunkTokenHits * 4 +
    titleTokenHits * 3 +
    keywordBoost(queryText, record)
  );
}

function buildInsight(candidate: RankedCandidate) {
  const content = candidate.bestChunk?.content?.trim() || candidate.record.summary.trim();

  if (content.length <= 180) {
    return content;
  }

  return `${content.slice(0, 177).trim()}...`;
}

function toEvidenceView(candidate: RankedCandidate) {
  const record = candidate.record;

  return {
    id: record.id,
    title: record.title,
    source: record.citation,
    year: record.publishedAt.slice(0, 4),
    category: evidenceLabel(record),
    evidenceLevel: evidenceLevelLabel(record.evidenceLevel),
    fit: record.applicability,
    caution: record.cautions,
    insight: buildInsight(candidate),
    url: record.url,
  };
}

function composeSummary(specialty: string, candidates: RankedCandidate[]) {
  const guideline = candidates.find((item) => item.record.sourceType === "china_guideline");
  const nmpaNotice = candidates.find((item) => item.record.sourceType === "nmpa_drug_notice");
  const label = candidates.find((item) => item.record.sourceType === "drug_label");
  const fdaLabel = candidates.find((item) => item.record.sourceType === "fda_label");
  const pubmed = candidates.find((item) => item.record.sourceType === "pubmed_abstract");

  return [
    guideline
      ? `${specialty}场景下，当前优先参考 ${guideline.record.sourceName}，命中的核心片段是：${buildInsight(guideline)}`
      : "当前没有命中强相关的中国指南片段，建议先补充分型、线别或药物名称再检索。",
    nmpaNotice ? `NMPA 具体药品官方信息方面：${buildInsight(nmpaNotice)}` : null,
    label ? `说明书合规边界方面：${label.record.cautions}` : null,
    fdaLabel ? `FDA 标签补充方面：${buildInsight(fdaLabel)}` : null,
    pubmed ? `最新国际证据补充：${buildInsight(pubmed)}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildClinicianFocus(candidates: RankedCandidate[]) {
  return candidates.slice(0, 3).map((candidate) => {
    if (candidate.bestChunk?.section && candidate.bestChunk.section !== "fallback") {
      return `${candidate.record.title}：${buildInsight(candidate)}`;
    }

    return candidate.record.applicability;
  });
}

function buildSuggestedActions(candidates: RankedCandidate[]) {
  const actions = new Set<string>();

  for (const candidate of candidates) {
    if (candidate.record.sourceType === "china_guideline") {
      actions.add("先按中国指南命中的章节收敛分型和线别，再进入方案对比。");
    }

    if (candidate.record.sourceType === "drug_label") {
      actions.add("把说明书禁忌、注意事项和适应症边界单独列出，不把合规问题混成疗效结论。");
    }

    if (candidate.record.sourceType === "nmpa_drug_notice") {
      actions.add("将 NMPA 具体药品官方批准信息与指南推荐并排展示，先确认中国获批适应症再进入方案讨论。");
    }

    if (candidate.record.sourceType === "fda_label") {
      actions.add("将 FDA 标签作为监管与适应症边界补充层，重点对照 NMPA 与中国指南差异。");
    }

    if (candidate.record.sourceType === "pubmed_abstract") {
      actions.add("将 PubMed 摘要级证据作为补充层，重点核对与中国指南是否存在推荐差异。");
    }
  }

  if (!actions.size) {
    actions.add("先改写问题，把疾病分型、治疗线别和药物名称写清楚后再检索。");
  }

  return Array.from(actions).slice(0, 4);
}

function rankCandidates(input: {
  profile: QueryProfile;
  records: UnifiedEvidenceRecord[];
  chunks: UnifiedEvidenceChunk[];
  maxDocuments: number;
  minimumScore: number;
}) {
  const recordById = new Map(input.records.map((record) => [record.id, record]));
  const ranked = new Map<string, RankedCandidate>();

  for (const chunk of input.chunks) {
    const record = recordById.get(chunk.recordId);

    if (!record) {
      continue;
    }

    if (!isRecordEligible(input.profile, record)) {
      continue;
    }

    const score = scoreChunk(input.profile, record, chunk);

    if (score < input.minimumScore) {
      continue;
    }

    const existing = ranked.get(record.id);

    if (!existing || score > existing.score) {
      ranked.set(record.id, {
        record,
        bestChunk: chunk,
        score,
      });
    }
  }

  return Array.from(ranked.values())
    .sort(compareCandidates)
    .slice(0, input.maxDocuments);
}

function decodeXmlEntities(input: string) {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePubMedPublishedAt(articleXml: string) {
  const articleDateMatch = articleXml.match(
    /<ArticleDate[^>]*>[\s\S]*?<Year>(\d{4})<\/Year>[\s\S]*?<Month>(\d{1,2})<\/Month>[\s\S]*?<Day>(\d{1,2})<\/Day>[\s\S]*?<\/ArticleDate>/,
  );

  if (articleDateMatch) {
    const [, year, month, day] = articleDateMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const yearMatch = articleXml.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/);
  if (yearMatch) {
    return `${yearMatch[1]}-01-01`;
  }

  return `${new Date().getFullYear()}-01-01`;
}

function parsePubMedAuthors(articleXml: string) {
  const authors = [...articleXml.matchAll(/<Author[\s\S]*?<\/Author>/g)]
    .map((match) => {
      const block = match[0];
      const collective = block.match(/<CollectiveName>([\s\S]*?)<\/CollectiveName>/);
      if (collective) {
        return decodeXmlEntities(collective[1]);
      }

      const lastName = block.match(/<LastName>([\s\S]*?)<\/LastName>/);
      const initials = block.match(/<Initials>([\s\S]*?)<\/Initials>/);

      if (!lastName) {
        return "";
      }

      return decodeXmlEntities(
        initials ? `${lastName[1]} ${initials[1]}` : lastName[1],
      );
    })
    .filter(Boolean);

  return authors.slice(0, 3).join(", ");
}

function parsePubMedArticles(query: string, xml: string) {
  const articles = xml.match(/<PubmedArticle\b[\s\S]*?<\/PubmedArticle>/g) ?? [];
  const records: UnifiedEvidenceRecord[] = [];
  const chunks: UnifiedEvidenceChunk[] = [];

  for (const articleXml of articles) {
    const pmidMatch = articleXml.match(/<PMID[^>]*>(\d+)<\/PMID>/);
    const titleMatch = articleXml.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/);
    const journalMatch = articleXml.match(/<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/);
    const abstractBlocks = [...articleXml.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)];

    if (!pmidMatch || !titleMatch || !abstractBlocks.length) {
      continue;
    }

    const pmid = pmidMatch[1];
    const title = decodeXmlEntities(titleMatch[1]);
    const journal = journalMatch ? decodeXmlEntities(journalMatch[1]) : "PubMed";
    const authors = parsePubMedAuthors(articleXml);
    const doiMatch = articleXml.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/);
    const publishedAt = parsePubMedPublishedAt(articleXml);
    const abstractText = abstractBlocks
      .map((match) => {
        const labelMatch = match[1].match(/Label="([^"]+)"/);
        const label = labelMatch ? `${decodeXmlEntities(labelMatch[1])}: ` : "";
        return `${label}${decodeXmlEntities(match[2])}`.trim();
      })
      .filter(Boolean)
      .join("\n\n");

    const record: UnifiedEvidenceRecord = {
      id: `pubmed-${pmid}`,
      sourceType: "pubmed_abstract",
      sourceName: journal,
      title,
      region: "INTL",
      language: "en",
      citation: `${journal} (${publishedAt.slice(0, 4)})`,
      publishedAt,
      evidenceLevel: "medium",
      specialtyTags: [],
      conditionTags: [],
      interventionTags: [],
      keywords: tokenizeQuery(`${query} ${title}`).slice(0, 16),
      summary: authors
        ? `${authors} 等发表于 ${journal} 的摘要级证据已纳入检索。`
        : `${journal} 的摘要级证据已纳入检索。`,
      applicability: "适合补充最新国际研究方向，但需要与中国指南和本地药物可及性一起解释。",
      cautions: "当前接入的是 PubMed 摘要级证据，不替代全文阅读和正式指南推荐。",
      url: doiMatch
        ? `https://doi.org/${decodeXmlEntities(doiMatch[1])}`
        : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      contentText: abstractText,
      searchText: normalizeText(`${title} ${journal} ${abstractText} ${query}`),
    };

    records.push(record);

    const abstractChunks = abstractText
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((content, index) => ({
        id: `${record.id}#chunk-${index + 1}`,
        recordId: record.id,
        sourceType: record.sourceType,
        title: record.title,
        sourceName: record.sourceName,
        publishedAt: record.publishedAt,
        keywords: record.keywords,
        section: index === 0 ? "abstract" : `abstract-${index + 1}`,
        content,
        searchText: normalizeText(`${record.title} ${content} ${query}`),
      }));

    chunks.push(...abstractChunks);
  }

  return { records, chunks };
}

async function fetchPubMedEvidence(query: string) {
  const esearchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  esearchUrl.searchParams.set("db", "pubmed");
  esearchUrl.searchParams.set("retmode", "json");
  esearchUrl.searchParams.set("retmax", "5");
  esearchUrl.searchParams.set("sort", "relevance");
  esearchUrl.searchParams.set("term", query);

  const searchResponse = await fetch(esearchUrl, {
    headers: {
      "User-Agent": "MingEvidence/0.2 (clinical evidence retrieval prototype)",
    },
    next: { revalidate: 3600 },
  });

  if (!searchResponse.ok) {
    return { records: [], chunks: [] };
  }

  const searchJson = (await searchResponse.json()) as {
    esearchresult?: { idlist?: string[] };
  };
  const ids = searchJson.esearchresult?.idlist ?? [];

  if (!ids.length) {
    return { records: [], chunks: [] };
  }

  const efetchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi");
  efetchUrl.searchParams.set("db", "pubmed");
  efetchUrl.searchParams.set("retmode", "xml");
  efetchUrl.searchParams.set("id", ids.join(","));

  const abstractResponse = await fetch(efetchUrl, {
    headers: {
      "User-Agent": "MingEvidence/0.2 (clinical evidence retrieval prototype)",
    },
    next: { revalidate: 3600 },
  });

  if (!abstractResponse.ok) {
    return { records: [], chunks: [] };
  }

  const xml = await abstractResponse.text();
  return parsePubMedArticles(query, xml);
}

export async function runEvidenceSearch(input: {
  query: string;
  actor: DoctorSession;
  channel: "page" | "api";
  route: string;
  requestMeta?: {
    ip?: string | null;
    userAgent?: string | null;
  };
}): Promise<SearchResultView> {
  const query = input.query.trim();
  const requestId = randomUUID();
  const risk = assessHighRiskQuestion(query);

  if (!risk.allowed) {
    await writeAuditEvent({
      event: "search.refused",
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      route: input.route,
      requestId,
      query,
      status: "refused",
      detail: risk.code,
      ip: input.requestMeta?.ip ?? null,
      userAgent: input.requestMeta?.userAgent ?? null,
      extra: { channel: input.channel },
    });

    return {
      requestId,
      query,
      allowed: false,
      specialty: "高风险问题",
      summary: `${risk.title}。${risk.reason}`,
      clinicianFocus: [],
      suggestedActions: risk.safeActions,
      evidence: [],
      populationPathway: null,
      populationSignals: [],
      retrieval: {
        localCount: 0,
        pubmedCount: 0,
      },
      risk,
    };
  }

  const [corpus, localChunks, pubmedEvidence] = await Promise.all([
    loadCorpus(),
    loadChunks(),
    fetchPubMedEvidence(query),
  ]);
  const profile = buildQueryProfile(query, input.actor.specialty, corpus);

  const rankedLocal = rankCandidates({
    profile,
    records: corpus,
    chunks: localChunks,
    maxDocuments: 6,
    minimumScore: 26,
  });
  const rankedPubMed = rankCandidates({
    profile,
    records: pubmedEvidence.records,
    chunks: pubmedEvidence.chunks,
    maxDocuments: 3,
    minimumScore: 18,
  });

  const combined = [...rankedLocal, ...rankedPubMed]
    .sort(compareCandidates)
    .slice(0, 6);
  const specialty =
    profile.preferredSpecialty ||
    inferSpecialty(
      query,
      combined.map((candidate) => candidate.record),
    );
  const population = await findPopulationSignals({
    query,
    specialty,
    maxItems: 4,
  });
  const result: SearchResultView = {
    requestId,
    query,
    allowed: true,
    specialty,
    summary: composeSummary(specialty, combined),
    clinicianFocus: buildClinicianFocus(combined),
    suggestedActions: buildSuggestedActions(combined),
    evidence: combined.map(toEvidenceView),
    populationPathway: population.pathway,
    populationSignals: population.signals,
    retrieval: {
      localCount: rankedLocal.length,
      pubmedCount: rankedPubMed.length,
    },
  };

  await writeAuditEvent({
    event: "search.completed",
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    route: input.route,
    requestId,
    query,
    status: "ok",
    ip: input.requestMeta?.ip ?? null,
    userAgent: input.requestMeta?.userAgent ?? null,
    extra: {
      channel: input.channel,
      localCount: result.retrieval.localCount,
      pubmedCount: result.retrieval.pubmedCount,
    },
  });

  return result;
}
