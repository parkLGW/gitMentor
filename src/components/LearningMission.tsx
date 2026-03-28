import { useEffect, useMemo, useState } from "react";
import { StorageKeys } from "@/constants/storage";
import { LearningMission } from "@/types/learning";

interface LearningMissionProps {
  mission: LearningMission;
  repoKey: string;
  language: "zh" | "en";
  onFileClick?: (path: string) => void;
}

interface MissionProgressMap {
  [stepId: string]: boolean;
}

export function LearningMission({
  mission,
  repoKey,
  language,
  onFileClick,
}: LearningMissionProps) {
  const [progress, setProgress] = useState<MissionProgressMap>({});
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const isZh = language === "zh";
  const storageKey = useMemo(() => StorageKeys.learningMission(repoKey), [repoKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          progress?: MissionProgressMap;
          missionGeneratedAt?: number;
        };
        if (parsed.missionGeneratedAt === mission.generatedAt && parsed.progress) {
          setProgress(parsed.progress);
          return;
        }
      }
      setProgress({});
    } catch {
      setProgress({});
    }
  }, [mission.generatedAt, storageKey]);

  const saveProgress = (next: MissionProgressMap) => {
    setProgress(next);
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          progress: next,
          missionGeneratedAt: mission.generatedAt,
        }),
      );
    } catch {
      // ignore storage quota errors
    }
  };

  const completed = mission.steps.filter((step) => progress[step.id]).length;
  const total = mission.steps.length || 1;
  const completionPct = Math.round((completed / total) * 100);
  const nextStep = mission.steps.find((step) => !progress[step.id]) || mission.steps[0];

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-700">
            {isZh ? "任务进度" : "Mission Progress"}
          </span>
          <span className="text-sm font-semibold text-gray-900">{completionPct}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-200 rounded-full">
          <div
            className="h-1.5 bg-gray-800 rounded-full transition-all"
            style={{ width: `${completionPct}%` }}
          />
        </div>
        {nextStep && (
          <p className="mt-2 text-xs text-gray-600">
            {isZh ? "下一步：" : "Next: "}
            <span className="font-medium text-gray-800">{nextStep.title}</span>
          </p>
        )}
      </div>

      <div className="space-y-2">
        {mission.steps.map((step) => {
          const done = Boolean(progress[step.id]);
          const expanded = expandedStep === step.id;
          return (
            <div key={step.id} className="border border-gray-200 rounded">
              <button
                onClick={() => setExpandedStep(expanded ? null : step.id)}
                className="w-full p-3 text-left hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      saveProgress({ ...progress, [step.id]: !done });
                    }}
                    className={`w-5 h-5 rounded border flex items-center justify-center text-xs ${
                      done
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-gray-300 text-transparent"
                    }`}
                  >
                    ✓
                  </button>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{step.title}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{step.objective}</p>
                  </div>
                  <div className="text-xs text-gray-500">{step.estimatedMinutes}m</div>
                </div>
              </button>

              {expanded && (
                <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">
                      {isZh ? "必读文件" : "Required Files"}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {step.requiredFiles.length > 0 ? (
                        step.requiredFiles.map((file) => (
                          <button
                            key={file}
                            onClick={() => onFileClick?.(file)}
                            className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-700"
                          >
                            {file}
                          </button>
                        ))
                      ) : (
                        <span className="text-xs text-gray-500">README.md</span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-700">
                    <span className="font-semibold text-gray-800">
                      {isZh ? "完成判定：" : "Done When: "}
                    </span>
                    {step.completionCriteria}
                  </p>
                  <p className="text-xs text-gray-700">
                    <span className="font-semibold text-gray-800">
                      {isZh ? "下一步提示：" : "Next Hint: "}
                    </span>
                    {step.nextStepHint}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default LearningMission;
