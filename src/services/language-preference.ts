export type GitMentorLanguage = "zh" | "en";

export interface InitialLanguagePreferenceInput {
  savedLanguage?: string | null;
  legacyLanguage?: string | null;
  browserLanguage?: string | null;
}

export interface InitialLanguagePreference {
  language: GitMentorLanguage;
  shouldPersist: boolean;
}

function normalizeLanguage(value?: string | null): GitMentorLanguage | null {
  if (value === "zh" || value === "en") {
    return value;
  }
  return null;
}

function detectBrowserLanguage(browserLanguage?: string | null): GitMentorLanguage {
  return String(browserLanguage || "en").startsWith("zh") ? "zh" : "en";
}

export function resolveInitialLanguagePreference(
  input: InitialLanguagePreferenceInput,
): InitialLanguagePreference {
  const saved = normalizeLanguage(input.savedLanguage) ||
    normalizeLanguage(input.legacyLanguage);
  if (saved) {
    return {
      language: saved,
      shouldPersist: false,
    };
  }

  return {
    language: detectBrowserLanguage(input.browserLanguage),
    shouldPersist: true,
  };
}
