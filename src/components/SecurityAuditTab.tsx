import { useEffect, useMemo, useState } from "react";
import { LoadingSpinner } from "./LoadingSpinner";
import { runSecurityAudit } from "@/services/security-audit";
import {
  SecurityAuditReport,
  SecurityFinding,
  SecuritySeverity,
} from "@/types/security";
import { STORAGE_KEYS, STORAGE_PREFIXES, StorageKeys } from "@/constants/storage";
import { buildGithubBlobUrl } from "@/services/github-url";
import { getJsonCache } from "@/utils/local-cache";
import { Button } from "@/components/ui/Button";

interface SecurityAuditTabProps {
  repo: { owner: string; name: string };
  language: "zh" | "en";
  defaultBranch?: string;
}

const labels = {
  zh: {
    title: "安全审计",
    subtitle: "检测潜在数据泄露、恶意代码与供应链风险",
    scanScopeNote:
      "基于静态启发式规则的扫描，覆盖常见密钥模式与高风险代码特征，非完整漏洞库，结果需人工确认。",
    suspiciousFiles: "高风险文件",
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
    options: "扫描选项",
    policyCheck: "策略校验",
    includeDeps: "依赖启发式检查",
    includeSecrets: "敏感信息扫描",
    includeMalware: "恶意模式检测",
    policyViolations: "策略违规",
    savePrefs: "记住选项",
    clearPrefs: "清除选项",
    maxFindings: "最大发现数",
    riskLabel: "风险分",
    confidenceHigh: "高",
    confidenceMedium: "中",
    confidenceLow: "低",
  },
  en: {
    title: "Security Audit",
    subtitle:
      "Detect potential data leakage, malicious code, and supply-chain risks",
    scanScopeNote:
      "Static heuristic scan covering common secret patterns and high-risk code signatures. Not a full vulnerability database; findings need manual review.",
    suspiciousFiles: "High-risk files",
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
    options: "Scan options",
    policyCheck: "Policy checks",
    includeDeps: "Dependency heuristics",
    includeSecrets: "Secret scan",
    includeMalware: "Malware heuristics",
    policyViolations: "Policy violations",
    savePrefs: "Remember options",
    clearPrefs: "Clear options",
    maxFindings: "Max findings",
    riskLabel: "Risk",
    confidenceHigh: "High",
    confidenceMedium: "Medium",
    confidenceLow: "Low",
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

const categoryLabels: Record<string, { zh: string; en: string }> = {
  secret_exposure: { zh: "敏感信息泄露", en: "Secret exposure" },
  malicious_code: { zh: "可疑代码", en: "Suspicious code" },
  dependency_risk: { zh: "依赖风险", en: "Dependency risk" },
  suspicious_script: { zh: "可疑脚本", en: "Suspicious script" },
  unsafe_permission: { zh: "权限风险", en: "Permission risk" },
  supply_chain: { zh: "供应链", en: "Supply chain" },
  data_leakage: { zh: "数据泄露", en: "Data leakage" },
  obfuscation: { zh: "混淆/编码", en: "Obfuscation" },
  network_exfiltration: { zh: "外联风险", en: "Network exfiltration" },
  unknown: { zh: "未分类", en: "Uncategorized" },
};

function categoryLabel(language: "zh" | "en", category: string): string {
  const entry = categoryLabels[category];
  return entry ? entry[language] : category;
}

// Heuristic confidences are coarse constants; present them as buckets rather
// than percentages that suggest calibrated precision
function confidenceBucket(language: "zh" | "en", confidence: number): string {
  const t = labels[language];
  if (confidence >= 0.9) return t.confidenceHigh;
  if (confidence >= 0.7) return t.confidenceMedium;
  return t.confidenceLow;
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
  defaultBranch = "main",
}: {
  finding: SecurityFinding;
  repo: { owner: string; name: string };
  language: "zh" | "en";
  defaultBranch?: string;
}) {
  const t = labels[language];
  const location = finding.evidence[0]?.location;

  const githubUrl = useMemo(() => {
    if (!location?.filePath) return null;
    return buildGithubBlobUrl(repo, location.filePath, defaultBranch, location.lineStart);
  }, [defaultBranch, location, repo]);

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
          <span className="text-gray-800 font-medium">
            {categoryLabel(language, finding.category)}
          </span>
        </div>
        <div className="bg-gray-50 rounded px-2 py-1">
          <span className="text-gray-500">{t.confidence}: </span>
          <span className="text-gray-800 font-medium">
            {confidenceBucket(language, finding.confidence)}
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
  includeDependencyAudit: boolean;
  includeSecretsScan: boolean;
  includeMalwareHeuristics: boolean;
  includePolicyChecks: boolean;
  maxFindings: number;
  remember: boolean;
}

const defaultAdvancedOptions: AdvancedOptions = {
  includeDependencyAudit: true,
  includeSecretsScan: true,
  includeMalwareHeuristics: true,
  includePolicyChecks: true,
  maxFindings: 180,
  remember: true,
};

function SecurityAuditTab({ repo, language, defaultBranch = "main" }: SecurityAuditTabProps) {
  const [report, setReport] = useState<SecurityAuditReport | null>(null);
  const [visibleFindings, setVisibleFindings] = useState(50);

  useEffect(() => {
    setVisibleFindings(50);
  }, [report]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [options, setOptions] = useState<AdvancedOptions>(
    defaultAdvancedOptions,
  );

  const t = labels[language];
  // Include the scan options in the cache key so changing options never
  // surfaces a report produced under a different configuration
  const optionsFingerprint = [
    options.includeDependencyAudit ? 1 : 0,
    options.includeSecretsScan ? 1 : 0,
    options.includeMalwareHeuristics ? 1 : 0,
    options.includePolicyChecks ? 1 : 0,
    options.maxFindings,
  ].join("-");
  const cacheKey = `${StorageKeys.securityAudit(repo, language)}:${optionsFingerprint}`;
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
            policyViolations: full.advanced.policyViolations?.slice(0, 6),
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
        const cachedReport = getJsonCache<SecurityAuditReport>(
          cacheKey,
          CACHE_TTL_MS,
          (data) => Boolean((data as SecurityAuditReport)?.summary),
        );
        if (cachedReport) {
          setReport(cachedReport);
          setLoading(false);
          return;
        }
      }

      const result = await runSecurityAudit(repo, {
        language,
        includeDependencyAudit: options.includeDependencyAudit,
        includeSecretsScan: options.includeSecretsScan,
        includeMalwareHeuristics: options.includeMalwareHeuristics,
        includePolicyChecks: options.includePolicyChecks,
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
          <p className="text-[11px] text-gray-400 mt-1">{t.scanScopeNote}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowAdvancedOptions((v) => !v)}>
            {t.options}
          </Button>
          <Button size="sm" onClick={() => runAudit(true)} disabled={loading}>
            {loading ? t.running : report ? t.rerun : t.run}
          </Button>
        </div>
      </div>

      {showAdvancedOptions && (
        <div className="border border-gray-200 rounded-lg p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
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
                className="w-20 border border-gray-300 rounded px-2 py-1 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {(
              [
                ["includeDependencyAudit", t.includeDeps],
                ["includeSecretsScan", t.includeSecrets],
                ["includeMalwareHeuristics", t.includeMalware],
                ["includePolicyChecks", t.policyCheck],
              ] as Array<[keyof AdvancedOptions, string]>
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 bg-gray-50 rounded p-2"
              >
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={Boolean(options[key])}
                  onChange={(e) =>
                    setOptions((prev) => ({
                      ...prev,
                      [key]: e.target.checked,
                    }))
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <label className="text-xs flex items-center gap-2">
              <input
                type="checkbox"
                className="accent-blue-600"
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
            {t.dependencies}: {report.summary.scannedDependencies}
          </div>

          {report.summary.suspiciousFiles.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-800 mb-2">
                {t.suspiciousFiles}
              </p>
              <div className="space-y-1">
                {report.summary.suspiciousFiles.slice(0, 8).map((file) => (
                  <div
                    key={file.filePath}
                    className="text-xs bg-gray-50 rounded p-2 flex items-center justify-between gap-2"
                  >
                    <span className="font-mono text-gray-700 break-all">
                      {file.filePath}
                    </span>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 rounded ${severityClasses(file.highestSeverity)}`}
                      >
                        {severityLabel(language, file.highestSeverity)}
                      </span>
                      <span className="text-gray-600">
                        {t.riskLabel} {file.riskScore}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.findings.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded p-3 text-xs text-green-700">
              {t.noFindings}
            </div>
          ) : (
            <div className="space-y-2">
              {report.findings.slice(0, visibleFindings).map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  repo={repo}
                  language={language}
                  defaultBranch={defaultBranch}
                />
              ))}
              {report.findings.length > visibleFindings && (
                <button
                  onClick={() => setVisibleFindings((count) => count + 50)}
                  className="w-full py-2 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-50 transition"
                >
                  {language === "zh"
                    ? `显示更多（剩余 ${report.findings.length - visibleFindings} 条）`
                    : `Show more (${report.findings.length - visibleFindings} remaining)`}
                </button>
              )}
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

          {report.advanced?.policyViolations &&
            report.advanced.policyViolations.length > 0 && (
              <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-800">
                  {t.policyViolations}
                </p>
                <div className="space-y-1">
                  {report.advanced.policyViolations.slice(0, 8).map((item, idx) => (
                    <div key={idx} className="text-xs bg-gray-50 rounded p-2">
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
                      <p className="text-gray-600 mt-1">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </>
      )}
    </div>
  );
}

export default SecurityAuditTab;
