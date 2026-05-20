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

export type AgentToolName =
  | "readSummaries"
  | "listRepoTree"
  | "searchRepoPaths"
  | "readGithubFiles"
  | "buildCodeIndex"
  | "expandImports";

export interface AgentToolCall {
  tool: AgentToolName;
  args?: {
    query?: string;
    paths?: string[];
    depth?: number;
    reason?: string;
    maxFiles?: number;
  };
}

export interface AgentIntent {
  category: string;
  reason: string;
  confidence: ConfidenceLevel;
  toolCalls: AgentToolCall[];
}

export interface AgentCodeImport {
  source: string;
  imported: string[];
  kind: "default" | "named" | "namespace" | "side-effect";
  lineStart?: number;
}

export interface AgentCodeExport {
  name: string;
  kind: "function" | "class" | "const" | "type" | "interface" | "unknown";
  lineStart?: number;
}

export interface AgentCodeSymbol {
  name: string;
  kind: "function" | "component" | "hook" | "class" | "type" | "interface" | "const";
  lineStart?: number;
  lineEnd?: number;
}

export interface AgentCodeFileIndex {
  filePath: string;
  language: "ts" | "tsx" | "js" | "jsx";
  status: "indexed" | "failed";
  imports: AgentCodeImport[];
  exports: AgentCodeExport[];
  symbols: AgentCodeSymbol[];
  error?: string;
}

export interface AgentCodeDependency {
  from: string;
  source: string;
  to?: string;
}

export interface AgentCodeIndex {
  files: AgentCodeFileIndex[];
  dependencies: AgentCodeDependency[];
}

export interface AgentObservation {
  tool: AgentToolName;
  ok: boolean;
  summary: string;
  candidateFiles?: string[];
  retrievedFiles?: RetrievedFileContext[];
  treePaths?: string[];
  codeIndex?: AgentCodeIndex;
  error?: string;
}

export interface AgentSufficiencyDecision {
  enough: boolean;
  reason: string;
  confidence: ConfidenceLevel;
  nextToolCalls: AgentToolCall[];
}

export type AgentRetrievalMode = "summary-only" | "github-code";
export type AgentProgressStage =
  | "understanding-intent"
  | "searching-files"
  | "locating-files"
  | "reading-files"
  | "indexing-code"
  | "drafting-answer";

export interface AgentProgressEvent {
  stage: AgentProgressStage;
  completed?: number;
  total?: number;
  note?: string;
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
