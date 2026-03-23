import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourcesDir = path.join(repoRoot, "data", "sources");
const outDir = path.join(repoRoot, "data", "normalized");
const recordsOutFile = path.join(outDir, "evidence-records.json");
const chunksOutFile = path.join(outDir, "evidence-chunks.json");
const reportOutFile = path.join(outDir, "source-sync-report.json");

const defaultHeaders = {
  "User-Agent": "MingEvidence/0.2 (clinical evidence ingestion prototype)",
};

async function loadJson(fileName) {
  const content = await readFile(path.join(sourcesDir, fileName), "utf8");
  return JSON.parse(content);
}

function decodeHtmlEntities(input) {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function normalizeWhitespace(input) {
  return input
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]+\n/g, "\n")
    .replace(/\n[ ]+/g, "\n")
    .trim();
}

function stripHtml(html) {
  return normalizeWhitespace(
    decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|h1|h2|h3|li|tr|section)>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function sliceBetweenMarkers(text, startMarker, endMarker) {
  let output = text;

  if (startMarker) {
    const index = output.indexOf(startMarker);
    if (index >= 0) {
      output = output.slice(index);
    }
  }

  if (endMarker) {
    const index = output.indexOf(endMarker);
    if (index >= 0) {
      output = output.slice(0, index + endMarker.length);
    }
  }

  return normalizeWhitespace(output);
}

function removeLeadingTitle(text, title) {
  if (!title) {
    return text;
  }

  const normalizedTitle = normalizeWhitespace(title);

  if (text.startsWith(normalizedTitle)) {
    return normalizeWhitespace(text.slice(normalizedTitle.length));
  }

  return text;
}

function parseHtmlTitle(html, source) {
  const match =
    html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
    html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);

  const title = match
    ? stripHtml(match[1]).replace(/begin-->|end-->/gi, "")
    : source.titleHint;
  return normalizeWhitespace(title || source.titleHint || source.id);
}

function parsePublishedAt(html, fallback) {
  const plain = stripHtml(html);
  const match =
    plain.match(/发布时间[:：]\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/) ??
    plain.match(/发布时间[:：]\s*([0-9]{4}年[0-9]{1,2}月[0-9]{1,2}日)/) ??
    plain.match(/([0-9]{4}-[0-9]{2}-[0-9]{2})/);

  if (!match) {
    return fallback;
  }

  return match[1]
    .replace(/年/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "")
    .replace(/\s+/g, "");
}

function buildSearchText(parts) {
  return normalizeWhitespace(
    parts
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " "),
  );
}

