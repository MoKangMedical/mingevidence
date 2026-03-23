import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const dataDir = path.join(repoRoot, "data");
const automationDir = path.join(dataDir, "automation");
const sourcesDir = path.join(dataDir, "sources");
const normalizedDir = path.join(dataDir, "normalized");
const runtimeDir = path.join(dataDir, "runtime");
const jobsFile = path.join(automationDir, "source-refresh.jobs.json");
const reportFile = path.join(normalizedDir, "source-automation-report.json");
const runtimeLogFile = path.join(runtimeDir, "source-automation-log.ndjson");

function normalizeText(input) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function loadJson(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

function entryMatchesTags(entry, tags = []) {
  if (!tags.length) {
    return true;
  }

  const entryTags = [
    ...(entry.specialtyTags ?? []),
    ...(entry.conditionTags ?? []),
    ...(entry.interventionTags ?? []),
    ...(entry.keywords ?? []),
  ].map((item) => normalizeText(item));

  return tags.some((tag) => {
    const normalizedTag = normalizeText(tag);
    return entryTags.some(
      (entryTag) =>
        entryTag.includes(normalizedTag) || normalizedTag.includes(entryTag),
    );
  });
}

function summarizeEntries(entries) {
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.titleHint || entry.id,
    documentClass: entry.documentClass || "reference",
    searchPolicy: entry.searchPolicy || "direct",
    specialtyTags: entry.specialtyTags ?? [],
    url: entry.url,
  }));
}

function analyzeCoverageGoals(job, entries) {
  return (job.coverageGoals ?? []).map((goal) => {
    const matched = entries.filter((entry) =>
      entryMatchesTags(entry, goal.specialtyTagsAnyOf ?? []),
    );
    const active = matched.filter(
      (entry) => (entry.searchPolicy || "direct") !== "exclude",
    );
    const preferred = active.filter((entry) =>
      (job.preferredDocumentClasses ?? []).includes(
        entry.documentClass || "reference",
      ),
    );

    return {
      label: goal.label,
      activeCount: active.length,
      preferredCount: preferred.length,
      status:
        active.length >= (goal.minimumActiveSources ?? 0) &&
        preferred.length >= (goal.minimumPreferredSources ?? 0)
          ? "healthy"
          : "gap",
      currentSources: summarizeEntries(active),
      gaps: [
        active.length < (goal.minimumActiveSources ?? 0)
          ? `活跃来源不足，当前 ${active.length} 条，目标至少 ${goal.minimumActiveSources} 条。`
          : null,
        preferred.length < (goal.minimumPreferredSources ?? 0)
          ? `正文级优选来源不足，当前 ${preferred.length} 条，目标至少 ${goal.minimumPreferredSources} 条。`
          : null,
      ].filter(Boolean),
    };
  });
}

function analyzePriorityDrugs(job, entries) {
  return (job.priorityDrugs ?? []).map((drug) => {
    const matched = entries.filter((entry) =>
      entryMatchesTags(entry, [drug]),
    );
    const preferredMatches = matched.filter((entry) =>
      (job.preferredDocumentClasses ?? []).includes(
        entry.documentClass || "reference",
      ),
    );

    return {
      drug,
      matchedCount: matched.length,
      preferredSourceCount: preferredMatches.length,
      status: preferredMatches.length > 0 ? "healthy" : "gap",
      currentSources: summarizeEntries(matched),
      gaps:
        preferredMatches.length > 0
          ? []
          : ["缺少该药品的优选官方具体药品来源。"],
    };
  });
}

function analyzeJob(job, manifests) {
  const entries = job.manifestFiles.flatMap((fileName) => manifests[fileName] ?? []);
  const activeEntries = entries.filter(
    (entry) => (entry.searchPolicy || "direct") !== "exclude",
  );
  const preferredEntries = activeEntries.filter((entry) =>
    (job.preferredDocumentClasses ?? []).includes(
      entry.documentClass || "reference",
    ),
  );

  const allowedIssues = entries
    .filter(
      (entry) =>
        !(job.allowedDocumentClasses ?? []).includes(
          entry.documentClass || "reference",
        ),
    )
    .map(
      (entry) =>
        `${entry.id} 的 documentClass=${entry.documentClass || "reference"} 不在允许范围内。`,
    );

  const policyIssues = activeEntries
    .filter(
      (entry) =>
        !(job.preferredSearchPolicies ?? []).includes(
          entry.searchPolicy || "direct",
        ),
    )
    .map(
      (entry) =>
        `${entry.id} 的 searchPolicy=${entry.searchPolicy || "direct"} 不在推荐范围内。`,
    );

  const coverage = analyzeCoverageGoals(job, entries);
  const priorityDrugs = analyzePriorityDrugs(job, entries);
  const issues = [
    ...allowedIssues,
    ...policyIssues,
    ...coverage.flatMap((item) => item.gaps),
    ...priorityDrugs.flatMap((item) => item.gaps.map((gap) => `${item.drug}：${gap}`)),
  ];

  return {
    id: job.id,
    title: job.title,
    sourceType: job.sourceType,
    manifestFiles: job.manifestFiles,
    activeSourceCount: activeEntries.length,
    preferredSourceCount: preferredEntries.length,
    preferredSources: summarizeEntries(preferredEntries),
    coverage,
    priorityDrugs,
    status: issues.length ? "needs_attention" : "healthy",
    issues,
    gapActions: job.gapActions ?? [],
  };
}

async function main() {
  const config = await loadJson(jobsFile);
  const manifests = {};

  for (const job of config.jobs) {
    for (const fileName of job.manifestFiles) {
      if (!manifests[fileName]) {
        manifests[fileName] = await loadJson(path.join(sourcesDir, fileName));
      }
    }
  }

  const jobs = config.jobs.map((job) => analyzeJob(job, manifests));
  const report = {
    generatedAt: new Date().toISOString(),
    jobs,
    summary: {
      totalJobs: jobs.length,
      healthyJobs: jobs.filter((job) => job.status === "healthy").length,
      attentionJobs: jobs.filter((job) => job.status !== "healthy").length,
    },
  };

  await mkdir(normalizedDir, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await appendFile(
    runtimeLogFile,
    `${JSON.stringify({
      generatedAt: report.generatedAt,
      summary: report.summary,
      jobs: jobs.map((job) => ({
        id: job.id,
        status: job.status,
        issues: job.issues.length,
      })),
    })}\n`,
    "utf8",
  );

  console.log(
    `Wrote source automation report with ${report.summary.attentionJobs} attention job(s) to ${reportFile}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
