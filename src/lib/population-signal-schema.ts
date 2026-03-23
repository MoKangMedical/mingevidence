export type DiseaseStage =
  | "risk_screening"
  | "early_warning"
  | "diagnosis"
  | "treatment_selection"
  | "response_monitoring"
  | "adverse_event_monitoring"
  | "recurrence_followup";

export type PopulationSignalEvidence = {
  pmid: string;
  title: string;
  journal: string;
  publishedAt: string;
  url: string;
  populationHint: string;
  summary: string;
};

export type PopulationSignalRecord = {
  id: string;
  programId: string;
  diseaseArea: string;
  targetPopulation: string;
  signalName: string;
  stage: DiseaseStage;
  intent: "prediction" | "warning" | "diagnosis" | "treatment" | "monitoring";
  keywords: string[];
  evidenceCount: number;
  evidence: PopulationSignalEvidence[];
  operatingNote: string;
};

export type PopulationSignalView = {
  id: string;
  signalName: string;
  diseaseArea: string;
  targetPopulation: string;
  stage: string;
  intent: string;
  evidenceCount: number;
  operatingNote: string;
  leadEvidence?: {
    title: string;
    journal: string;
    year: string;
    summary: string;
    url: string;
  };
};

export type PopulationPathwayView = {
  programId: string;
  diseaseArea: string;
  targetPopulation: string;
  matchedTerms: string[];
  stagesCovered: string[];
  summary: string;
  nextFocus: string[];
};
