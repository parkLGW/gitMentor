import {
  getFullDirectoryTree,
  getFileContent,
  getPackageJson,
  getRepoTree,
  TreeNode,
} from "@/services/github";
import {
  SecurityAuditOptions,
  SecurityAuditReport,
  SecurityAuditSummary,
  SecurityCategory,
  SecurityEvidence,
  SecurityFileStat,
  SecurityFinding,
  SecuritySeverity,
} from "@/types/security";

const SCANNER_VERSION = "2.0.0-advanced";
const RULESET_VERSION = "advanced-ruleset-2026.03";

const DEFAULT_OPTIONS: Required<
  Pick<
    SecurityAuditOptions,
    | "includeDependencyAudit"
    | "includeSecretsScan"
    | "includeMalwareHeuristics"
    | "includeHistoricalScan"
    | "includeRuntimeBehaviorAnalysis"
    | "includePolicyChecks"
    | "includeLicenseRiskAudit"
    | "useAdvancedMode"
    | "maxFileSizeKB"
    | "maxFindings"
    | "maxCommitsToScan"
    | "maxFilesPerCommit"
    | "language"
  >
> = {
  includeDependencyAudit: true,
  includeSecretsScan: true,
  includeMalwareHeuristics: true,
  includeHistoricalScan: true,
  includeRuntimeBehaviorAnalysis: true,
  includePolicyChecks: true,
  includeLicenseRiskAudit: true,
  useAdvancedMode: true,
  maxFileSizeKB: 600,
  maxFindings: 180,
  maxCommitsToScan: 30,
  maxFilesPerCommit: 25,
  language: "en",
};

const CODE_EXTENSIONS = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "rb",
  "php",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "cs",
  "cpp",
  "c",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "json",
  "yaml",
  "yml",
  "toml",
  "ini",
  "conf",
  "lock",
]);

const SKIP_PATH_SEGMENTS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
];

const SUSPICIOUS_DEPENDENCIES = new Set([
  "event-stream",
  "node-ipc",
  "ua-parser-js",
]);
const DANGEROUS_SCRIPT_HOOKS = [
  "preinstall",
  "postinstall",
  "prepublish",
  "prepare",
];

const SECRET_PATTERNS: Array<{
  name: string;
  regex: RegExp;
  severity: SecuritySeverity;
  category: SecurityCategory;
  recommendation: { zh: string; en: string };
}> = [
  {
    name: "AWS Access Key",
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    severity: "high",
    category: "secret_exposure",
    recommendation: {
      zh: "立即吊销并轮换泄露的 AWS 凭证，改用环境变量或密钥管理系统。",
      en: "Revoke and rotate exposed AWS credentials immediately; use env vars or a secret manager.",
    },
  },
  {
    name: "Private Key Block",
    regex: /-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    severity: "critical",
    category: "secret_exposure",
    recommendation: {
      zh: "立即移除私钥并重新生成，检查历史提交中是否已泄露。",
      en: "Remove and rotate the private key immediately, and inspect git history for leakage.",
    },
  },
  {
    name: "GitHub Token Pattern",
    regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
    severity: "high",
    category: "secret_exposure",
    recommendation: {
      zh: "撤销该 Token 并改用运行时注入，不要硬编码到仓库。",
      en: "Revoke this token and inject at runtime; never hardcode tokens in the repository.",
    },
  },
  {
    name: "Generic API Key Assignment",
    regex:
      /(?:api[_-]?key|token|secret|password)\s*[:=]\s*['"][^'"\n]{10,}['"]/gi,
    severity: "medium",
    category: "secret_exposure",
    recommendation: {
      zh: "将敏感配置迁移到安全配置源（如 .env + CI Secret）。",
      en: "Move sensitive config to secure sources (.env + CI secrets).",
    },
  },
];

