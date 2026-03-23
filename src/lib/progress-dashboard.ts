import { readJsonFile } from "@/lib/storage";

type SourceAutomationReport = {
  generatedAt: string;
  summary: {
    totalJobs: number;
    healthyJobs: number;
    attentionJobs: number;
  };
  jobs: Array<{
    id: string;
    title: string;
    status: "healthy" | "needs_attention";
    activeSourceCount: number;
    preferredSourceCount: number;
    preferredSources: Array<{
      id: string;
      title: string;
      documentClass: string;
      searchPolicy: string;
      specialtyTags: string[];
      url: string;
    }>;
    issues: string[];
    gapActions: string[];
  }>;
};

type PackageInsertPriorityReport = {
  generatedAt: string;
  summary: {
    totalTargets: number;
    verifiedTargets: number;
    awaitingDirectLinks: number;
    notFoundInRegistry: number;
    priorityTier1Targets: number;
    priorityTier1AwaitingDirectLinks: number;
  };
  targets: Array<{
    id: string;
    category: string;
    label: string;
    query: string;
    priorityTier: number;
    status: string;
    resolverNotes: string;
    canonicalCandidate: {
      channel: string;
      brandName: string;
      specification: string;
      packSize: string;
      approvalNumber: string;
      approvedAt: string;
    } | null;
    canonicalSearchTerms: string[];
  }>;
};

type SourceSyncReport = {
  syncFinishedAt: string;
  sourceCount: number;
  recordCount: number;
  chunkCount: number;
  sources: Array<{
    id: string;
    sourceType: string;
    documentClass: string;
    searchPolicy: string;
    url: string;
    title: string;
    publishedAt: string;
    chunkCount: number;
  }>;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export async function loadProgressDashboard() {
  const [automation, priority, sync] = await Promise.all([
    readJsonFile<SourceAutomationReport>("normalized", "source-automation-report.json"),
    readJsonFile<PackageInsertPriorityReport>("normalized", "package-insert-priority-report.json"),
    readJsonFile<SourceSyncReport>("normalized", "source-sync-report.json"),
  ]);

  const priorityTier1 = priority.targets.filter((item) => item.priorityTier === 1);
  const verifiedPackageInserts = sync.sources.filter(
    (item) => item.sourceType === "drug_label" && item.documentClass === "drug_label",
  );

  return {
    hero: {
      lastUpdatedAt: formatDateTime(priority.generatedAt),
      corpusUpdatedAt: formatDateTime(sync.syncFinishedAt),
      statement:
        "当前页面展示的是仓库本地真实跑出来的自动化结果，包括官方源健康度、统一证据库规模，以及三条优先药的 package insert 解析进度。",
    },
    metrics: [
      {
        label: "自动化任务",
        value: `${automation.summary.healthyJobs}/${automation.summary.totalJobs}`,
        detail: "正式源更新任务健康运行",
      },
      {
        label: "统一证据库",
        value: `${sync.recordCount} 条`,
        detail: `${sync.sourceCount} 个正式来源，${sync.chunkCount} 个 chunk`,
      },
      {
        label: "已核验直链",
        value: `${verifiedPackageInserts.length} 条`,
        detail: "NMPA package insert 官方 PDF 直链",
      },
      {
        label: "一级优先药",
        value: `${priority.summary.priorityTier1Targets} 条`,
        detail: `${priority.summary.priorityTier1AwaitingDirectLinks} 条待核验附件 URL`,
      },
    ],
    sourceMix: [
      {
        label: "中国指南",
        count: sync.sources.filter((item) => item.sourceType === "china_guideline").length,
      },
      {
        label: "NMPA 核准",
        count: sync.sources.filter((item) => item.sourceType === "nmpa_drug_notice").length,
      },
      {
        label: "Package Insert",
        count: verifiedPackageInserts.length,
      },
      {
        label: "FDA 标签",
        count: sync.sources.filter((item) => item.sourceType === "fda_label").length,
      },
    ],
    officialJobs: automation.jobs,
    priorityTier1,
    sourceInventory: sync.sources,
  };
}
