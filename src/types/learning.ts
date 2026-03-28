export type ConfidenceLevel = "low" | "medium" | "high";

export interface AnalysisEvidence {
  filePath?: string;
  lineStart?: number;
  snippet: string;
  reason: string;
}

export interface DeepAnalysisComponent {
  name: string;
  type: "function" | "class" | "interface" | "constant" | "module";
  description: string;
}

export interface DeepFileAnalysisResult {
  summary: string;
  components: DeepAnalysisComponent[];
  dependencies: string[];
  suggestions: string[];
  evidence: AnalysisEvidence[];
  confidence: ConfidenceLevel;
}

export interface ConceptCard {
  term: string;
  definition: string;
  relatedFiles: string[];
  importance: "essential" | "important" | "helpful";
  beginnerExplanation?: string;
  whyItMatters?: string;
  whereToFind?: string[];
}

export interface MissionStep {
  id: string;
  title: string;
  objective: string;
  requiredFiles: string[];
  completionCriteria: string;
  nextStepHint: string;
  estimatedMinutes: number;
}

export interface LearningMission {
  repoKey: string;
  generatedAt: number;
  steps: MissionStep[];
}