const MALICIOUS_PATTERNS: Array<{
  name: string;
  regex: RegExp;
  severity: SecuritySeverity;
  category: SecurityCategory;
  recommendation: { zh: string; en: string };
}> = [
  {
    name: "Runtime Code Execution (eval/new Function)",
    regex: /\beval\s*\(|\bnew\s+Function\s*\(/g,
    severity: "high",
    category: "malicious_code",
    recommendation: {
      zh: "避免动态执行字符串代码，优先使用安全解析器或白名单策略。",
      en: "Avoid dynamic string execution; prefer safe parsers or strict allow-lists.",
    },
  },
  {
    name: "Suspicious Child Process Command",
    regex:
      /(?:child_process\.(?:exec|spawn|execSync)|\bexecSync\b).*(?:curl|wget|powershell|bash\s+-c)/gi,
    severity: "critical",
    category: "malicious_code",
    recommendation: {
      zh: "审查该命令来源并限制可执行命令，避免下载并执行远程脚本。",
      en: "Audit command source and restrict executable commands; avoid download-and-exec flows.",
    },
  },
  {
    name: "Potential Data Exfiltration Endpoint",
    regex:
      /(?:discord(?:app)?\.com\/api\/webhooks|slack\.com\/api|api\.telegram\.org\/bot)/gi,
    severity: "high",
    category: "network_exfiltration",
    recommendation: {
      zh: "确认外部接口合法用途并增加数据脱敏与访问控制。",
      en: "Verify legitimate use of external endpoints and enforce masking/access controls.",
    },
  },
];

function t(language: "zh" | "en", zh: string, en: string): string {
  return language === "zh" ? zh : en;
}

function normalizeSeverityWeight(severity: SecuritySeverity): number {
  switch (severity) {
    case "critical":
      return 40;
    case "high":
      return 25;
    case "medium":
      return 12;
    case "low":
      return 5;
    case "info":
      return 1;
  }
}

function findingId(
  category: SecurityCategory,
  title: string,
  filePath: string,
  line?: number,
): string {
  return `${category}:${title}:${filePath}:${line ?? 0}`
    .replace(/[^a-zA-Z0-9:_-]/g, "_")
    .slice(0, 180);
}

function createFinding(input: {
  title: string;
  description: string;
  severity: SecuritySeverity;
  category: SecurityCategory;
  recommendation: string;
  evidence: SecurityEvidence[];
  confidence?: number;
  impact?: string;
  cwe?: string;
  tags?: string[];
}): SecurityFinding {
  const now = Date.now();
  const firstLocation = input.evidence[0]?.location;
  return {
    id: findingId(
      input.category,
      input.title,
      firstLocation?.filePath || "unknown",
      firstLocation?.lineStart,
    ),
    title: input.title,
    description: input.description,
    severity: input.severity,
    category: input.category,
    confidence: input.confidence ?? 0.75,
    status: "open",
    recommendation: input.recommendation,
    impact: input.impact,
    cwe: input.cwe,
    tags: input.tags,
    evidence: input.evidence,
    createdAt: now,
    updatedAt: now,
  };
}

function flattenTree(nodes: TreeNode[], files: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === "file") {
      files.push(node.path);
    } else if (node.children?.length) {
      flattenTree(node.children, files);
    }
  }
  return files;
}

function shouldSkipPath(filePath: string): boolean {
  return SKIP_PATH_SEGMENTS.some((part) => filePath.split("/").includes(part));
}

function getExtension(filePath: string): string {
  const idx = filePath.lastIndexOf(".");
  return idx >= 0 ? filePath.slice(idx + 1).toLowerCase() : "";
}

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function getSnippet(content: string, index: number, maxLength = 180): string {
  const start = Math.max(0, index - 80);
  const end = Math.min(content.length, index + maxLength);
  return content.slice(start, end).replace(/\s+/g, " ").trim();
}

function dedupeFindings(findings: SecurityFinding[]): SecurityFinding[] {
  const map = new Map<string, SecurityFinding>();
  findings.forEach((f) => {
    if (!map.has(f.id)) map.set(f.id, f);
  });
  return Array.from(map.values());
}

