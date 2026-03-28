import { useEffect, useMemo, useState } from "react";
import { LoadingSpinner } from "./LoadingSpinner";
import { runSecurityAudit } from "@/services/security-audit";
import {
  SecurityAuditReport,
  SecurityFinding,
  SecuritySeverity,
} from "@/types/security";
import { STORAGE_KEYS, STORAGE_PREFIXES, StorageKeys } from "@/constants/storage";

interface SecurityAuditTabProps {
  repo: { owner: string; name: string };
  language: "zh" | "en";
}

type PolicyProfile = "strict" | "balanced" | "permissive";

const labels = {
  zh: {
    title: "安全审计",
    subtitle: "检测潜在数据泄露、恶意代码与供应链风险",
    run: "开始审计",
    rerun: "重新审计",
    running: "审计中...",
    lastRun: "上次扫描",
    findings: "发现项",
    critical: "严重",
    high: "高危",
    medium: "中危",
    low: "低危",
    info: "提示",
    noFindings: "未检测到明显风险（不代表绝对安全）",
    recommendation: "修复建议",
    evidence: "证据",
    impact: "影响",
    confidence: "置信度",
    category: "分类",
    nextActions: "下一步建议",
    scanned: "扫描文件",
    dependencies: "依赖数量",
    riskScore: "综合风险",
    unknown: "未知错误",
    openOnGithub: "在 GitHub 打开",
    mode: "审计模式",
    standard: "标准",
    advanced: "高级",
    profile: "策略档位",
    strict: "严格",
    balanced: "平衡",
    permissive: "宽松",
    options: "高级选项",
    historicalScan: "历史风险推断",
    runtimeScan: "运行时行为指标",
    policyCheck: "策略校验",
    licenseAudit: "许可证风险检查",
    includeDeps: "依赖安全分析",
    includeSecrets: "敏感信息扫描",
    includeMalware: "恶意模式检测",
    baseline: "基线 ID",
    threshold: "风险阈值",
    advancedReport: "高级报告",
    commitRisk: "提交风险（推断）",
    dependencyDiffRisk: "依赖变化风险",
    policyViolations: "策略违规",
    runtimeIndicators: "运行时指标",
    noAdvancedData: "暂无高级数据",
    savePrefs: "记住选项",
    clearPrefs: "清除选项",
    maxFindings: "最大发现数",
  },
  en: {
    title: "Security Audit",
    subtitle:
      "Detect potential data leakage, malicious code, and supply-chain risks",
    run: "Run Audit",
    rerun: "Re-run Audit",
    running: "Auditing...",
    lastRun: "Last scan",
    findings: "Findings",
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Info",
    noFindings:
      "No obvious risks detected (not an absolute guarantee of safety)",
    recommendation: "Recommendation",
    evidence: "Evidence",
    impact: "Impact",
    confidence: "Confidence",
    category: "Category",
    nextActions: "Next actions",
    scanned: "Scanned files",
    dependencies: "Dependencies",
    riskScore: "Risk score",
    unknown: "Unknown error",
    openOnGithub: "Open on GitHub",
    mode: "Mode",
    standard: "Standard",
    advanced: "Advanced",
    profile: "Policy profile",
    strict: "Strict",
    balanced: "Balanced",
    permissive: "Permissive",
    options: "Advanced options",
    historicalScan: "Historical risk inference",
    runtimeScan: "Runtime behavior indicators",
    policyCheck: "Policy checks",
    licenseAudit: "License risk audit",
    includeDeps: "Dependency audit",
    includeSecrets: "Secret scan",
    includeMalware: "Malware heuristics",
    baseline: "Baseline ID",
    threshold: "Risk threshold",
    advancedReport: "Advanced report",
    commitRisk: "Commit risk (inferred)",
    dependencyDiffRisk: "Dependency diff risk",
    policyViolations: "Policy violations",
    runtimeIndicators: "Runtime indicators",
    noAdvancedData: "No advanced data",
    savePrefs: "Remember options",
    clearPrefs: "Clear options",
    maxFindings: "Max findings",
  },
};

function severityClasses(severity: SecuritySeverity): string {
  switch (severity) {
    case "critical":
      return "bg-red-700 text-white";
    case "high":
      return "bg-red-100 text-red-900";
    case "medium":
      return "bg-yellow-100 text-yellow-900";
    case "low":
      return "bg-blue-100 text-blue-900";
    case "info":
      return "bg-gray-100 text-gray-700";
  }
}

