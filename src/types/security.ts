// Security audit type definitions for GitMentor

export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";

export type SecurityCategory =
  | "secret_exposure"
  | "malicious_code"
  | "dependency_risk"
  | "suspicious_script"
  | "unsafe_permission"
  | "supply_chain"
  | "data_leakage"
  | "obfuscation"
  | "network_exfiltration"
  | "unknown";

export type SecurityStatus = "open" | "reviewing" | "resolved" | "ignored";

export interface SecurityLocation {
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  snippet?: string;
}

export interface SecurityEvidence {
  type: "code" | "dependency" | "metadata" | "behavior" | "heuristic";
  message: string;
  location?: SecurityLocation;
  references?: string[];
}

export interface SecurityFinding {
  id: string;
  title: string;
  description: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  confidence: number; // 0-1
  status: SecurityStatus;
  recommendation: string;
  impact?: string;
  cwe?: string;
  tags?: string[];
  evidence: SecurityEvidence[];
  createdAt: number;
  updatedAt: number;
}

export interface SecurityFileStat {
  filePath: string;
  riskScore: number; // 0-100
  findingsCount: number;
  highestSeverity: SecuritySeverity;
}

export interface SecurityAuditSummary {
  totalFindings: number;
  bySeverity: Record<SecuritySeverity, number>;
  byCategory: Record<SecurityCategory, number>;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  overallRiskScore: number; // 0-100
  scannedFiles: number;
  scannedDependencies: number;
  suspiciousFiles: SecurityFileStat[];
}

export interface SecurityAuditMeta {
  repoOwner: string;
  repoName: string;
  branch?: string;
  commitSha?: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  scannerVersion: string;
  language: "zh" | "en";
  mode?: "standard" | "advanced";
  source?: "local" | "remote" | "hybrid";
  rulesetVersion?: string;
  baselineReportId?: string;
  comparedWithBaseline?: boolean;
  policyProfile?: "strict" | "balanced" | "permissive";
  generatedBy?: string;
}

export interface SecurityAuditReport {
  meta: SecurityAuditMeta;
  summary: SecurityAuditSummary;
  findings: SecurityFinding[];
  nextActions: string[];
  advanced?: {
    commitRisk?: Array<{
      commitSha: string;
      author?: string;
      timestamp?: number;
      riskScore: number;
      findingsCount: number;
    }>;
    dependencyDiffRisk?: Array<{
      name: string;
      fromVersion?: string;
      toVersion?: string;
      riskScore: number;
      reason?: string;
    }>;
    policyViolations?: Array<{
      policyId: string;
      title: string;
      severity: SecuritySeverity;
      description: string;
      recommendation?: string;
    }>;
    runtimeIndicators?: Array<{
      indicator: string;
      severity: SecuritySeverity;
      confidence: number;
      evidence?: string;
    }>;
  };
}

export interface SecurityAuditOptions {
  includePaths?: string[];
  excludePaths?: string[];
  includeDependencyAudit?: boolean;
  includeSecretsScan?: boolean;
  includeMalwareHeuristics?: boolean;
  includeHistoricalScan?: boolean;
  includeRuntimeBehaviorAnalysis?: boolean;
  includePolicyChecks?: boolean;
  includeLicenseRiskAudit?: boolean;
  useAdvancedMode?: boolean;
  baselineReportId?: string;
  branch?: string;
  commitSha?: string;
  maxFileSizeKB?: number;
  maxFindings?: number;
  maxCommitsToScan?: number;
  maxFilesPerCommit?: number;
  riskScoreThreshold?: number;
  failOnSeverity?: SecuritySeverity;
  allowlistPaths?: string[];
  denylistPatterns?: string[];
  customRules?: Array<{
    id: string;
    name: string;
    description?: string;
    pattern: string;
    severity: SecuritySeverity;
    category: SecurityCategory;
    enabled?: boolean;
  }>;
  language?: "zh" | "en";
}

export interface SecurityAuditState {
  loading: boolean;
  error: string | null;
  report: SecurityAuditReport | null;
  mode?: "standard" | "advanced";
  progress?: {
    phase: "collecting" | "scanning" | "correlating" | "reporting";
    current: number;
    total: number;
    message?: string;
  };
}