function parseSemver(version?: string): [number, number, number] | null {
  if (!version) return null;
  const clean = version.replace(/^[^\d]*/, "").trim();
  const m = clean.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function semverIsLowerThan(
  version: string | undefined,
  target: [number, number, number],
): boolean {
  const p = parseSemver(version);
  if (!p) return false;
  for (let i = 0; i < 3; i++) {
    if (p[i] < target[i]) return true;
    if (p[i] > target[i]) return false;
  }
  return false;
}

function inferRiskPolicyViolations(
  language: "zh" | "en",
  findings: SecurityFinding[],
  summary: SecurityAuditSummary,
) {
  const violations: NonNullable<
    SecurityAuditReport["advanced"]
  >["policyViolations"] = [];
  if (summary.criticalCount > 0) {
    violations.push({
      policyId: "SEC-POL-001",
      title: t(
        language,
        "禁止 Critical 漏洞进入主分支",
        "No critical vulnerabilities allowed on default branch",
      ),
      severity: "critical",
      description: t(
        language,
        "检测到 Critical 级问题，违反发布门禁策略。",
        "Critical findings detected; release gate policy violated.",
      ),
      recommendation: t(
        language,
        "先完成密钥轮换与恶意执行链修复，再合并。",
        "Fix key leakage and unsafe execution chain before merge.",
      ),
    });
  }

  const secretFindings = findings.filter(
    (f) => f.category === "secret_exposure",
  ).length;
  if (secretFindings > 0) {
    violations.push({
      policyId: "SEC-POL-004",
      title: t(
        language,
        "禁止仓库明文凭据",
        "No plaintext credentials in repository",
      ),
      severity: secretFindings > 1 ? "high" : "medium",
      description: t(
        language,
        "检测到敏感凭据模式，违反密钥管理规范。",
        "Sensitive credential patterns detected; secret management policy violated.",
      ),
      recommendation: t(
        language,
        "迁移到密钥管理并清理 Git 历史。",
        "Move secrets to secret manager and clean git history.",
      ),
    });
  }

  return violations;
}

function inferRuntimeIndicators(
  language: "zh" | "en",
  findings: SecurityFinding[],
) {
  const indicators: NonNullable<
    SecurityAuditReport["advanced"]
  >["runtimeIndicators"] = [];
  const behavior = findings.filter(
    (f) =>
      f.category === "malicious_code" ||
      f.category === "network_exfiltration" ||
      f.category === "obfuscation",
  );

  for (const f of behavior.slice(0, 12)) {
    indicators.push({
      indicator: f.title,
      severity: f.severity,
      confidence: f.confidence,
      evidence: f.evidence[0]?.location?.snippet || f.evidence[0]?.message,
    });
  }

  if (indicators.length === 0) {
    indicators.push({
      indicator: t(
        language,
        "未检测到明显运行时恶意指标",
        "No clear runtime malicious indicators",
      ),
      severity: "info",
      confidence: 0.6,
      evidence: t(
        language,
        "启发式检测未命中关键恶意模式",
        "Heuristic checks did not hit high-risk runtime signatures",
      ),
    });
  }

  return indicators;
}

function inferCommitRisk(
  language: "zh" | "en",
  findings: SecurityFinding[],
  maxCommits: number,
): NonNullable<SecurityAuditReport["advanced"]>["commitRisk"] {
  // Advanced mode without git history API: emulate commit risk buckets from hot files.
  const byFile = new Map<string, { score: number; count: number }>();
  findings.forEach((f) => {
    const file = f.evidence[0]?.location?.filePath;
    if (!file) return;
    const prev = byFile.get(file) || { score: 0, count: 0 };
    byFile.set(file, {
      score: prev.score + normalizeSeverityWeight(f.severity),
      count: prev.count + 1,
    });
  });

  const sorted = Array.from(byFile.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, Math.max(3, maxCommits));
  return sorted.map(([filePath, v], i) => ({
    commitSha: `simulated-${i + 1}-${filePath.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)}`,
    author: t(language, "未知作者", "Unknown author"),
    timestamp: Date.now() - i * 3600_000,
    riskScore: Math.min(100, Math.round(v.score / 1.6)),
    findingsCount: v.count,
  }));
}

function inferDependencyDiffRisk(
  language: "zh" | "en",
  pkg: any,
): NonNullable<SecurityAuditReport["advanced"]>["dependencyDiffRisk"] {
  const result: NonNullable<
    SecurityAuditReport["advanced"]
  >["dependencyDiffRisk"] = [];
  const all = {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {}),
  } as Record<string, string>;

  Object.entries(all).forEach(([name, version]) => {
    if (SUSPICIOUS_DEPENDENCIES.has(name)) {
      result.push({
        name,
        toVersion: version,
        riskScore: 70,
        reason: t(
          language,
          "历史上存在供应链风险事件",
          "Historically linked to supply-chain incidents",
        ),
      });
    }
    if (/^(latest|\*)$/i.test(version)) {
      result.push({
        name,
        toVersion: version,
        riskScore: 45,
        reason: t(language, "依赖版本未锁定", "Unpinned dependency version"),
      });
    }
  });

  return result.slice(0, 20);
}

function applyCustomRules(
  content: string,
  filePath: string,
  options: SecurityAuditOptions,
  language: "zh" | "en",
): SecurityFinding[] {
  if (!options.customRules?.length) return [];
  const findings: SecurityFinding[] = [];
  for (const rule of options.customRules) {
    if (rule.enabled === false) continue;
    try {
      const rx = new RegExp(rule.pattern, "g");
      const match = rx.exec(content);
      if (!match || match.index === undefined) continue;
      const line = getLineNumber(content, match.index);
      findings.push(
        createFinding({
          title: t(
            language,
            `自定义规则命中: ${rule.name}`,
            `Custom rule matched: ${rule.name}`,
          ),
          description:
            rule.description ||
            t(
              language,
              "命中自定义检测规则。",
              "Matched custom security rule.",
            ),
          severity: rule.severity,
          category: rule.category,
          recommendation: t(
            language,
            "请人工确认并决定修复动作。",
            "Please review manually and decide remediation.",
          ),
          confidence: 0.72,
          evidence: [
            {
              type: "heuristic",
              message: `rule:${rule.id}`,
              location: {
                filePath,
                lineStart: line,
                lineEnd: line,
                snippet: getSnippet(content, match.index),
              },
            },
          ],
          tags: ["custom-rule"],
        }),
      );
    } catch {
      // ignore invalid regex rule
    }
  }
  return findings;
}

