import type {
  PopulationPathwayView,
  PopulationSignalView,
} from "@/lib/population-signal-schema";

export type EvidenceSourceType =
  | "china_guideline"
  | "drug_label"
  | "nmpa_drug_notice"
  | "fda_label"
  | "reimbursement"
  | "international_evidence"
  | "pubmed_abstract";

export type EvidenceDocumentClass =
  | "guideline"
  | "guideline_update"
  | "drug_label"
  | "drug_approval_notice"
  | "regulatory_principle"
  | "announcement"
  | "reference";

export type EvidenceSearchPolicy = "direct" | "regulatory" | "exclude";

export type UnifiedEvidenceRecord = {
  id: string;
  sourceType: EvidenceSourceType;
  documentClass?: EvidenceDocumentClass;
  searchPolicy?: EvidenceSearchPolicy;
  searchPriority?: number;
  sourceName: string;
  title: string;
  region: "CN" | "INTL";
  language: string;
  citation: string;
  publishedAt: string;
  evidenceLevel: "high" | "medium" | "reference";
  specialtyTags: string[];
  conditionTags: string[];
  interventionTags: string[];
  keywords: string[];
  summary: string;
  applicability: string;
  cautions: string;
  url?: string;
  contentText: string;
  sections?: {
    title: string;
    content: string;
  }[];
  searchText: string;
};

export type UnifiedEvidenceChunk = {
  id: string;
  recordId: string;
  sourceType: EvidenceSourceType;
  documentClass?: EvidenceDocumentClass;
  title: string;
  sourceName: string;
  publishedAt: string;
  keywords: string[];
  section?: string;
  content: string;
  searchText: string;
};

export type SearchResultView = {
  requestId: string;
  query: string;
  allowed: boolean;
  specialty: string;
  summary: string;
  clinicianFocus: string[];
  suggestedActions: string[];
  evidence: {
    id: string;
    title: string;
    source: string;
    year: string;
    category: string;
    evidenceLevel: string;
    fit: string;
    caution: string;
    insight: string;
    url?: string;
  }[];
  populationPathway: PopulationPathwayView | null;
  populationSignals: PopulationSignalView[];
  retrieval: {
    localCount: number;
    pubmedCount: number;
  };
  risk?: {
    code: string;
    title: string;
    reason: string;
    safeActions: string[];
  };
};
