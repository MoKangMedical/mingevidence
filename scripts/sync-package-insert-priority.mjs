import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const automationDir = path.join(repoRoot, "data", "automation");
const sourcesDir = path.join(repoRoot, "data", "sources");
const normalizedDir = path.join(repoRoot, "data", "normalized");
const runtimeDir = path.join(repoRoot, "data", "runtime");
const targetsFile = path.join(automationDir, "package-insert-priority.targets.json");
const resolverOverridesFile = path.join(
  automationDir,
  "package-insert-link-resolver.overrides.json",
);
const reportFile = path.join(normalizedDir, "package-insert-priority-report.json");
const runtimeLogFile = path.join(runtimeDir, "package-insert-priority-log.ndjson");
const manifestFile = path.join(sourcesDir, "nmpa-package-inserts.sources.json");
const fetchTimeoutMs = 20_000;
const maxAttempts = 3;

const userAgent = "Mozilla/5.0 (compatible; MingEvidence/0.3; official-source-sync)";

const channelConfigs = {
  domestic: {
    id: "domestic",
    appid: "apigcypcx",
    tokenKey: "38815ed198c54e70a7a9c6f31a364f64",
    queryKey: "636df98d813444f4a96c7560dfc34972",
    referer: "https://app.gjzwfw.gov.cn/jmopen/webapp/html5/datasearchgcyp/index.html",
  },
  import: {
    id: "import",
    appid: "apijkypcx",
    tokenKey: "4a6216172a7f41b79c11df7e157caf3d",
    queryKey: "daa30fdf30db45b4a5f50631e6e8aa44",
    referer: "https://app.gjzwfw.gov.cn/jmopen/webapp/html5/datasearchjkyp/index.html",
  },
};