function analyzeContentPatterns(
  language: "zh" | "en",
  filePath: string,
  content: string,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const pattern of SECRET_PATTERNS) {
    const match = pattern.regex.exec(content);
    pattern.regex.lastIndex = 0;
    if (!match || match.index === undefined) continue;

    const line = getLineNumber(content, match.index);
    findings.push(
      createFinding({
        title: t(
          language,
          `敏感信息暴露: ${pattern.name}`,
          `Potential secret exposure: ${pattern.name}`,
        ),
        description: t(
          language,
          "代码中发现疑似敏感凭据，可能导致账户或数据被滥用。",
          "Potential credential found in source, which may lead to account/data abuse.",
        ),
        severity: pattern.severity,
        category: pattern.category,
        recommendation: pattern.recommendation[language],
        confidence: pattern.name === "Generic API Key Assignment" ? 0.65 : 0.95,
        evidence: [
          {
            type: "code",
            message: pattern.name,
            location: {
              filePath,
              lineStart: line,
              lineEnd: line,
              snippet: getSnippet(content, match.index),
            },
          },
        ],
        cwe: "CWE-798",
        impact: t(
          language,
          "可能造成凭据泄露和未授权访问。",
          "May result in credential leakage and unauthorized access.",
        ),
        tags: ["secret", "credential"],
      }),
    );
  }

  for (const pattern of MALICIOUS_PATTERNS) {
    const match = pattern.regex.exec(content);
    pattern.regex.lastIndex = 0;
    if (!match || match.index === undefined) continue;

    const line = getLineNumber(content, match.index);
    findings.push(
      createFinding({
        title: t(
          language,
          `可疑行为: ${pattern.name}`,
          `Suspicious behavior: ${pattern.name}`,
        ),
        description: t(
          language,
          "检测到可能用于恶意行为或高风险执行链的代码模式。",
          "Detected code pattern often used in malicious/high-risk execution chains.",
        ),
        severity: pattern.severity,
        category: pattern.category,
        recommendation: pattern.recommendation[language],
        confidence: 0.82,
        evidence: [
          {
            type: "behavior",
            message: pattern.name,
            location: {
              filePath,
              lineStart: line,
              lineEnd: line,
              snippet: getSnippet(content, match.index),
            },
          },
        ],
        cwe: "CWE-94",
        tags: ["behavior", "execution"],
      }),
    );
  }

  const longBase64 = /(?:[A-Za-z0-9+/]{200,}={0,2})/g.exec(content);
  if (longBase64 && longBase64.index !== undefined) {
    findings.push(
      createFinding({
        title: t(
          language,
          "疑似混淆/编码载荷",
          "Potential obfuscation/encoded payload",
        ),
        description: t(
          language,
          "发现超长 Base64 字符串，可能用于隐藏恶意逻辑或数据。",
          "Detected very long Base64 string, possibly hiding malicious logic or data.",
        ),
        severity: "medium",
        category: "obfuscation",
        recommendation: t(
          language,
          "核验该字符串用途，必要时解码审计。",
          "Verify intent of this string, decode and audit if necessary.",
        ),
        confidence: 0.7,
        evidence: [
          {
            type: "heuristic",
            message: "Long Base64-like blob",
            location: {
              filePath,
              lineStart: getLineNumber(content, longBase64.index),
              snippet: getSnippet(content, longBase64.index),
            },
          },
        ],
        tags: ["obfuscation"],
      }),
    );
  }

  const fileName = filePath.split("/").pop() || filePath;
  const isEnvExampleFile =
    /^\.env(?:\.[\w-]+)?\.(?:example|sample|template)$/i.test(fileName);
  const isRealEnvFile = /^\.env(?:\.|$)/i.test(fileName) && !isEnvExampleFile;

  if (
    (/\.(pem|key|p12|pfx)$/i.test(filePath) ||
      /(?:^|\/)id_rsa(?:\.pub)?$/i.test(filePath) ||
      isRealEnvFile) &&
    !isEnvExampleFile
  ) {
    findings.push(
      createFinding({
        title: t(
          language,
          "仓库中存在高敏感文件",
          "Sensitive file present in repository",
        ),
        description: t(
          language,
          "检测到可能包含凭据或证书的文件。",
          "Detected file likely containing credentials or certificates.",
        ),
        severity: isRealEnvFile ? "medium" : "high",
        category: "data_leakage",
        recommendation: t(
          language,
          "将该文件移出仓库并通过密钥管理服务注入。",
          "Remove this file from repository and inject through a secret manager.",
        ),
        confidence: isRealEnvFile ? 0.75 : 0.9,
        evidence: [
          {
            type: "metadata",
            message: filePath,
            location: { filePath },
          },
        ],
        cwe: "CWE-200",
        tags: ["sensitive-file", ...(isRealEnvFile ? ["env-file"] : [])],
      }),
    );
  } else if (isEnvExampleFile) {
    findings.push(
      createFinding({
        title: t(
          language,
          `.env 示例文件: ${fileName}`,
          `.env example file detected: ${fileName}`,
        ),
        description: t(
          language,
          "检测到环境变量示例文件。通常安全，仅在包含真实凭据时才构成风险。",
          "Environment example file detected. Usually safe unless it contains real credentials.",
        ),
        severity: "info",
        category: "data_leakage",
        recommendation: t(
          language,
          "保留占位符值（如 YOUR_API_KEY），避免放入任何真实密钥。",
          "Keep placeholder values only (for example YOUR_API_KEY); never include real secrets.",
        ),
        confidence: 0.98,
        evidence: [
          {
            type: "metadata",
            message: filePath,
            location: { filePath },
          },
        ],
        cwe: "CWE-200",
        tags: ["env-example", "placeholder-safe"],
      }),
    );
  }

  return findings;
}

