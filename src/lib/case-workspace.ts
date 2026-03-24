import { randomUUID } from "node:crypto";

import type { DoctorSession } from "@/lib/auth";
import { findPopulationSignals } from "@/lib/population-signal-service";
import type {
  PopulationPathwayView,
  PopulationSignalView,
} from "@/lib/population-signal-schema";
import { readOptionalJsonFile, writeJsonFile } from "@/lib/storage";

const CASE_STORE_FILE = ["runtime", "case-workspaces.json"] as const;

export type CaseWorkspaceMessage = {
  id: string;
  role: "doctor" | "assistant";
  createdAt: string;
  content: string;
  highlights?: string[];
  nextSteps?: string[];
  citations?: string[];
};

export type CaseWorkspaceRecord = {
  id: string;
  title: string;
  focusQuery: string;
  patientSummary: string;
  status: "active" | "monitoring";
  createdAt: string;
  updatedAt: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  hospital: string;
  pathway: PopulationPathwayView | null;
  signals: PopulationSignalView[];
  messages: CaseWorkspaceMessage[];
};

type CreateCaseWorkspaceInput = {
  title?: string;
  focusQuery: string;
  patientSummary?: string;
  doctor: DoctorSession;
};

type FollowUpInput = {
  caseId: string;
  question: string;
  doctor: DoctorSession;
};