function firstSentences(text, count = 2) {
  const sentences = normalizeWhitespace(text)
    .split(/(?<=[。！？!?.；;])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences.slice(0, count).join(" ");
}

function extractSummary(text, hint) {
  if (hint) {
    return hint;
  }

  const summary = firstSentences(text, 2);
  return summary || normalizeWhitespace(text).slice(0, 160);
}

function splitIntoChunks(text, maxLength = 240) {
  const paragraphs = normalizeWhitespace(text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= 12);
  const chunks = [];

  for (const paragraph of paragraphs) {
    const sentences = paragraph
      .split(/(?<=[。！？!?.；;])/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    if (!sentences.length) {
      continue;
    }

    let current = "";

    for (const sentence of sentences) {
      const next = current ? `${current} ${sentence}` : sentence;

      if (next.length <= maxLength) {
        current = next;
        continue;
      }

      if (current) {
        chunks.push(current);
      }

      current = sentence;
    }

    if (current) {
      chunks.push(current);
    }
  }

  return chunks;
}

function splitIntoSections(text) {
  const normalized = normalizeWhitespace(text);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const sections = [];
  let currentTitle = "";
  let currentLines = [];

  const pushCurrent = () => {
    const content = normalizeWhitespace(currentLines.join("\n"));

    if (!content || content.length < 16) {
      return;
    }

    sections.push({
      title: currentTitle || "正文",
      content,
    });
  };

  for (const line of lines) {
    const isHeading =
      /^(第[一二三四五六七八九十0-9]+[章节部分]|[一二三四五六七八九十]+[、.]|\d+[、.])/.test(
        line,
      ) ||
      /^[A-Z][A-Z\s/&-]{4,}$/.test(line);

    if (isHeading && currentLines.length) {
      pushCurrent();
      currentTitle = line;
      currentLines = [];
      continue;
    }

    if (isHeading) {
      currentTitle = line;
      continue;
    }

    currentLines.push(line);
  }

  if (currentLines.length) {
    pushCurrent();
  }

  return sections.length
    ? sections
    : [{ title: "正文", content: normalized }];
}

function inferEvidenceLevel(sourceType) {
  switch (sourceType) {
    case "china_guideline":
      return "high";
    case "drug_label":
    case "reimbursement":
      return "reference";
    default:
      return "medium";
  }
}

function buildCitation(source, publishedAt) {
  return `${source.citationName || source.sourceName} (${publishedAt.slice(0, 4)})`;
}

function compactText(input, maxLength = 1800) {
  const text = normalizeWhitespace(input);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}...`;
}

async function locatePdfToText() {
  const candidates = [
    process.env.PDFTOTEXT_PATH,
    "/opt/anaconda3/bin/pdftotext",
    "/usr/local/bin/pdftotext",
    "/opt/homebrew/bin/pdftotext",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await execFile(candidate, ["-v"]);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  try {
    const { stdout } = await execFile("which", ["pdftotext"]);
    const resolved = stdout.trim();
    if (resolved) {
      return resolved;
    }
  } catch {
    // No-op.
  }

  throw new Error("pdftotext is required for PDF ingestion but was not found.");
}

async function fetchSourceText(source) {
  if (source.adapter === "openfda_label") {
    const url = new URL("https://api.fda.gov/drug/label.json");
    url.searchParams.set("search", source.openfdaSearch);
    url.searchParams.set("limit", "1");

    const response = await fetch(url, {
      headers: defaultHeaders,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch openFDA label ${source.id}: ${response.status}`);
    }

    const payload = await response.json();
    const item = payload.results?.[0];

    if (!item) {
      throw new Error(`No openFDA label results for ${source.id}`);
    }

    const indication = compactText((item.indications_and_usage ?? []).join("\n\n"), 2200);
    const dosage = compactText((item.dosage_and_administration ?? []).join("\n\n"), 2200);
    const warnings = compactText(
      [
        ...(item.boxed_warning ?? []),
        ...(item.warnings_and_cautions ?? []),
        ...(item.contraindications ?? []),
      ].join("\n\n"),
      2200,
    );
    const title =
      source.titleHint ||
      `${(item.openfda?.brand_name ?? [source.genericName])[0]} FDA label`;
    const effectiveTime = item.effective_time ?? item.meta?.last_updated;
    const publishedAt =
      effectiveTime && /^\d{8}$/.test(String(effectiveTime))
        ? `${String(effectiveTime).slice(0, 4)}-${String(effectiveTime).slice(4, 6)}-${String(effectiveTime).slice(6, 8)}`
        : source.publishedAtHint || "2025-01-01";

    return {
      title,
      publishedAt,
      contentText: compactText(
        [indication, dosage, warnings].filter(Boolean).join("\n\n"),
        5400,
      ),
      sections: [
        { title: "适应症", content: indication },
        { title: "给药与剂量", content: dosage },
        { title: "警示与禁忌", content: warnings },
      ].filter((item) => item.content),
    };
  }

  const response = await fetch(source.url, {
    headers: defaultHeaders,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${source.url}: ${response.status}`);
  }

  if (source.adapter === "html_article") {
    const html = await response.text();
    const title = parseHtmlTitle(html, source);
    const publishedAt = parsePublishedAt(html, source.publishedAtHint);
    const plainText = sliceBetweenMarkers(
      stripHtml(html),
      source.plainTextStart,
      source.plainTextEnd,
    );

    return {
      title,
      publishedAt,
      contentText: removeLeadingTitle(plainText, title),
      sections: splitIntoSections(removeLeadingTitle(plainText, title)),
    };
  }

  if (source.adapter === "pdf_text") {
    const pdfBuffer = Buffer.from(await response.arrayBuffer());
    const tempFile = path.join(
      os.tmpdir(),
      `mingzheng-${source.id}-${Date.now()}.pdf`,
    );
    const pdfToTextBinary = await locatePdfToText();

    await writeFile(tempFile, pdfBuffer);

    try {
      const { stdout } = await execFile(pdfToTextBinary, [tempFile, "-"]);
      const plainText = sliceBetweenMarkers(
        normalizeWhitespace(stdout),
        source.plainTextStart,
        source.plainTextEnd,
      );

      return {
        title: source.titleHint || firstSentences(plainText, 1) || source.id,
        publishedAt: source.publishedAtHint,
        contentText: removeLeadingTitle(plainText, source.titleHint),
        sections: splitIntoSections(removeLeadingTitle(plainText, source.titleHint)),
      };
    } finally {
      await rm(tempFile, { force: true });
    }
  }

  throw new Error(`Unsupported adapter: ${source.adapter}`);
}

function buildRecord(source, fetched) {
  const publishedAt = fetched.publishedAt || source.publishedAtHint || "2025-01-01";
  const contentText = normalizeWhitespace(fetched.contentText);
  const summary = extractSummary(contentText, source.summaryHint);

  return {
    id: source.id,
    sourceType: source.sourceType,
    documentClass: source.documentClass || "reference",
    searchPolicy: source.searchPolicy || "direct",
    searchPriority: source.searchPriority ?? 0.5,
    sourceName: source.sourceName,
    title: fetched.title || source.titleHint || source.id,
    region: "CN",
    language: "zh-CN",
    citation: buildCitation(source, publishedAt),
    publishedAt,
    evidenceLevel: inferEvidenceLevel(source.sourceType),
    specialtyTags: source.specialtyTags ?? [],
    conditionTags: source.conditionTags ?? [],
    interventionTags: source.interventionTags ?? [],
    keywords: source.keywords ?? [],
    summary,
    applicability:
      source.applicabilityHint ||
      "适用于中国本地临床检索，但仍需结合正式指南或药品核准文件逐条核对。",
    cautions:
      source.cautionHint ||
      "该来源属于正式机构发布信息，回答具体治疗方案时仍需结合患者分层和最新正式文件。",
    url: source.url,
    contentText,
    sections: fetched.sections ?? splitIntoSections(contentText),
    searchText: buildSearchText([
      fetched.title,
      source.sourceName,
      summary,
      contentText,
      ...(source.specialtyTags ?? []),
      ...(source.conditionTags ?? []),
      ...(source.interventionTags ?? []),
      ...(source.keywords ?? []),
    ]),
  };
}

function buildChunks(record) {
  const sections = record.sections?.length
    ? record.sections
    : splitIntoSections(record.contentText);

  return sections.flatMap((section, sectionIndex) =>
    splitIntoChunks(section.content).map((content, index) => ({
      id: `${record.id}#section-${sectionIndex + 1}-chunk-${index + 1}`,
      recordId: record.id,
      sourceType: record.sourceType,
      documentClass: record.documentClass,
      title: record.title,
      sourceName: record.sourceName,
      publishedAt: record.publishedAt,
      keywords: record.keywords,
      section:
        section.title && section.title !== "正文"
          ? section.title
          : sectionIndex === 0 && index === 0
            ? "lead"
            : `section-${sectionIndex + 1}`,
      content,
      searchText: buildSearchText([
        record.title,
        record.summary,
        section.title,
        content,
        ...record.keywords,
      ]),
    })),
  );
}