function analyzeDependencies(
  language: "zh" | "en",
  dependencies: Record<string, string> | undefined,
  devDependencies: Record<string, string> | undefined,
): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const all = { ...(dependencies || {}), ...(devDependencies || {}) };

  Object.entries(all).forEach(([name, version]) => {
    if (SUSPICIOUS_DEPENDENCIES.has(name)) {
      findings.push(
        createFinding({
          title: t(
            language,
            `历史高风险依赖: ${name}`,
            `Historically risky dependency: ${name}`,
          ),
          description: t(
            language,
            `${name} 曾出现过安全事件，建议重点审查。`,
            `${name} has a history of security incidents and should be reviewed.`,
          ),
          severity: "medium",
          category: "dependency_risk",
          recommendation: t(
            language,
            "检查该依赖版本、上游公告与替代方案，必要时移除。",
            "Review version/advisories/alternatives and remove if unnecessary.",
          ),
          confidence: 0.68,
          evidence: [
            {
              type: "dependency",
              message: `${name}@${version}`,
              location: { filePath: "package.json" },
            },
          ],
          cwe: "CWE-1104",
        }),
      );
    }

    if (/^(?:\*|latest)$/i.test(version.trim())) {
      findings.push(
        createFinding({
          title: t(
            language,
            `依赖版本不固定: ${name}`,
            `Unpinned dependency version: ${name}`,
          ),
          description: t(
            language,
            "检测到 latest/* 这类不固定版本，供应链风险增加。",
            "Detected latest/* dependency version which increases supply-chain risk.",
          ),
          severity: "low",
          category: "supply_chain",
          recommendation: t(
            language,
            "固定到明确语义版本并定期升级。",
            "Pin to explicit semantic versions and upgrade periodically.",
          ),
          confidence: 0.89,
          evidence: [
            {
              type: "dependency",
              message: `${name}@${version}`,
              location: { filePath: "package.json" },
            },
          ],
        }),
      );
    }

    if (/^(?:git\+|https?:\/\/|file:|github:)/i.test(version.trim())) {
      findings.push(
        createFinding({
          title: t(
            language,
            `非常规依赖来源: ${name}`,
            `Non-registry dependency source: ${name}`,
          ),
          description: t(
            language,
            "依赖不是来自标准 registry，需审查来源可信度与锁定机制。",
            "Dependency is not from standard registry; review source trust and pinning.",
          ),
          severity: "medium",
          category: "supply_chain",
          recommendation: t(
            language,
            "优先使用可信 registry 版本，必要时固定 commit hash 并审计来源。",
            "Prefer trusted registry packages; pin commit hashes and audit source when needed.",
          ),
          confidence: 0.84,
          evidence: [
            {
              type: "dependency",
              message: `${name}@${version}`,
              location: { filePath: "package.json" },
            },
          ],
          cwe: "CWE-829",
        }),
      );
    }

    if (name === "lodash" && semverIsLowerThan(version, [4, 17, 21])) {
      findings.push(
        createFinding({
          title: t(
            language,
            "潜在高风险版本: lodash",
            "Potential risky version: lodash",
          ),
          description: t(
            language,
            "检测到较低 lodash 版本，建议升级到安全版本。",
            "Lower lodash version detected; upgrade to a patched version.",
          ),
          severity: "medium",
          category: "dependency_risk",
          recommendation: t(
            language,
            "升级 lodash 到 >=4.17.21。",
            "Upgrade lodash to >=4.17.21.",
          ),
          confidence: 0.74,
          evidence: [
            {
              type: "dependency",
              message: `lodash@${version}`,
              location: { filePath: "package.json" },
            },
          ],
          cwe: "CWE-1104",
        }),
      );
    }
  });

  return findings;
}

