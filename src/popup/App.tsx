import { useEffect, useState } from "react";
import TabNav from "@/components/TabNav";
import OverviewTab from "@/components/OverviewTab";
import QuickStartTab from "@/components/QuickStartTab";
import SourceMapTab from "@/components/SourceMapTab";
import AgentTab from "@/components/AgentTab";
import SettingsTab from "@/components/SettingsTab";
import SecurityAuditTab from "@/components/SecurityAuditTab";
import { useRepo } from "@/hooks/useRepo";
import { useLanguage } from "@/hooks/useLanguage";
import { getDefaultBranch } from "@/services/github";

type TabType =
  | "overview"
  | "quickstart"
  | "sourcemap"
  | "agent"
  | "security"
  | "settings";

function getInitialTab(): TabType {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "overview" ||
    tab === "quickstart" ||
    tab === "sourcemap" ||
    tab === "agent" ||
    tab === "security" ||
    tab === "settings"
    ? tab
    : "overview";
}

// The file sidebar hands a question over here when the reader wants a real
// conversation about it. It is prefilled, not sent.
function getInitialQuestion(): string {
  return (
    new URLSearchParams(window.location.search).get("q")?.slice(0, 500) ?? ""
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);
  const [initialQuestion] = useState<string>(getInitialQuestion);
  const { repo, loading, error } = useRepo();
  const { language, setLanguage } = useLanguage();
  const [defaultBranch, setDefaultBranch] = useState("main");

  useEffect(() => {
    if (!repo) return;
    let cancelled = false;
    getDefaultBranch(repo.owner, repo.name)
      .then((branch) => {
        if (!cancelled && branch) setDefaultBranch(branch);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [repo]);

  if (loading) {
    return (
      <div className="p-6 text-center">
        <div className="animate-pulse text-gray-500">
          {language === "zh" ? "加载中..." : "Loading..."}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="text-red-500 text-sm">
          {language === "zh"
            ? "请在 GitHub 项目页打开此插件"
            : "Please open this extension on a GitHub project page"}
        </div>
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="p-6 text-center">
        <div className="text-gray-500 text-sm">
          {language === "zh"
            ? "无法识别此项目"
            : "Unable to recognize this project"}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-bold text-gray-900">GitMentor</h1>
          </div>
          <button
            onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
            className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded transition"
          >
            {language === "zh" ? "EN" : "中文"}
          </button>
        </div>
        <p className="text-xs text-gray-600">
          {repo.owner}/{repo.name}
        </p>
        <button
          onClick={() => setActiveTab("settings")}
          className="mt-2 w-full text-left text-[11px] px-2 py-1.5 rounded border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 transition"
        >
          {language === "zh"
            ? "遇到 GitHub rate limit？可在设置页填写 GitHub Token 提高稳定性"
            : "Hit GitHub rate limits? Add a GitHub token in Settings for better stability"}
        </button>
      </div>

      {/* Tab Navigation */}
      <TabNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        language={language}
      />

      {/* Tab Content */}
      <div className="max-h-[600px] overflow-y-auto">
        {activeTab === "settings" && <SettingsTab language={language} />}
        {activeTab === "security" && (
          <SecurityAuditTab repo={repo} language={language} defaultBranch={defaultBranch} />
        )}
        {activeTab !== "settings" && activeTab !== "security" && (
          <div className="px-4 py-4">
            {activeTab === "overview" && (
              <OverviewTab repo={repo} language={language} />
            )}
            {activeTab === "quickstart" && (
              <QuickStartTab repo={repo} language={language} />
            )}
            {activeTab === "sourcemap" && (
              <SourceMapTab repo={repo} language={language} defaultBranch={defaultBranch} />
            )}
            {activeTab === "agent" && (
              <AgentTab
                repo={repo}
                language={language}
                initialQuestion={initialQuestion}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
