import type { AnalysisEvidence, ConfidenceLevel } from "./learning.js";

export interface RetrievedFileContext {
  filePath: string;
  branch?: string;
  status: "fetched" | "failed" | "skipped";
  snippet?: string;
  reason?: string;
}

export interface AgentRetrievalPlan {
  needsCodeContext: boolean;
  targetFiles: string[];
  reason: string;
  confidence: ConfidenceLevel;
}

export type AgentRetrievalMode = "summary-only" | "github-code";

export interface AgentRetrievalMetadata {
  retrievedFiles?: RetrievedFileContext[];
  retrievalMode?: AgentRetrievalMode;
  retrievalNote?: string;
}

export type AgentRole = "user" | "assistant" | "system";

export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
  createdAt: number;
  evidence?: AnalysisEvidence[];
  confidence?: ConfidenceLevel;
  retrievedFiles?: RetrievedFileContext[];
  retrievalMode?: AgentRetrievalMode;
  retrievalNote?: string;
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