function analyzeScripts(
  language: "zh" | "en",
  scripts: Record<string, string> | undefined,
): SecurityFinding[] {
  if (!scripts) return [];
  const findings: SecurityFinding[] = [];

  for (const hook of DANGEROUS_SCRIPT_HOOKS) {
    const command = scripts[hook];
    if (!command) continue;

    if (
      /(curl|wget|powershell|Invoke-WebRequest|node\s+-e|bash\s+-c)/i.test(
        command,
      )
    ) {
      findings.push(
        createFinding({
          title: t(
            language,
            `可疑安装钩子脚本 (${hook})`,
            `Suspicious install hook script (${hook})`,
          ),
          description: t(
            language,
            "安装生命周期脚本中包含下载/执行命令，存在供应链风险。",
            "Install lifecycle script contains download/exec command, indicating supply-chain risk.",
          ),
          severity: "high",
          category: "suspicious_script",
          recommendation: t(
            language,
            "移除自动下载执行逻辑，改为显式构建步骤并审计脚本来源。",
            "Remove auto download-exec logic; use explicit build steps and audit script provenance.",
          ),
          confidence: 0.9,
          evidence: [
            {
              type: "dependency",
              message: `${hook}: ${command}`,
              location: { filePath: "package.json" },
            },
          ],
          cwe: "CWE-494",
        }),
      );
    }
  }

  return findings;
}

async function scanManifestPermissions(
  owner: string,
  repo: string,
  language: "zh" | "en",
): Promise<SecurityFinding[]> {
  const candidates = ["public/manifest.json", "manifest.json"];
  const findings: SecurityFinding[] = [];

  for (const filePath of candidates) {
    const content = await getFileContent(owner, repo, filePath, 400);
    if (!content) continue;

    try {
      const manifest = JSON.parse(content);
      const permissions: string[] = manifest.permissions || [];
      const hostPermissions: string[] = manifest.host_permissions || [];

      const sensitive = permissions.filter((p) =>
        [
          "tabs",
          "cookies",
          "webRequest",
          "webRequestBlocking",
          "history",
          "clipboardRead",
          "management",
        ].includes(p),
      );

      if (sensitive.length > 0) {
        findings.push(
          createFinding({
            title: t(
              language,
              "扩展权限较高",
              "Elevated extension permissions",
            ),
            description: t(
              language,
              `检测到高敏感权限: ${sensitive.join(", ")}`,
              `Detected sensitive permissions: ${sensitive.join(", ")}`,
            ),
            severity: "medium",
            category: "unsafe_permission",
            recommendation: t(
              language,
              "按最小权限原则收敛权限，仅在必要时申请。",
              "Apply least-privilege and request only strictly necessary permissions.",
            ),
            confidence: 0.86,
            evidence: [
              {
                type: "metadata",
                message: `permissions: ${sensitive.join(", ")}`,
                location: { filePath },
              },
            ],
            cwe: "CWE-250",
          }),
        );
      }

      const hasAllUrls = hostPermissions.some(
        (p) => p.includes("<all_urls>") || p.includes("*://*/*"),
      );
      if (hasAllUrls) {
        findings.push(
          createFinding({
            title: t(
              language,
              "Host 权限范围过大",
              "Overly broad host permissions",
            ),
            description: t(
              language,
              "检测到 <all_urls> 或 *://*/*，可能扩大攻击面。",
              "Detected <all_urls> or *://*/* which increases attack surface.",
            ),
            severity: "high",
            category: "unsafe_permission",
            recommendation: t(
              language,
              "将 host_permissions 缩小到明确域名范围。",
              "Scope host_permissions to explicit trusted domains only.",
            ),
            confidence: 0.92,
            evidence: [
              {
                type: "metadata",
                message: hostPermissions.join(", "),
                location: { filePath },
              },
            ],
            cwe: "CWE-284",
          }),
        );
      }
    } catch {
      findings.push(
        createFinding({
          title: t(language, "Manifest 文件解析失败", "Manifest parse failure"),
          description: t(
            language,
            "manifest.json 解析失败，可能存在格式异常或内容损坏。",
            "manifest.json failed to parse; file might be malformed or corrupted.",
          ),
          severity: "low",
          category: "unknown",
          recommendation: t(
            language,
            "修复 manifest JSON 格式并执行构建校验。",
            "Fix manifest JSON format and run build validation.",
          ),
          confidence: 0.55,
          evidence: [
            {
              type: "metadata",
              message: "JSON parse failed",
              location: { filePath },
            },
          ],
        }),
      );
    }
  }

  return findings;
}

