import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourcesFile = path.join(repoRoot, "data", "sources", "population-signals.sources.json");
const outDir = path.join(repoRoot, "data", "normalized");
const outFile = path.join(outDir, "population-signals.json");

const headers = {
  "User-Agent": "MingEvidence/0.2 (population signal sync prototype)",
};

function normalizeWhitespace(input) {
  return input.replace(/\s+/g, " ").trim();
}

function decodeXmlEntities(input) {
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

function stageFromText(text) {
  const lowered = text.toLowerCase();

  if (/(warning|alert|risk score|progression|deterioration)/.test(lowered)) {
    return "early_warning";
  }

  if (/(screen|screening|detect|susceptibility)/.test(lowered)) {
    return "risk_screening";
  }

  if (/(diagnosis|classifier|identification|companion diagnostic)/.test(lowered)) {
    return "diagnosis";
  }

  if (/(response|monitor|follow-up|surveillance)/.test(lowered)) {
    return "response_monitoring";
  }

  if (/(adverse|toxicity|bleeding|safety)/.test(lowered)) {
    return "adverse_event_monitoring";
  }

  if (/(recurrence|relapse)/.test(lowered)) {
    return "recurrence_followup";
  }

  return "treatment_selection";
}

function intentFromStage(stage) {
  switch (stage) {
    case "risk_screening":
      return "prediction";
    case "early_warning":
      return "warning";
    case "diagnosis":
      return "diagnosis";
    case "treatment_selection":
      return "treatment";
    default:
      return "monitoring";
  }
}

function parsePublishedAt(articleXml) {
  const articleDate = articleXml.match(
    /<ArticleDate[^>]*>[\s\S]*?<Year>(\d{4})<\/Year>[\s\S]*?<Month>(\d{1,2})<\/Month>[\s\S]*?<Day>(\d{1,2})<\/Day>[\s\S]*?<\/ArticleDate>/,
  );

  if (articleDate) {
    return `${articleDate[1]}-${articleDate[2].padStart(2, "0")}-${articleDate[3].padStart(2, "0")}`;
  }

  const year = articleXml.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/);
  return year ? `${year[1]}-01-01` : "2025-01-01";
}

function parseArticles(xml) {
  const articles = xml.match(/<PubmedArticle\b[\s\S]*?<\/PubmedArticle>/g) ?? [];

  return articles
    .map((articleXml) => {
      const pmid = articleXml.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
      const title = articleXml.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1];
      const journal = articleXml.match(/<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/)?.[1];
      const abstract = [...articleXml.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
        .map((match) => decodeXmlEntities(match[1]))
        .join(" ");

      if (!pmid || !title || !abstract) {
        return null;
      }

      const doi = articleXml.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/)?.[1];

      return {
        pmid,
        title: decodeXmlEntities(title),
        journal: decodeXmlEntities(journal || "PubMed"),
        abstract: normalizeWhitespace(abstract),
        publishedAt: parsePublishedAt(articleXml),
        url: doi
          ? `https://doi.org/${decodeXmlEntities(doi)}`
          : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      };
    })
    .filter(Boolean);
}

async function fetchPubMedArticles(query) {
  const esearchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  esearchUrl.searchParams.set("db", "pubmed");
  esearchUrl.searchParams.set("retmode", "json");
  esearchUrl.searchParams.set("retmax", "5");
  esearchUrl.searchParams.set("sort", "relevance");
  esearchUrl.searchParams.set("term", query);

  const searchResponse = await fetch(esearchUrl, { headers });
  if (!searchResponse.ok) {
    return [];
  }

  const searchJson = await searchResponse.json();
  const ids = searchJson.esearchresult?.idlist ?? [];
  if (!ids.length) {
    return [];
  }

  const efetchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi");
  efetchUrl.searchParams.set("db", "pubmed");
  efetchUrl.searchParams.set("retmode", "xml");
  efetchUrl.searchParams.set("id", ids.join(","));

  const fetchResponse = await fetch(efetchUrl, { headers });
  if (!fetchResponse.ok) {
    return [];
  }

  const xml = await fetchResponse.text();
  return parseArticles(xml);
}

async function main() {
  const programs = JSON.parse(await readFile(sourcesFile, "utf8"));
  const records = [];

  for (const program of programs) {
    const evidenceMap = new Map();

    for (const query of program.queries) {
      const articles = await fetchPubMedArticles(`(${query}) AND (China OR Chinese)`);

      for (const article of articles) {
        evidenceMap.set(article.pmid, article);
      }
    }

    const evidence = Array.from(evidenceMap.values())
      .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
      .slice(0, 12);

    const grouped = new Map();

    for (const article of evidence) {
      const stage = stageFromText(`${article.title} ${article.abstract}`);
      const list = grouped.get(stage) ?? [];
      list.push(article);
      grouped.set(stage, list);
    }

    for (const [stage, items] of grouped.entries()) {
      records.push({
        id: `${program.id}-${stage}`,
        programId: program.id,
        diseaseArea: program.diseaseArea,
        targetPopulation: program.targetPopulation,
        signalName: `${program.diseaseArea}中国人群${stage}`,
        stage,
        intent: intentFromStage(stage),
        keywords: program.keywords,
        evidenceCount: items.length,
        evidence: items.slice(0, 6).map((item) => ({
          pmid: item.pmid,
          title: item.title,
          journal: item.journal,
          publishedAt: item.publishedAt,
          url: item.url,
          populationHint: "China/Chinese cohort or population mentioned in PubMed retrieval query",
          summary: item.abstract.slice(0, 360),
        })),
        operatingNote: program.operatingNote,
      });
    }
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  console.log(`Wrote ${records.length} population signal records to ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