function normalizeText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function clampText(input: string, maxLength: number) {
  const normalized = normalizeText(input);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function inferCaseTitle(title: string | undefined, focusQuery: string) {
  if (title?.trim()) {
    return clampText(title, 42);
  }

  return clampText(focusQuery, 42);
}

function stageLabel(value: string) {
  switch (value) {
    case "risk_screening":
      return "风险筛查";
    case "early_warning":
      return "早期预警";
    case "diagnosis":
      return "诊断与分型";
    case "treatment_selection":
      return "治疗选择";
    case "response_monitoring":
      return "疗效监测";
    case "adverse_event_monitoring":
      return "不良事件监测";
    case "recurrence_followup":
      return "复发随访";
    default:
      return value;
  }
}

async function readCaseWorkspaces() {
  return readOptionalJsonFile<CaseWorkspaceRecord[]>([], ...CASE_STORE_FILE);
}

async function persistCaseWorkspaces(records: CaseWorkspaceRecord[]) {
  const sorted = [...records].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  await writeJsonFile(sorted, ...CASE_STORE_FILE);
  return sorted;
}

function buildAssistantMessage(args: {
  caseTitle: string;
  focusQuery: string;
  patientSummary: string;
  pathway: PopulationPathwayView | null;
  signals: PopulationSignalView[];
  followUpQuestion?: string;
}) {
  const signalFocus = args.signals.slice(0, 3);
  const citations = signalFocus
    .map((signal) => signal.leadEvidence?.title)
    .filter((value): value is string => Boolean(value));

  if (args.followUpQuestion) {
    return {
      id: randomUUID(),
      role: "assistant" as const,
      createdAt: new Date().toISOString(),
      content: args.pathway
        ? `围绕“${args.followUpQuestion}”，当前最稳的继续研判路径仍然落在 ${args.pathway.diseaseArea} 的中国人群病程上。建议先沿着 ${args.pathway.stagesCovered.slice(0, 3).join("、")} 这几段复核关键变量，再决定是否扩大检索范围。`
        : `围绕“${args.followUpQuestion}”，当前还没有形成稳定的人群路径。建议先补充分型、线别、并发症或当前用药，再继续追问。`,
      highlights: signalFocus.map(
        (signal) => `${stageLabel(signal.stage)}: ${signal.signalName}`,
      ),
      nextSteps: args.pathway
        ? args.pathway.nextFocus.slice(0, 3)
        : [
            "补充患者关键变量后再次追问",
            "并行查看搜索结果页的正式证据",
            "必要时转入人工 MDT 讨论",
          ],
      citations,
    };
  }

  return {
    id: randomUUID(),
    role: "assistant" as const,
    createdAt: new Date().toISOString(),
    content: args.pathway
      ? `病例已进入 ${args.pathway.diseaseArea} 全病程路径。当前工作台会优先围绕中国指南、监管边界和中国人群信号组织后续追问，避免每次都从零开始。`
      : "病例已创建，但当前还没有稳定的中国人群路径。建议先补充分层信息，再继续在工作台内追问。",
    highlights: signalFocus.map(
      (signal) => `${stageLabel(signal.stage)}: ${signal.operatingNote}`,
    ),
    nextSteps: args.pathway
      ? args.pathway.nextFocus.slice(0, 3)
      : [
          "补充诊断和病程摘要",
          "明确当前治疗阶段",
          "用更具体的问题继续追问",
        ],
    citations,
  };
}

async function buildCaseContext(
  doctor: DoctorSession,
  focusQuery: string,
  patientSummary: string,
) {
  const population = await findPopulationSignals({
    query: [focusQuery, patientSummary].filter(Boolean).join(" "),
    specialty: doctor.specialty,
    maxItems: 5,
  });

  return {
    pathway: population.pathway,
    signals: population.signals,
  };
}

export async function listCaseWorkspaces(doctorId: string) {
  const cases = await readCaseWorkspaces();
  return cases.filter((item) => item.doctorId === doctorId);
}

export async function getCaseWorkspace(caseId: string, doctorId: string) {
  const cases = await readCaseWorkspaces();
  return (
    cases.find((item) => item.id === caseId && item.doctorId === doctorId) ?? null
  );
}

export async function createCaseWorkspace(input: CreateCaseWorkspaceInput) {
  const focusQuery = clampText(input.focusQuery, 240);
  const patientSummary = clampText(
    input.patientSummary || "待补充病程摘要",
    1000,
  );
  const context = await buildCaseContext(input.doctor, focusQuery, patientSummary);
  const createdAt = new Date().toISOString();
  const title = inferCaseTitle(input.title, focusQuery);

  const caseRecord: CaseWorkspaceRecord = {
    id: randomUUID(),
    title,
    focusQuery,
    patientSummary,
    status: "active",
    createdAt,
    updatedAt: createdAt,
    doctorId: input.doctor.id,
    doctorName: input.doctor.name,
    specialty: input.doctor.specialty,
    hospital: input.doctor.hospital,
    pathway: context.pathway,
    signals: context.signals,
    messages: [
      {
        id: randomUUID(),
        role: "doctor",
        createdAt,
        content: `建立病例工作台：${focusQuery}`,
        highlights: patientSummary ? [patientSummary] : undefined,
      },
      buildAssistantMessage({
        caseTitle: title,
        focusQuery,
        patientSummary,
        pathway: context.pathway,
        signals: context.signals,
      }),
    ],
  };

  const records = await readCaseWorkspaces();
  await persistCaseWorkspaces([caseRecord, ...records]);
  return caseRecord;
}

export async function appendCaseFollowUp(input: FollowUpInput) {
  const records = await readCaseWorkspaces();
  const current = records.find(
    (item) => item.id === input.caseId && item.doctorId === input.doctor.id,
  );

  if (!current) {
    return null;
  }

  const doctorMessage: CaseWorkspaceMessage = {
    id: randomUUID(),
    role: "doctor",
    createdAt: new Date().toISOString(),
    content: clampText(input.question, 800),
  };

  const context = await buildCaseContext(
    input.doctor,
    [current.focusQuery, input.question].join(" "),
    current.patientSummary,
  );

  const assistantMessage = buildAssistantMessage({
    caseTitle: current.title,
    focusQuery: current.focusQuery,
    patientSummary: current.patientSummary,
    pathway: context.pathway,
    signals: context.signals,
    followUpQuestion: input.question,
  });

  const updatedRecord: CaseWorkspaceRecord = {
    ...current,
    updatedAt: assistantMessage.createdAt,
    pathway: context.pathway,
    signals: context.signals,
    messages: [...current.messages, doctorMessage, assistantMessage],
  };

  await persistCaseWorkspaces(
    records.map((item) => (item.id === updatedRecord.id ? updatedRecord : item)),
  );

  return updatedRecord;
}