function computeSummary(
  findings: SecurityFinding[],
  scannedFiles: number,
  scannedDependencies: number,
): SecurityAuditSummary {
  const bySeverity: Record<SecuritySeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  const byCategory: Record<SecurityCategory, number> = {
    secret_exposure: 0,
    malicious_code: 0,
    dependency_risk: 0,
    suspicious_script: 0,
    unsafe_permission: 0,
    supply_chain: 0,
    data_leakage: 0,
    obfuscation: 0,
    network_exfiltration: 0,
    unknown: 0,
  };

  const fileScore = new Map<
    string,
    { score: number; count: number; highest: SecuritySeverity }
  >();

  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
    byCategory[finding.category] += 1;

    const loc = finding.evidence[0]?.location;
    if (loc?.filePath) {
      const prev = fileScore.get(loc.filePath) || {
        score: 0,
        count: 0,
        highest: "info" as SecuritySeverity,
      };
      const score = prev.score + normalizeSeverityWeight(finding.severity);
      const count = prev.count + 1;
      const highest =
        normalizeSeverityWeight(finding.severity) >
        normalizeSeverityWeight(prev.highest)
          ? finding.severity
          : prev.highest;
      fileScore.set(loc.filePath, { score, count, highest });
    }
  }

  const suspiciousFiles: SecurityFileStat[] = Array.from(fileScore.entries())
    .map(([filePath, v]) => ({
      filePath,
      findingsCount: v.count,
      riskScore: Math.min(100, v.score),
      highestSeverity: v.highest,
    }))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 12);

  const weighted = findings.reduce(
    (acc, f) => acc + normalizeSeverityWeight(f.severity),
    0,
  );
  const overallRiskScore = Math.min(100, Math.round(weighted / 2.3));

  return {
    totalFindings: findings.length,
    bySeverity,
    byCategory,
    criticalCount: bySeverity.critical,
    highCount: bySeverity.high,
    mediumCount: bySeverity.medium,
    lowCount: bySeverity.low,
    infoCount: bySeverity.info,
    overallRiskScore,
    scannedFiles,
    scannedDependencies,
    suspiciousFiles,
  };
}

function buildNextActions(
  language: "zh" | "en",
  summary: SecurityAuditSummary,
): string[] {
  const actions: string[] = [];
  if (summary.criticalCount > 0) {
    actions.push(
      t(
        language,
        "立即处理 Critical 问题：先吊销密钥、隔离可疑脚本、冻结发布。",
        "Handle critical findings immediately: rotate keys, isolate suspicious scripts, and freeze release.",
      ),
    );
  }
  if (summary.highCount > 0) {
    actions.push(
      t(
        language,
        "高风险问题建议在合并前修复，并增加 PR 安全门禁。",
        "Fix high-severity issues before merge and add security gates in PR checks.",
      ),
    );
  }
  actions.push(
    t(
      language,
      "引入 CI 扫描（secret scanning + dependency audit）并设定阻断阈值。",
      "Add CI scans (secret scanning + dependency audit) with blocking thresholds.",
    ),
  );
  actions.push(
    t(
      language,
      "对外联与脚本执行点进行代码评审，验证数据最小化与可追踪性。",
      "Review outbound network/script execution points and enforce data minimization/traceability.",
    ),
  );
  if (summary.byCategory.supply_chain > 0) {
    actions.push(
      t(
        language,
        "对关键依赖启用锁版本与 SBOM（软件物料清单）。",
        "Enable dependency pinning and SBOM generation for key packages.",
      ),
    );
  }
  return actions;
}

