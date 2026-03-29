export interface RepoRef {
  owner: string;
  name: string;
}

export const STORAGE_KEYS = {
  language: "gitmentor_language",
  legacyLanguage: "language",
  llmConfig: "gitmentor_llm_config",
  llmConfigMap: "gitmentor_llm_configs_map",
  usageStats: "gitmentor_usage_stats",
  securityAuditPrefs: "gitmentor_security_audit_prefs_v2",
} as const;

export const STORAGE_PREFIXES = {
  githubCache: "gitmentor_cache_",
  overviewAnalysis: "gitmentor_ai_analysis_",
  quickStart: "gitmentor_quickstart_",
  sourceMap: "gitmentor_sourcemap_v4_",
  learningPath: "gitmentor_learning_progress_",
  learningMission: "gitmentor_learning_mission_",
  securityAudit: "gitmentor_security_audit_",
  agentSession: "gitmentor_agent_session_v1_",
  agentSummary: "gitmentor_agent_summary_v1_",
} as const;

export const StorageKeys = {
  githubCache(owner: string, repo: string, type: string): string {
    return `${STORAGE_PREFIXES.githubCache}${owner}/${repo}/${type}`;
  },
  overviewAnalysis(repo: RepoRef): string {
    return `${STORAGE_PREFIXES.overviewAnalysis}${repo.owner}/${repo.name}`;
  },
  quickStart(repo: RepoRef, language: "zh" | "en"): string {
    return `${STORAGE_PREFIXES.quickStart}${repo.owner}/${repo.name}_${language}`;
  },
  sourceMap(repo: RepoRef, language: "zh" | "en"): string {
    return `${STORAGE_PREFIXES.sourceMap}${repo.owner}/${repo.name}_${language}`;
  },
  learningPath(repoKey: string): string {
    return `${STORAGE_PREFIXES.learningPath}${repoKey}`;
  },
  learningMission(repoKey: string): string {
    return `${STORAGE_PREFIXES.learningMission}${repoKey}`;
  },
  securityAudit(repo: RepoRef, language: "zh" | "en"): string {
    return `${STORAGE_PREFIXES.securityAudit}${repo.owner}/${repo.name}_${language}`;
  },
  agentSession(repoKey: string): string {
    return `${STORAGE_PREFIXES.agentSession}${repoKey}`;
  },
  agentSummary(repoKey: string): string {
    return `${STORAGE_PREFIXES.agentSummary}${repoKey}`;
  },
} as const;