function severityLabel(
  language: "zh" | "en",
  severity: SecuritySeverity,
): string {
  const t = labels[language];
  switch (severity) {
    case "critical":
      return t.critical;
    case "high":
      return t.high;
    case "medium":
      return t.medium;
    case "low":
      return t.low;
    case "info":
      return t.info;
  }
}

function formatDuration(ms: number, language: "zh" | "en"): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  return language === "zh" ? `${sec} 秒` : `${sec}s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function FindingCard({
  finding,
  repo,
  language,
}: {
  finding: SecurityFinding;
  repo: { owner: string; name: string };
  language: "zh" | "en";
}) {
  const t = labels[language];
  const location = finding.evidence[0]?.location;

  const githubUrl = useMemo(() => {
    if (!location?.filePath) return null;
    const line = location.lineStart ? `#L${location.lineStart}` : "";
    return `https://github.com/${repo.owner}/${repo.name}/blob/main/${location.filePath}${line}`;
  }, [location, repo.owner, repo.name]);

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">{finding.title}</p>
          <p className="text-xs text-gray-600 mt-0.5">{finding.description}</p>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded font-semibold ${severityClasses(finding.severity)}`}
        >
          {severityLabel(language, finding.severity)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-50 rounded px-2 py-1">
          <span className="text-gray-500">{t.category}: </span>
          <span className="text-gray-800 font-medium">{finding.category}</span>
        </div>
        <div className="bg-gray-50 rounded px-2 py-1">
          <span className="text-gray-500">{t.confidence}: </span>
          <span className="text-gray-800 font-medium">
            {Math.round(finding.confidence * 100)}%
          </span>
        </div>
      </div>

      {finding.impact && (
        <div className="text-xs text-gray-700">
          <span className="font-semibold text-gray-800">{t.impact}: </span>
          {finding.impact}
        </div>
      )}

      <div className="text-xs text-gray-700">
        <span className="font-semibold text-gray-800">
          {t.recommendation}:{" "}
        </span>
        {finding.recommendation}
      </div>

      {finding.evidence.length > 0 && (
        <div className="text-xs text-gray-700">
          <span className="font-semibold text-gray-800">{t.evidence}: </span>
          <ul className="mt-1 space-y-1">
            {finding.evidence.slice(0, 2).map((ev, idx) => (
              <li key={idx} className="bg-gray-50 rounded p-2">
                <p className="text-gray-800">{ev.message}</p>
                {ev.location?.filePath && (
                  <p className="text-gray-500 mt-0.5 font-mono break-all">
                    {ev.location.filePath}
                    {ev.location.lineStart ? `:${ev.location.lineStart}` : ""}
                  </p>
                )}
                {ev.location?.snippet && (
                  <p className="text-gray-600 mt-1 line-clamp-2">
                    {ev.location.snippet}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {githubUrl && (
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-blue-600 hover:text-blue-800 underline"
        >
          {t.openOnGithub}
        </a>
      )}
    </div>
  );
}

interface AdvancedOptions {
  useAdvancedMode: boolean;
  includeDependencyAudit: boolean;
  includeSecretsScan: boolean;
  includeMalwareHeuristics: boolean;
  includeHistoricalScan: boolean;
  includeRuntimeBehaviorAnalysis: boolean;
  includePolicyChecks: boolean;
  includeLicenseRiskAudit: boolean;
  baselineReportId: string;
  riskScoreThreshold: number;
  maxFindings: number;
  policyProfile: PolicyProfile;
  remember: boolean;
}

const defaultAdvancedOptions: AdvancedOptions = {
  useAdvancedMode: true,
  includeDependencyAudit: true,
  includeSecretsScan: true,
  includeMalwareHeuristics: true,
  includeHistoricalScan: true,
  includeRuntimeBehaviorAnalysis: true,
  includePolicyChecks: true,
  includeLicenseRiskAudit: true,
  baselineReportId: "",
  riskScoreThreshold: 70,
  maxFindings: 180,
  policyProfile: "balanced",
  remember: true,
};

function SecurityAuditTab({ repo, language }: SecurityAuditTabProps) {
  const [report, setReport] = useState<SecurityAuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [options, setOptions] = useState<AdvancedOptions>(
    defaultAdvancedOptions,
  );

  const t = labels[language];
  const cacheKey = StorageKeys.securityAudit(repo, language);
  const prefsKey = STORAGE_KEYS.securityAuditPrefs;
  const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

  const buildCompactReport = (
    full: SecurityAuditReport,
  ): SecurityAuditReport => {
    const compactFindings = full.findings.slice(0, 80).map((f) => ({
      ...f,
      evidence: f.evidence.slice(0, 1).map((ev) => ({
        ...ev,
        location: ev.location
          ? {
              ...ev.location,
              snippet: ev.location.snippet?.slice(0, 160),
            }
          : undefined,
      })),
    }));

    return {
      ...full,
      findings: compactFindings,
      advanced: full.advanced
        ? {
            commitRisk: full.advanced.commitRisk?.slice(0, 6),
            dependencyDiffRisk: full.advanced.dependencyDiffRisk?.slice(0, 6),
            policyViolations: full.advanced.policyViolations?.slice(0, 6),
            runtimeIndicators: full.advanced.runtimeIndicators?.slice(0, 6),
          }
        : undefined,
    };
  };

  const saveAuditCache = (key: string, report: SecurityAuditReport) => {
    const payload = JSON.stringify({
      data: buildCompactReport(report),
      timestamp: Date.now(),
    });

    try {
      localStorage.setItem(key, payload);
      return;
    } catch {
      // quota likely exceeded, try freeing stale audit cache
    }

    try {
      const toRemove: string[] = [];
      const now = Date.now();

      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (!k.startsWith(STORAGE_PREFIXES.securityAudit)) continue;
        if (k === key) continue;

        try {
          const raw = localStorage.getItem(k);
          if (!raw) {
            toRemove.push(k);
            continue;
          }
          const parsed = JSON.parse(raw) as { timestamp?: number };
          if (!parsed.timestamp || now - parsed.timestamp > CACHE_TTL_MS) {
            toRemove.push(k);
          }
        } catch {
          toRemove.push(k);
        }
      }

      toRemove.forEach((k) => localStorage.removeItem(k));
      localStorage.setItem(key, payload);
      return;
    } catch {
      // still failed, degrade to summary-only cache
    }

    try {
      const summaryOnly: SecurityAuditReport = {
        ...report,
        findings: [],
        nextActions: report.nextActions.slice(0, 6),
        advanced: undefined,
      };
      localStorage.setItem(
        key,
        JSON.stringify({ data: summaryOnly, timestamp: Date.now() }),
      );
    } catch {
      // ignore final cache failure to avoid breaking audit UX
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(prefsKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<AdvancedOptions>;
        setOptions((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore invalid prefs
    }
  }, []);

  const savePrefs = () => {
    if (!options.remember) return;
    try {
      localStorage.setItem(prefsKey, JSON.stringify(options));
    } catch {
      // ignore preference persistence failure
    }
  };

  const clearPrefs = () => {
    localStorage.removeItem(prefsKey);
    setOptions(defaultAdvancedOptions);
  };

  const runAudit = async (force = false) => {
    setError(null);
    setLoading(true);

    try {
      if (!force) {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as {
            data: SecurityAuditReport;
            timestamp: number;
          };
          const valid = Date.now() - parsed.timestamp < CACHE_TTL_MS;
          if (valid && parsed.data?.summary) {
            setReport(parsed.data);
            setLoading(false);
            return;
          }
        }
      }

      const result = await runSecurityAudit(repo, {
        language,
        useAdvancedMode: options.useAdvancedMode,
        includeDependencyAudit: options.includeDependencyAudit,
        includeSecretsScan: options.includeSecretsScan,
        includeMalwareHeuristics: options.includeMalwareHeuristics,
        includeHistoricalScan: options.includeHistoricalScan,
        includeRuntimeBehaviorAnalysis: options.includeRuntimeBehaviorAnalysis,
        includePolicyChecks: options.includePolicyChecks,
        includeLicenseRiskAudit: options.includeLicenseRiskAudit,
        baselineReportId: options.baselineReportId || undefined,
        riskScoreThreshold: options.riskScoreThreshold,
        maxFindings: options.maxFindings,
      });

      setReport(result);
      saveAuditCache(cacheKey, result);
      savePrefs();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.unknown);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAudit(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo.owner, repo.name, language]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{t.title}</h3>
          <p className="text-xs text-gray-600 mt-1">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAdvancedOptions((v) => !v)}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium transition"
          >
            {t.options}
          </button>
          <button
            onClick={() => runAudit(true)}
            disabled={loading}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded text-xs font-medium transition"
          >
            {loading ? t.running : report ? t.rerun : t.run}
          </button>
        </div>
      </div>

      {showAdvancedOptions && (
        <div className="border border-gray-200 rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="flex items-center justify-between bg-gray-50 rounded p-2">
              <span>{t.mode}</span>
              <select
                value={options.useAdvancedMode ? "advanced" : "standard"}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    useAdvancedMode: e.target.value === "advanced",
                  }))
                }
                className="border border-gray-300 rounded px-1 py-0.5"
              >
                <option value="standard">{t.standard}</option>
                <option value="advanced">{t.advanced}</option>
              </select>
            </label>

            <label className="flex items-center justify-between bg-gray-50 rounded p-2">
              <span>{t.profile}</span>
              <select
                value={options.policyProfile}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    policyProfile: e.target.value as PolicyProfile,
                  }))
                }
                className="border border-gray-300 rounded px-1 py-0.5"
              >
                <option value="strict">{t.strict}</option>
                <option value="balanced">{t.balanced}</option>
                <option value="permissive">{t.permissive}</option>
              </select>
            </label>

            <label className="flex items-center justify-between bg-gray-50 rounded p-2">
              <span>{t.maxFindings}</span>
              <input
                type="number"
                min={20}
                max={500}
                value={options.maxFindings}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    maxFindings: Number(e.target.value || 180),
                  }))
                }
                className="w-20 border border-gray-300 rounded px-1 py-0.5"
              />
            </label>

            <label className="flex items-center justify-between bg-gray-50 rounded p-2">
              <span>{t.threshold}</span>
              <input
                type="number"
                min={1}
                max={100}
                value={options.riskScoreThreshold}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    riskScoreThreshold: Number(e.target.value || 70),
                  }))
                }
                className="w-20 border border-gray-300 rounded px-1 py-0.5"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ["includeDependencyAudit", t.includeDeps],
              ["includeSecretsScan", t.includeSecrets],
              ["includeMalwareHeuristics", t.includeMalware],
              ["includeHistoricalScan", t.historicalScan],
              ["includeRuntimeBehaviorAnalysis", t.runtimeScan],
              ["includePolicyChecks", t.policyCheck],
              ["includeLicenseRiskAudit", t.licenseAudit],
            ].map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 bg-gray-50 rounded p-2"
              >
                <input
                  type="checkbox"
                  checked={Boolean((options as any)[key])}
                  onChange={(e) =>
                    setOptions((prev: any) => ({
                      ...prev,
                      [key]: e.target.checked,
                    }))
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700 block">
              {t.baseline}
            </label>
            <input
              type="text"
              value={options.baselineReportId}
              onChange={(e) =>
                setOptions((prev) => ({
                  ...prev,
                  baselineReportId: e.target.value,
                }))
              }
              placeholder="optional-baseline-id"
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs flex items-center gap-2">
              <input
                type="checkbox"
                checked={options.remember}
                onChange={(e) =>
                  setOptions((prev) => ({
                    ...prev,
                    remember: e.target.checked,
                  }))
                }
              />
              {t.savePrefs}
            </label>
            <button
              onClick={clearPrefs}
              className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
            >
              {t.clearPrefs}
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="py-6 flex justify-center">
          <LoadingSpinner size="md" text={t.running} />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {report && !loading && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 rounded p-2">
              <p className="text-[11px] text-gray-500">{t.riskScore}</p>
              <p className="text-lg font-bold text-gray-900">
                {report.summary.overallRiskScore}
              </p>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <p className="text-[11px] text-gray-500">{t.findings}</p>
              <p className="text-lg font-bold text-gray-900">
                {report.summary.totalFindings}
              </p>
            </div>
            <div className="bg-gray-50 rounded p-2">
              <p className="text-[11px] text-gray-500">{t.scanned}</p>
              <p className="text-lg font-bold text-gray-900">
                {report.summary.scannedFiles}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 text-center">
            {(
              [
                "critical",
                "high",
                "medium",
                "low",
                "info",
              ] as SecuritySeverity[]
            ).map((sev) => (
              <div key={sev} className="rounded border border-gray-200 p-2">
                <p className="text-[11px] text-gray-500">
                  {severityLabel(language, sev)}
                </p>
                <p className="text-sm font-semibold text-gray-900">
                  {report.summary.bySeverity[sev]}
                </p>
              </div>
            ))}
          </div>

          <div className="text-xs text-gray-500">
            {t.lastRun}: {formatTime(report.meta.finishedAt)} ·{" "}
            {formatDuration(report.meta.durationMs, language)} ·{" "}
            {t.dependencies}: {report.summary.scannedDependencies} · {t.mode}:{" "}
            {report.meta.mode === "advanced" ? t.advanced : t.standard}
          </div>

          {report.findings.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded p-3 text-xs text-green-700">
              {t.noFindings}
            </div>
          ) : (
            <div className="space-y-2">
              {report.findings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  repo={repo}
                  language={language}
                />
              ))}
            </div>
          )}

          {report.nextActions.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-800 mb-2">
                {t.nextActions}
              </p>
              <ul className="space-y-1 text-xs text-gray-700 list-disc ml-4">
                {report.nextActions.map((action, idx) => (
                  <li key={idx}>{action}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="border border-gray-200 rounded-lg p-3 space-y-3">
            <p className="text-xs font-semibold text-gray-800">
              {t.advancedReport}
            </p>

            {report.advanced ? (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">
                    {t.commitRisk}
                  </p>
                  {report.advanced.commitRisk &&
                  report.advanced.commitRisk.length > 0 ? (
                    <div className="space-y-1">
                      {report.advanced.commitRisk
                        .slice(0, 8)
                        .map((item, idx) => (
                          <div
                            key={idx}
                            className="text-xs bg-gray-50 rounded p-2 flex justify-between"
                          >
                            <span className="font-mono text-gray-700">
                              {item.commitSha.slice(0, 16)}...
                            </span>
                            <span className="text-gray-700">
                              risk {item.riskScore}
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">{t.noAdvancedData}</p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">
                    {t.dependencyDiffRisk}
                  </p>
                  {report.advanced.dependencyDiffRisk &&
                  report.advanced.dependencyDiffRisk.length > 0 ? (
                    <div className="space-y-1">
                      {report.advanced.dependencyDiffRisk
                        .slice(0, 8)
                        .map((item, idx) => (
                          <div
                            key={idx}
                            className="text-xs bg-gray-50 rounded p-2 flex justify-between"
                          >
                            <span className="font-mono text-gray-700">
                              {item.name}{" "}
                              {item.toVersion ? `@${item.toVersion}` : ""}
                            </span>
                            <span className="text-gray-700">
                              risk {item.riskScore}
                            </span>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">{t.noAdvancedData}</p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">
                    {t.policyViolations}
                  </p>
                  {report.advanced.policyViolations &&
                  report.advanced.policyViolations.length > 0 ? (
                    <div className="space-y-1">
                      {report.advanced.policyViolations
                        .slice(0, 8)
                        .map((item, idx) => (
                          <div
                            key={idx}
                            className="text-xs bg-gray-50 rounded p-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-gray-800 font-medium">
                                {item.title}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded ${severityClasses(item.severity)}`}
                              >
                                {severityLabel(language, item.severity)}
                              </span>
                            </div>
                            <p className="text-gray-600 mt-1">
                              {item.description}
                            </p>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">{t.noAdvancedData}</p>
                  )}
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-2">
                    {t.runtimeIndicators}
                  </p>
                  {report.advanced.runtimeIndicators &&
                  report.advanced.runtimeIndicators.length > 0 ? (
                    <div className="space-y-1">
                      {report.advanced.runtimeIndicators
                        .slice(0, 8)
                        .map((item, idx) => (
                          <div
                            key={idx}
                            className="text-xs bg-gray-50 rounded p-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-gray-800">
                                {item.indicator}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded ${severityClasses(item.severity)}`}
                              >
                                {severityLabel(language, item.severity)}
                              </span>
                            </div>
                            {item.evidence && (
                              <p className="text-gray-600 mt-1 line-clamp-2">
                                {item.evidence}
                              </p>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">{t.noAdvancedData}</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-500">{t.noAdvancedData}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default SecurityAuditTab;
