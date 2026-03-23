import type {
  PopulationPathwayView,
  PopulationSignalRecord,
  PopulationSignalView,
} from "@/lib/population-signal-schema";
import { readJsonFile } from "@/lib/storage";

type ProgramProfile = {
  programId: string;
  diseaseArea: string;
  targetPopulation: string;
  specialty: string;
  keywords: string[];
  searchText: string;
  signals: PopulationSignalRecord[];
};

type RankedProgram = {
  profile: ProgramProfile;
  score: number;
  matchedTerms: string[];
};

const STAGE_ORDER = {
  risk_screening: 0,
  early_warning: 1,
  diagnosis: 2,
  treatment_selection: 3,
  response_monitoring: 4,
  adverse_event_monitoring: 5,
  recurrence_followup: 6,
} as const;

const GENERIC_TERMS = new Set([
  "中国",
  "人群",
  "患者",
  "病程",
  "预测",
  "预警",
  "诊断",
  "治疗",
  "监测",
  "随访",
  "复发",
  "风险",
  "队列",
  "cohort",
  "chinese",
  "china",
]);

let cachedSignals: PopulationSignalRecord[] | null = null;
let cachedProfiles: ProgramProfile[] | null = null;

function normalizeText(input: string) {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function tokenize(input: string) {
  const normalized = normalizeText(input);
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

  return Array.from(tokens);
}

function specialtySeed(specialty?: string) {
  switch (specialty) {
    case "肿瘤":
      return "肺癌 EGFR NSCLC MRD 耐药 复发";
    case "心血管":
      return "房颤 抗凝 出血 卒中";
    case "内分泌":
      return "糖尿病 CKD 肾病 蛋白尿";
    default:
      return specialty || "";
  }
}

function inferProgramSpecialty(signal: PopulationSignalRecord) {
  const text = normalizeText(
    `${signal.diseaseArea} ${signal.targetPopulation} ${signal.keywords.join(" ")}`,
  );

  if (text.includes("肺癌") || text.includes("nsclc") || text.includes("egfr")) {
    return "肿瘤";
  }

  if (text.includes("房颤") || text.includes("抗凝") || text.includes("卒中")) {
    return "心血管";
  }

  if (text.includes("糖尿病") || text.includes("ckd") || text.includes("肾病")) {
    return "内分泌";
  }

  return "综合";
}

async function loadPopulationSignals() {
  if (!cachedSignals) {
    cachedSignals = await readJsonFile<PopulationSignalRecord[]>(
      "normalized",
      "population-signals.json",
    );
  }

  return cachedSignals;
}

async function loadProgramProfiles() {
  if (cachedProfiles) {
    return cachedProfiles;
  }

  const signals = await loadPopulationSignals();
  const grouped = new Map<string, PopulationSignalRecord[]>();

  for (const signal of signals) {
    const items = grouped.get(signal.programId) ?? [];
    items.push(signal);
    grouped.set(signal.programId, items);
  }

  cachedProfiles = Array.from(grouped.entries()).map(([programId, items]) => {
    const primary = items[0];
    const keywords = uniqueStrings([
      primary.diseaseArea,
      primary.targetPopulation,
      ...items.flatMap((signal) => signal.keywords),
      ...items.map((signal) => signal.signalName),
    ]);

    return {
      programId,
      diseaseArea: primary.diseaseArea,
      targetPopulation: primary.targetPopulation,
      specialty: inferProgramSpecialty(primary),
      keywords,
      searchText: normalizeText(
        [
          primary.diseaseArea,
          primary.targetPopulation,
          ...keywords,
          ...items.map((signal) => `${signal.signalName} ${signal.operatingNote}`),
        ].join(" "),
      ),
      signals: items,
    };
  });

  return cachedProfiles;
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

function scoreProgram(query: string, specialty: string | undefined, profile: ProgramProfile) {
  const normalizedQuery = normalizeText(query);
  const tokens = tokenize(query).filter((token) => !GENERIC_TERMS.has(token));
  let score = 0;

  const matchedTerms = profile.keywords.filter((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    return normalizedKeyword && normalizedQuery.includes(normalizedKeyword);
  });

  if (normalizedQuery.includes(normalizeText(profile.diseaseArea))) {
    score += 24;
  }

  if (normalizedQuery.includes(normalizeText(profile.targetPopulation))) {
    score += 20;
  }

  score += matchedTerms.length * 8;
  score += countTokenHits(profile.searchText, tokens) * 4;

  if (specialty && specialty === profile.specialty) {
    score += 8;
  } else if (specialty && specialty !== "综合") {
    score -= 3;
  }

  if (profile.searchText.includes(normalizedQuery) && normalizedQuery.length > 4) {
    score += 10;
  }

  return {
    profile,
    score,
    matchedTerms: matchedTerms.slice(0, 6),
  };
}

function stageIntentBoost(query: string, signal: PopulationSignalRecord) {
  const normalizedQuery = normalizeText(query);
  let score = 0;

  switch (signal.stage) {
    case "risk_screening":
      if (
        normalizedQuery.includes("风险") ||
        normalizedQuery.includes("筛查") ||
        normalizedQuery.includes("高危")
      ) {
        score += 10;
      }
      break;
    case "early_warning":
      if (
        normalizedQuery.includes("预警") ||
        normalizedQuery.includes("耐药") ||
        normalizedQuery.includes("mrd") ||
        normalizedQuery.includes("复发")
      ) {
        score += 12;
      }
      break;
    case "diagnosis":
      if (
        normalizedQuery.includes("诊断") ||
        normalizedQuery.includes("分型") ||
        normalizedQuery.includes("伴随")
      ) {
        score += 10;
      }
      break;
    case "treatment_selection":
      if (
        normalizedQuery.includes("治疗") ||
        normalizedQuery.includes("方案") ||
        normalizedQuery.includes("二线") ||
        normalizedQuery.includes("用药")
      ) {
        score += 12;
      }
      break;
    case "response_monitoring":
    case "adverse_event_monitoring":
    case "recurrence_followup":
      if (
        normalizedQuery.includes("监测") ||
        normalizedQuery.includes("随访") ||
        normalizedQuery.includes("毒性") ||
        normalizedQuery.includes("不良")
      ) {
        score += 11;
      }
      break;
    default:
      break;
  }

  return score;
}

function scoreSignal(query: string, signal: PopulationSignalRecord) {
  const normalizedQuery = normalizeText(query);
  const tokens = tokenize(query).filter((token) => !GENERIC_TERMS.has(token));
  const haystack = normalizeText(
    [
      signal.signalName,
      signal.diseaseArea,
      signal.targetPopulation,
      signal.operatingNote,
      signal.stage,
      signal.intent,
      ...signal.keywords,
      ...signal.evidence.map((item) => `${item.title} ${item.summary}`),
    ].join(" "),
  );

  let score = 0;
  score += countTokenHits(haystack, tokens) * 4;
  score += stageIntentBoost(query, signal);

  if (haystack.includes(normalizedQuery) && normalizedQuery.length > 4) {
    score += 10;
  }

  if (signal.stage === "early_warning" || signal.stage === "risk_screening") {
    score += 2;
  }

  score += Math.min(signal.evidenceCount, 6);
  return score;
}

export function stageLabel(stage: PopulationSignalRecord["stage"]) {
  switch (stage) {
    case "risk_screening":
      return "风险预测";
    case "early_warning":
      return "预警信号";
    case "diagnosis":
      return "诊断分型";
    case "treatment_selection":
      return "治疗选择";
    case "response_monitoring":
      return "疗效监测";
    case "adverse_event_monitoring":
      return "不良事件监测";
    case "recurrence_followup":
      return "复发随访";
    default:
      return "病程信号";
  }
}

export function intentLabel(intent: PopulationSignalRecord["intent"]) {
  switch (intent) {
    case "prediction":
      return "预测";
    case "warning":
      return "预警";
    case "diagnosis":
      return "诊断";
    case "treatment":
      return "治疗";
    case "monitoring":
      return "监测";
    default:
      return "信号";
  }
}

function signalView(signal: PopulationSignalRecord): PopulationSignalView {
  return {
    id: signal.id,
    signalName: signal.signalName,
    diseaseArea: signal.diseaseArea,
    targetPopulation: signal.targetPopulation,
    stage: stageLabel(signal.stage),
    intent: intentLabel(signal.intent),
    evidenceCount: signal.evidenceCount,
    operatingNote: signal.operatingNote,
    leadEvidence: signal.evidence[0]
      ? {
          title: signal.evidence[0].title,
          journal: signal.evidence[0].journal,
          year: signal.evidence[0].publishedAt.slice(0, 4),
          summary: signal.evidence[0].summary,
          url: signal.evidence[0].url,
        }
      : undefined,
  };
}

function buildPathway(
  program: RankedProgram,
  selectedSignals: PopulationSignalRecord[],
): PopulationPathwayView {
  const stagesCovered = uniqueStrings(
    selectedSignals
      .sort(
        (left, right) =>
          STAGE_ORDER[left.stage] - STAGE_ORDER[right.stage],
      )
      .map((signal) => stageLabel(signal.stage)),
  );

  const nextFocus = new Set<string>();

  if (
    selectedSignals.some(
      (signal) => signal.stage === "risk_screening" || signal.stage === "early_warning",
    )
  ) {
    nextFocus.add("先定义中国人群高危分层、触发阈值和预警升级条件。");
  }

  if (selectedSignals.some((signal) => signal.stage === "diagnosis")) {
    nextFocus.add("把分型、伴随诊断和关键检测节点单独列成一段。");
  }

  if (selectedSignals.some((signal) => signal.stage === "treatment_selection")) {
    nextFocus.add("把治疗选择与中国指南、NMPA/FDA 适应症边界并排解释。");
  }

  if (
    selectedSignals.some((signal) =>
      [
        "response_monitoring",
        "adverse_event_monitoring",
        "recurrence_followup",
      ].includes(signal.stage),
    )
  ) {
    nextFocus.add("明确疗效、毒性和复发随访的监测频率与升级条件。");
  }

  return {
    programId: program.profile.programId,
    diseaseArea: program.profile.diseaseArea,
    targetPopulation: program.profile.targetPopulation,
    matchedTerms: program.matchedTerms,
    stagesCovered,
    summary:
      program.matchedTerms.length > 0
        ? `当前问题已收敛到 ${program.profile.targetPopulation} 路径，命中关键词 ${program.matchedTerms.join("、")}，覆盖阶段 ${stagesCovered.join(" / ")}。`
        : `当前问题已收敛到 ${program.profile.targetPopulation} 路径，覆盖阶段 ${stagesCovered.join(" / ")}。`,
    nextFocus: Array.from(nextFocus).slice(0, 3),
  };
}

export async function findPopulationSignals(input: {
  query?: string;
  specialty?: string;
  maxItems?: number;
}): Promise<{
  pathway: PopulationPathwayView | null;
  signals: PopulationSignalView[];
}> {
  const profiles = await loadProgramProfiles();
  const resolvedQuery = `${input.query || ""} ${specialtySeed(input.specialty)}`.trim();
  const rankedPrograms = profiles
    .map((profile) => scoreProgram(resolvedQuery, input.specialty, profile))
    .sort((left, right) => right.score - left.score);

  const topProgram = rankedPrograms[0];

  if (!topProgram || topProgram.score < 10) {
    return {
      pathway: null,
      signals: [],
    };
  }

  const selectedSignals = topProgram.profile.signals
    .map((signal) => ({
      signal,
      score: scoreSignal(resolvedQuery, signal),
    }))
    .filter((item) => item.score >= 8)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return STAGE_ORDER[left.signal.stage] - STAGE_ORDER[right.signal.stage];
    })
    .slice(0, input.maxItems ?? 4)
    .map((item) => item.signal);

  if (!selectedSignals.length) {
    return {
      pathway: null,
      signals: [],
    };
  }

  return {
    pathway: buildPathway(topProgram, selectedSignals),
    signals: selectedSignals.map(signalView),
  };
}
