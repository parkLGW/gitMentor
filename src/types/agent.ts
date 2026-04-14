import type { AnalysisEvidence, ConfidenceLevel } from "./learning.js";

export type RetrievedFileStatus = "fetched" | "failed" | "skipped";

export interface RetrievedFileMetadata {
  filePath: string;
  branch?: string;
  status: RetrievedFileStatus;
  reason?: string;
}

export interface RetrievedFileContext extends RetrievedFileMetadata {
  snippet?: string;
}

export interface AgentRetrievalPlan {
  needsCodeContext: boolean;
  targetFiles: string[];
  reason: string;
  confidence: ConfidenceLevel;
}

export type AgentRetrievalMode = "summary-only" | "github-code";
export type AgentProgressStage =
  | "locating-files"
  | "reading-files"
  | "drafting-answer";

export interface AgentProgressEvent {
  stage: AgentProgressStage;
  completed?: number;
  total?: number;
}

export interface AgentRetrievalMetadata {
  retrievedFiles?: RetrievedFileMetadata[];
  retrievalMode?: AgentRetrievalMode;
  retrievalNote?: string;
}

export type AgentRole = "user" | "assistant" | "system";

export interface AgentMessage extends AgentRetrievalMetadata {
  id: string;
  role: AgentRole;
  content: string;
  createdAt: number;
  evidence?: AnalysisEvidence[];
  confidence?: ConfidenceLevel;
}

export interface SessionSummary {
  summary: string;
  keyConcepts: string[];
  unresolvedQuestions: string[];
  evidenceFiles: string[];
  updatedAt: number;
}

export interface AgentSession {
  schemaVersion: number;
  repoKey: string;
  updatedAt: number;
  recentMessages: AgentMessage[];
  summary: SessionSummary | null;
  compressedAt?: number;
  messageCount: number;
}

export interface AgentChatRequestPayload {
  repo: { owner: string; name: string };
  language: "zh" | "en";
  question: string;
  sourceMapSummary?: string;
  readmeSummary?: string;
  sessionSummary?: SessionSummary | null;
  recentMessages: AgentMessage[];
}

export interface AgentChatResponsePayload extends AgentRetrievalMetadata {
  answer: string;
  confidence: ConfidenceLevel;
  evidence: AnalysisEvidence[];
  suggestedNextSteps: string[];
  source: "ai" | "fallback";
  downgraded?: boolean;
  reason?: string;
}