async function main() {
  const sourceGroups = await Promise.all([
    loadJson("china-guidelines.sources.json"),
    loadJson("drug-labels.sources.json"),
    loadJson("nmpa-package-inserts.sources.json"),
    loadJson("nmpa-drug-notices.sources.json"),
    loadJson("fda-labels.sources.json"),
  ]);
  const sources = sourceGroups.flat();

  const syncStartedAt = new Date().toISOString();
  const records = [];
  const chunks = [];
  const report = [];

  for (const source of sources) {
    const fetched = await fetchSourceText(source);
    const record = buildRecord(source, fetched);
    const recordChunks = buildChunks(record);

    records.push(record);
    chunks.push(...recordChunks);
    report.push({
      id: source.id,
      sourceType: source.sourceType,
      documentClass: record.documentClass,
      searchPolicy: record.searchPolicy,
      url: source.url,
      title: record.title,
      publishedAt: record.publishedAt,
      chunkCount: recordChunks.length,
    });
  }

  records.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  chunks.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));

  await mkdir(outDir, { recursive: true });
  await writeFile(recordsOutFile, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  await writeFile(chunksOutFile, `${JSON.stringify(chunks, null, 2)}\n`, "utf8");
  await writeFile(
    reportOutFile,
    `${JSON.stringify(
      {
        syncStartedAt,
        syncFinishedAt: new Date().toISOString(),
        sourceCount: sources.length,
        recordCount: records.length,
        chunkCount: chunks.length,
        sources: report,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Wrote ${records.length} evidence records to ${recordsOutFile}`);
  console.log(`Wrote ${chunks.length} evidence chunks to ${chunksOutFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