async function loadJson(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function loadOptionalJson(filePath, fallback) {
  try {
    return await loadJson(filePath);
  } catch {
    return fallback;
  }
}

function normalizeText(input) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function createHeaders(referer) {
  return {
    "User-Agent": userAgent,
    Referer: referer,
    Origin: "https://app.gjzwfw.gov.cn",
    "X-Requested-With": "XMLHttpRequest",
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function signRequest(appid) {
  const requestTime = `${Date.now()}`;
  const sign = crypto.createHash("md5").update(`${appid}${requestTime}`).digest("hex");
  return { requestTime, sign };
}

async function getAccessToken(session, config) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await session.fetch(config.referer, {
        headers: { "User-Agent": userAgent },
      });
      await session.fetch(
        `https://app.gjzwfw.gov.cn/jmopen/verifyCode.do?width=100&height=55&random=${Math.random()}`,
        {
          headers: {
            "User-Agent": userAgent,
            Referer: config.referer,
          },
        },
      );

      const { requestTime, sign } = signRequest(config.appid);
      const response = await session.fetch("https://app.gjzwfw.gov.cn/jimps/link.do", {
        method: "POST",
        headers: createHeaders(config.referer),
        body: new URLSearchParams({
          param: JSON.stringify({
            from: "1",
            key: config.tokenKey,
            requestTime,
            sign,
          }),
        }),
      });

      const payload = await response.json();

      if (!payload.access_token) {
        throw new Error(JSON.stringify(payload));
      }

      return payload.access_token;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await delay(400 * attempt);
      }
    }
  }

  throw new Error(
    `Failed to obtain access token for ${config.id}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

function parseApprovedAt(value) {
  const date = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function sortByApprovedAtDesc(items) {
  return [...items].sort((left, right) =>
    parseApprovedAt(right.approvedAt).localeCompare(parseApprovedAt(left.approvedAt)),
  );
}

function textIncludesAny(text, values = []) {
  const haystack = normalizeText(text);
  if (!haystack) {
    return false;
  }

  return values.some((value) => {
    const needle = normalizeText(value);
    return needle && (haystack.includes(needle) || needle.includes(haystack));
  });
}

function parseDateScore(value) {
  const approvedAt = parseApprovedAt(value);
  if (!approvedAt) {
    return 0;
  }

  return Number(approvedAt.replaceAll("-", ""));
}

function scoreCandidate(target, record, override = {}) {
  let score = 0;
  const preferredChannels = override.preferredChannels ?? target.channels ?? [];
  const channelIndex = preferredChannels.indexOf(record.channel);

  if (channelIndex >= 0) {
    score += (preferredChannels.length - channelIndex) * 24;
  }

  if (textIncludesAny(record.brandName, target.brandHints) || textIncludesAny(record.brandNameEnglish, target.brandHints)) {
    score += 40;
  }

  if (textIncludesAny(record.approvalNumber, override.preferredApprovalNumbers)) {
    score += 120;
  }

  if (
    textIncludesAny(record.packSize, override.preferredPackageKeywords) ||
    textIncludesAny(record.specification, override.preferredPackageKeywords)
  ) {
    score += 24;
  }

  if (textIncludesAny(record.packSize, override.packagingHints)) {
    score += 36;
  }

  if (textIncludesAny(record.packSize, ["盒", "支"])) {
    score += 12;
  }

  if (textIncludesAny(record.packSize, ["桶", "瓶（工业包装）", "工业包装"])) {
    score -= 28;
  }

  if (textIncludesAny(record.genericName, [target.query, target.label])) {
    score += 8;
  }

  if (record.channel === "import" && (target.brandHints ?? []).length > 0) {
    score += 8;
  }

  score += Math.floor(parseDateScore(record.approvedAt) / 10000);

  return score;
}

function buildCandidateSearchTerms(target, candidate) {
  return [
    candidate.approvalNumber,
    candidate.originalApprovalNumber,
    candidate.genericName,
    candidate.brandName,
    candidate.brandNameEnglish,
    target.label,
  ].filter(Boolean);
}

function recordMatchesManifest(record, manifestEntries) {
  const haystacks = [
    normalizeText(record.genericName),
    normalizeText(record.brandName),
    normalizeText(record.approvalNumber),
  ].filter(Boolean);

  return manifestEntries.find((entry) => {
    const needles = [
      normalizeText(entry.titleHint),
      normalizeText(entry.url),
      ...((entry.keywords ?? []).map(normalizeText)),
      ...((entry.interventionTags ?? []).map(normalizeText)),
    ].filter(Boolean);

    return haystacks.some((haystack) => needles.some((needle) => needle.includes(haystack) || haystack.includes(needle)));
  });
}

async function queryDrugRegistry(session, config, token, query) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { requestTime, sign } = signRequest(config.appid);
      const response = await session.fetch("https://app.gjzwfw.gov.cn/jimps/link.do", {
        method: "POST",
        headers: createHeaders(config.referer),
        body: new URLSearchParams({
          param: JSON.stringify({
            from: "1",
            key: config.queryKey,
            requestTime,
            sign,
            access_token: token,
            yppzwh: "",
            yptymc: query,
          }),
        }),
      });

      const payload = await response.json();
      const values = Array.isArray(payload.value) ? payload.value : [];

      return values.map((item) => ({
        channel: config.id,
        genericName: item.yptymc ?? "",
        englishName: item.yptymcyw ?? "",
        brandName: item.ypspmc ?? "",
        brandNameEnglish: item.ypspmcyw ?? "",
        dosageForm: item.jx ?? "",
        specification: item.ypgg ?? "",
        packSize: item.bzgg ?? "",
        approvalNumber: item.yppzwh ?? "",
        originalApprovalNumber: item.ypyzczh ?? item.ypypzwh ?? "",
        approvedAt: item.pzrq ?? "",
        approvalExpiresAt: item.yppzwhyxq ?? "",
        marketingAuthorizationHolder: item.ssxkcyr && item.ssxkcyr !== "————" && item.ssxkcyr !== "----" ? item.ssxkcyr : item.ssxkcyryw ?? "",
        manufacturer: item.ypscqymc ?? item.qymcyw ?? "",
        manufacturerCountry: item.dzgjhdq_scc ?? "",
        manufacturingAddress: item.scdz ?? item.scdzyw ?? "",
        drugCode: item.ypbm ?? "",
        drugClass: item.ypfl ?? "",
      }));
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await delay(500 * attempt);
      }
    }
  }

  throw new Error(
    `Failed to query ${config.id} registry for ${query}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function main() {
  const targetConfig = await loadJson(targetsFile);
  const resolverOverrides = await loadOptionalJson(resolverOverridesFile, { targets: {} });
  const manifestEntries = await loadJson(manifestFile);

  const session = {
    fetch: (url, options = {}) =>
      fetch(url, {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(fetchTimeoutMs),
      }),
  };
  const tokenCache = new Map();
  const results = [];

  for (const target of targetConfig.targets) {
    const resolved = [];
    const override = resolverOverrides.targets?.[target.id] ?? {};
    const channelErrors = [];

    for (const channel of target.channels) {
      const config = channelConfigs[channel];

      if (!config) {
        continue;
      }

      try {
        if (!tokenCache.has(channel)) {
          tokenCache.set(channel, await getAccessToken(session, config));
        }

        const token = tokenCache.get(channel);
        const items = await queryDrugRegistry(session, config, token, target.query);
        resolved.push(...items);
      } catch (error) {
        channelErrors.push({
          channel,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const deduped = Array.from(
      new Map(
        resolved.map((item) => [`${item.channel}:${item.approvalNumber}:${item.specification}`, item]),
      ).values(),
    );

    const ranked = sortByApprovedAtDesc(deduped)
      .map((item) => ({
        ...item,
        resolverScore: scoreCandidate(target, item, override),
      }))
      .sort((left, right) => right.resolverScore - left.resolverScore);
    const matchedManifest = ranked
      .map((item) => ({
        record: item,
        manifestEntry: recordMatchesManifest(item, manifestEntries),
      }))
      .filter((item) => item.manifestEntry);
    const canonicalCandidate = ranked[0] ?? null;
    const verifiedDirectLinks = matchedManifest.map((item) => ({
      approvalNumber: item.record.approvalNumber,
      title: item.manifestEntry.titleHint,
      url: item.manifestEntry.url,
    }));

    results.push({
      ...target,
      priorityTier: target.priorityTier ?? 2,
      registryHitCount: ranked.length,
      verifiedDirectLinkCount: verifiedDirectLinks.length,
      status:
        verifiedDirectLinks.length > 0
          ? "verified"
          : ranked.length > 0
            ? "awaiting_direct_link_verification"
            : "not_found_in_registry",
      resolverStatus: canonicalCandidate
        ? verifiedDirectLinks.length > 0
          ? "verified_direct_link"
          : "canonical_candidate_selected"
        : "no_candidate",
      resolverNotes:
        override.preferredApprovalNumbers?.length || override.preferredPackageKeywords?.length
          ? "已按优先批准文号、渠道和包装形态选择主候选。"
          : "已按渠道、商品名和包装形态选择主候选。",
      canonicalCandidate,
      canonicalSearchTerms: canonicalCandidate
        ? buildCandidateSearchTerms(target, canonicalCandidate)
        : [],
      topCandidates: ranked.slice(0, 6),
      verifiedDirectLinks,
      channelErrors,
      resolutionOverride: {
        preferredChannels: override.preferredChannels ?? [],
        preferredApprovalNumbers: override.preferredApprovalNumbers ?? [],
        preferredPackageKeywords: override.preferredPackageKeywords ?? [],
      },
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalTargets: results.length,
      verifiedTargets: results.filter((item) => item.status === "verified").length,
      awaitingDirectLinks: results.filter((item) => item.status === "awaiting_direct_link_verification").length,
      notFoundInRegistry: results.filter((item) => item.status === "not_found_in_registry").length,
      priorityTier1Targets: results.filter((item) => item.priorityTier === 1).length,
      priorityTier1AwaitingDirectLinks: results.filter(
        (item) => item.priorityTier === 1 && item.status === "awaiting_direct_link_verification",
      ).length,
    },
    targets: results,
  };

  await mkdir(normalizedDir, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await appendFile(
    runtimeLogFile,
    `${JSON.stringify({
      generatedAt: report.generatedAt,
      summary: report.summary,
    })}\n`,
    "utf8",
  );

  console.log(
    `Wrote package insert priority report with ${report.summary.awaitingDirectLinks} awaiting target(s) to ${reportFile}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
