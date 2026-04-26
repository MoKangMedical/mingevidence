"""
文献检索引擎 — 支持 PubMed / Cochrane / ClinicalTrials 数据库检索

使用 NCBI E-utilities API 进行 PubMed 检索，支持：
- 关键词检索
- MeSH 术语检索
- 日期范围过滤
- 结果排序与去重
"""

import re
import time
import json
import logging
import argparse
from typing import Optional
from dataclasses import dataclass, field, asdict

import requests

logger = logging.getLogger(__name__)

# NCBI E-utilities base URL
EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
COCHRANE_API = "https://www.cochranelibrary.com/api"
CLINICALTRIALS_API = "https://clinicaltrials.gov/api/v2"


@dataclass
class StudyRecord:
    """单篇文献记录"""
    pmid: str = ""
    title: str = ""
    authors: list[str] = field(default_factory=list)
    journal: str = ""
    year: int = 0
    abstract: str = ""
    doi: str = ""
    pmc_id: str = ""
    mesh_terms: list[str] = field(default_factory=list)
    publication_type: list[str] = field(default_factory=list)
    source: str = "pubmed"  # pubmed / cochrane / clinicaltrials

    def to_dict(self) -> dict:
        return asdict(self)


class SearchEngine:
    """多数据库文献检索引擎"""

    def __init__(self, api_key: str = "", timeout: int = 30, rate_limit: float = 0.34):
        """
        Args:
            api_key: NCBI API key（可选，提升速率限制到10次/秒）
            timeout: 请求超时秒数
            rate_limit: 请求间隔秒数（无API key时为0.34s，即3次/秒）
        """
        self.api_key = api_key
        self.timeout = timeout
        self.rate_limit = rate_limit
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "MingEvidence/0.1.0 (https://github.com/MoKangMedical/mingevidence)"
        })

    # ── PubMed ──────────────────────────────────────────────

    def search(
        self,
        query: str,
        max_results: int = 20,
        databases: list[str] | None = None,
        date_from: str = "",
        date_to: str = "",
        sort: str = "relevance",
    ) -> list[StudyRecord]:
        """
        检索文献

        Args:
            query: 检索式
            max_results: 最大返回数
            databases: 数据库列表，默认 ["pubmed"]
            date_from: 起始日期 (YYYY/MM/DD)
            date_to: 截止日期 (YYYY/MM/DD)
            sort: 排序方式 (relevance / date / author)

        Returns:
            StudyRecord 列表
        """
        if databases is None:
            databases = ["pubmed"]

        results: list[StudyRecord] = []
        seen_pmids: set[str] = set()

        if "pubmed" in databases:
            pubmed_results = self._search_pubmed(query, max_results, date_from, date_to, sort)
            for r in pubmed_results:
                if r.pmid not in seen_pmids:
                    seen_pmids.add(r.pmid)
                    results.append(r)

        if "cochrane" in databases:
            cochrane_results = self._search_cochrane(query, max_results)
            for r in cochrane_results:
                if r.pmid not in seen_pmids:
                    seen_pmids.add(r.pmid)
                    results.append(r)

        if "clinicaltrials" in databases:
            ct_results = self._search_clinicaltrials(query, max_results)
            results.extend(ct_results)

        logger.info(f"检索完成: 共 {len(results)} 篇文献")
        return results[:max_results]

    def _search_pubmed(
        self, query: str, max_results: int,
        date_from: str, date_to: str, sort: str
    ) -> list[StudyRecord]:
        """PubMed E-utilities 检索"""
        # Step 1: ESearch — 获取 PMID 列表
        params = {
            "db": "pubmed",
            "term": query,
            "retmax": max_results,
            "retmode": "json",
            "sort": sort,
        }
        if self.api_key:
            params["api_key"] = self.api_key
        if date_from:
            params["mindate"] = date_from.replace("/", "/")
            params["maxdate"] = date_to or "3000"
            params["datetype"] = "pdat"

        try:
            resp = self.session.get(
                f"{EUTILS_BASE}/esearch.fcgi",
                params=params, timeout=self.timeout
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error(f"PubMed ESearch 失败: {e}")
            return []

        id_list = data.get("esearchresult", {}).get("idlist", [])
        if not id_list:
            logger.info("PubMed 未找到结果")
            return []

        # Step 2: EFetch — 获取文献详情
        time.sleep(self.rate_limit)
        return self._fetch_pubmed_details(id_list)

    def _fetch_pubmed_details(self, pmid_list: list[str]) -> list[StudyRecord]:
        """通过 EFetch 获取 PubMed 文献详情"""
        params = {
            "db": "pubmed",
            "id": ",".join(pmid_list),
            "retmode": "xml",
            "rettype": "abstract",
        }
        if self.api_key:
            params["api_key"] = self.api_key

        try:
            resp = self.session.get(
                f"{EUTILS_BASE}/efetch.fcgi",
                params=params, timeout=self.timeout
            )
            resp.raise_for_status()
        except Exception as e:
            logger.error(f"PubMed EFetch 失败: {e}")
            return []

        return self._parse_pubmed_xml(resp.text)

    def _parse_pubmed_xml(self, xml_text: str) -> list[StudyRecord]:
        """解析 PubMed XML 响应"""
        records: list[StudyRecord] = []

        # 简易XML解析 — 使用正则提取关键字段
        articles = re.findall(r"<PubmedArticle>(.*?)</PubmedArticle>", xml_text, re.DOTALL)

        for article in articles:
            record = StudyRecord(source="pubmed")

            # PMID
            pmid_match = re.search(r"<PMID[^>]*>(\d+)</PMID>", article)
            if pmid_match:
                record.pmid = pmid_match.group(1)

            # 标题
            title_match = re.search(r"<ArticleTitle>(.*?)</ArticleTitle>", article, re.DOTALL)
            if title_match:
                record.title = re.sub(r"<[^>]+>", "", title_match.group(1)).strip()

            # 作者
            authors = re.findall(r"<LastName>(.*?)</LastName>.*?<ForeName>(.*?)</ForeName>", article, re.DOTALL)
            record.authors = [f"{ln} {fn}" for ln, fn in authors]

            # 期刊
            journal_match = re.search(r"<Title>(.*?)</Title>", article)
            if journal_match:
                record.journal = journal_match.group(1).strip()

            # 年份
            year_match = re.search(r"<PubDate>.*?<Year>(\d{4})</Year>", article, re.DOTALL)
            if year_match:
                record.year = int(year_match.group(1))

            # 摘要
            abstract_match = re.search(r"<Abstract>(.*?)</Abstract>", article, re.DOTALL)
            if abstract_match:
                abstract_text = re.findall(r"<AbstractText[^>]*>(.*?)</AbstractText>", abstract_match.group(1), re.DOTALL)
                record.abstract = " ".join(
                    re.sub(r"<[^>]+>", "", t).strip() for t in abstract_text
                )

            # DOI
            doi_match = re.search(r'<ArticleId IdType="doi">(.*?)</ArticleId>', article)
            if doi_match:
                record.doi = doi_match.group(1)

            # PMC ID
            pmc_match = re.search(r'<ArticleId IdType="pmc">(.*?)</ArticleId>', article)
            if pmc_match:
                record.pmc_id = pmc_match.group(1)

            # MeSH 术语
            mesh_terms = re.findall(r'<DescriptorName[^>]*>(.*?)</DescriptorName>', article)
            record.mesh_terms = mesh_terms

            records.append(record)

        return records

    # ── Cochrane ────────────────────────────────────────────

    def _search_cochrane(self, query: str, max_results: int) -> list[StudyRecord]:
        """Cochrane Library 检索（通过CDSR API）"""
        # Cochrane 检索需要订阅，此处提供基础框架
        logger.info("Cochrane 检索: 使用 PubMed Cochrane 过滤器替代")
        cochrane_filter = "Cochrane Library[pt]"
        combined_query = f"({query}) AND {cochrane_filter}"
        return self._search_pubmed(combined_query, max_results, "", "", "relevance")

    # ── ClinicalTrials.gov ─────────────────────────────────

    def _search_clinicaltrials(self, query: str, max_results: int) -> list[StudyRecord]:
        """ClinicalTrials.gov 检索 (API v2)"""
        try:
            resp = self.session.get(
                f"{CLINICALTRIALS_API}/studies",
                params={
                    "query.cond": query,
                    "pageSize": min(max_results, 50),
                    "format": "json",
                },
                timeout=self.timeout,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.error(f"ClinicalTrials.gov 检索失败: {e}")
            return []

        records: list[StudyRecord] = []
        for study in data.get("studies", []):
            nct = study.get("protocolSection", {})
            ident = nct.get("identificationModule", {})
            desc = nct.get("descriptionModule", {})
            status = nct.get("statusModule", {})

            record = StudyRecord(
                pmid=ident.get("nctId", ""),
                title=ident.get("briefTitle", ""),
                abstract=desc.get("briefSummary", ""),
                year=int(status.get("startDateStruct", {}).get("date", "0")[:4] or 0),
                source="clinicaltrials",
            )
            records.append(record)

        return records

    # ── 工具方法 ────────────────────────────────────────────

    def build_pico_query(
        self,
        population: str = "",
        intervention: str = "",
        comparison: str = "",
        outcome: str = "",
    ) -> str:
        """
        从PICO要素构建PubMed检索式

        Args:
            population: 目标人群
            intervention: 干预措施
            comparison: 对照措施
            outcome: 结局指标

        Returns:
            PubMed格式检索式
        """
        parts: list[str] = []
        if population:
            parts.append(f"({population}[MeSH] OR {population}[tiab])")
        if intervention:
            parts.append(f"({intervention}[MeSH] OR {intervention}[tiab])")
        if comparison:
            parts.append(f"({comparison}[MeSH] OR {comparison}[tiab])")
        if outcome:
            parts.append(f"({outcome}[MeSH] OR {outcome}[tiab])")

        return " AND ".join(parts) if parts else ""

    def get_article_count(self, query: str) -> int:
        """获取检索结果总数"""
        params = {
            "db": "pubmed",
            "term": query,
            "retmode": "json",
            "retmax": 0,
        }
        if self.api_key:
            params["api_key"] = self.api_key

        try:
            resp = self.session.get(
                f"{EUTILS_BASE}/esearch.fcgi",
                params=params, timeout=self.timeout
            )
            resp.raise_for_status()
            data = resp.json()
            return int(data.get("esearchresult", {}).get("count", 0))
        except Exception as e:
            logger.error(f"获取文献数量失败: {e}")
            return 0


def main():
    """命令行入口"""
    parser = argparse.ArgumentParser(description="MingEvidence 文献检索引擎")
    parser.add_argument("--query", "-q", required=True, help="检索式")
    parser.add_argument("--max", "-n", type=int, default=20, help="最大返回数")
    parser.add_argument("--databases", "-d", nargs="+", default=["pubmed"],
                        choices=["pubmed", "cochrane", "clinicaltrials"],
                        help="检索数据库")
    parser.add_argument("--date-from", default="", help="起始日期 (YYYY/MM/DD)")
    parser.add_argument("--date-to", default="", help="截止日期 (YYYY/MM/DD)")
    parser.add_argument("--sort", default="relevance",
                        choices=["relevance", "date", "author"],
                        help="排序方式")
    parser.add_argument("--output", "-o", default="", help="输出JSON文件路径")
    parser.add_argument("--api-key", default="", help="NCBI API Key")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

    engine = SearchEngine(api_key=args.api_key)
    results = engine.search(
        query=args.query,
        max_results=args.max,
        databases=args.databases,
        date_from=args.date_from,
        date_to=args.date_to,
        sort=args.sort,
    )

    print(f"\n📊 检索结果: {len(results)} 篇文献\n")
    for i, record in enumerate(results, 1):
        print(f"[{i}] PMID:{record.pmid} | {record.year}")
        print(f"    {record.title}")
        if record.authors:
            print(f"    作者: {', '.join(record.authors[:3])}{'...' if len(record.authors) > 3 else ''}")
        print()

    if args.output:
        output_data = [r.to_dict() for r in results]
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        print(f"✅ 结果已保存到 {args.output}")


if __name__ == "__main__":
    main()