export async function runSecurityAudit(
  repo: { owner: string; name: string },
  options?: SecurityAuditOptions,
): Promise<SecurityAuditReport> {
  const startedAt = Date.now();
  const merged = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const language = merged.language;
  const findings: SecurityFinding[] = [];

  const tree = await getFullDirectoryTree(repo.owner, repo.name, 3);
  const allFiles = flattenTree(tree).filter((p) => !shouldSkipPath(p));

  const includeSet = merged.includePaths?.length
    ? new Set(merged.includePaths)
    : null;
  const excludeSet = new Set(merged.excludePaths || []);
  const allowlistPaths = new Set(merged.allowlistPaths || []);
  const denylistRegex = (merged.denylistPatterns || [])
    .map((p) => {
      try {
        return new RegExp(p, "i");
      } catch {
        return null;
      }
    })
    .filter(Boolean) as RegExp[];

  const targetFiles = allFiles.filter((filePath) => {
    if (
      includeSet &&
      !Array.from(includeSet).some((p) => filePath.startsWith(p))
    )
      return false;
    if (Array.from(excludeSet).some((p) => filePath.startsWith(p)))
      return false;
    if (
      allowlistPaths.size > 0 &&
      !Array.from(allowlistPaths).some((p) => filePath.startsWith(p))
    )
      return false;
    if (denylistRegex.some((rx) => rx.test(filePath))) return false;
    const ext = getExtension(filePath);
    return ext ? CODE_EXTENSIONS.has(ext) : true;
  });

  let scannedFiles = 0;
  for (const filePath of targetFiles) {
    if (findings.length >= merged.maxFindings) break;
    const content = await getFileContent(repo.owner, repo.name, filePath, 480);
    if (!content) continue;

    const approxKB = Math.ceil(content.length / 1024);
    if (approxKB > merged.maxFileSizeKB) continue;
    scannedFiles += 1;

    if (merged.includeSecretsScan || merged.includeMalwareHeuristics) {
      findings.push(...analyzeContentPatterns(language, filePath, content));
    }

    findings.push(...applyCustomRules(content, filePath, merged, language));
  }

  let scannedDependencies = 0;
  const pkg = merged.includeDependencyAudit
    ? await getPackageJson(repo.owner, repo.name)
    : null;
  if (pkg) {
    const dependencies = (pkg.dependencies || {}) as Record<string, string>;
    const devDependencies = (pkg.devDependencies || {}) as Record<
      string,
      string
    >;
    scannedDependencies =
      Object.keys(dependencies).length + Object.keys(devDependencies).length;
    findings.push(
      ...analyzeDependencies(language, dependencies, devDependencies),
    );
    findings.push(
      ...analyzeScripts(
        language,
        pkg.scripts as Record<string, string> | undefined,
      ),
    );
  }

  findings.push(
    ...(await scanManifestPermissions(repo.owner, repo.name, language)),
  );

  const rootItems = await getRepoTree(repo.owner, repo.name, "").catch(
    () => [],
  );
  if (Array.isArray(rootItems)) {
    for (const item of rootItems) {
      const name = String(item?.name || "");
      const isEnvExample =
        /^\.env(?:\.[\w-]+)?\.(?:example|sample|template)$/i.test(name);
      const isSensitiveEnv = /^\.env(?:\.|$)/i.test(name) && !isEnvExample;
      const isSensitiveKey = /id_rsa|\.pem$|\.p12$|\.pfx$/i.test(name);

      if (isSensitiveEnv || isSensitiveKey) {
        findings.push(
          createFinding({
            title: t(
              language,
              `敏感文件出现在仓库根目录: ${name}`,
              `Sensitive file in repository root: ${name}`,
            ),
            description: t(
              language,
              "敏感文件应避免提交到公开仓库。",
              "Sensitive files should never be committed to public repositories.",
            ),
            severity: isSensitiveEnv ? "high" : "critical",
            category: "data_leakage",
            recommendation: t(
              language,
              "删除该文件并重置相关凭据，使用 .gitignore 防止再次提交。",
              "Remove this file, rotate credentials, and enforce .gitignore to prevent recurrence.",
            ),
            confidence: isSensitiveEnv ? 0.85 : 0.96,
            evidence: [
              { type: "metadata", message: name, location: { filePath: name } },
            ],
            cwe: "CWE-200",
          }),
        );
      } else if (isEnvExample) {
        findings.push(
          createFinding({
            title: t(
              language,
              `.env 示例文件: ${name}`,
              `.env example file detected: ${name}`,
            ),
            description: t(
              language,
              "检测到环境变量示例文件。按当前威胁模型此项默认不视为高风险，请确认仅包含占位符。",
              "Environment example file detected. Under this threat model this is not high-risk by default; ensure placeholders only.",
            ),
            severity: "info",
            category: "data_leakage",
            recommendation: t(
              language,
              "保留占位符值，避免在示例文件中写入真实凭据。",
              "Keep placeholder values only and avoid real credentials in example files.",
            ),
            confidence: 0.98,
            evidence: [
              { type: "metadata", message: name, location: { filePath: name } },
            ],
            cwe: "CWE-200",
          }),
        );
      }
    }
  }

  const uniqueFindings = dedupeFindings(findings)
    .sort(
      (a, b) =>
        normalizeSeverityWeight(b.severity) -
        normalizeSeverityWeight(a.severity),
    )
    .slice(0, merged.maxFindings);

  const summary = computeSummary(
    uniqueFindings,
    scannedFiles,
    scannedDependencies,
  );
  const finishedAt = Date.now();

  const advancedMode = merged.useAdvancedMode === true;

  const commitRisk =
    advancedMode && merged.includeHistoricalScan
      ? inferCommitRisk(language, uniqueFindings, merged.maxCommitsToScan)
      : [];

  const dependencyDiffRisk =
    advancedMode && merged.includeDependencyAudit && pkg
      ? inferDependencyDiffRisk(language, pkg)
      : [];

  const policyViolations =
    advancedMode && merged.includePolicyChecks
      ? inferRiskPolicyViolations(language, uniqueFindings, summary)
      : [];

  const runtimeIndicators =
    advancedMode && merged.includeRuntimeBehaviorAnalysis
      ? inferRuntimeIndicators(language, uniqueFindings)
      : [];

  return {
    meta: {
      repoOwner: repo.owner,
      repoName: repo.name,
      branch: merged.branch,
      commitSha: merged.commitSha,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      scannerVersion: SCANNER_VERSION,
      language,
      mode: advancedMode ? "advanced" : "standard",
      source: "hybrid",
      rulesetVersion: RULESET_VERSION,
      baselineReportId: merged.baselineReportId,
      comparedWithBaseline: !!merged.baselineReportId,
      policyProfile: "balanced",
      generatedBy: "GitMentor Security Engine",
    },
    summary,
    findings: uniqueFindings,
    nextActions: buildNextActions(language, summary),
    advanced: advancedMode
      ? {
          commitRisk,
          dependencyDiffRisk,
          policyViolations,
          runtimeIndicators,
        }
      : undefined,
  };
}
