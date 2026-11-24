/** First-run + personalisation state. Contains no secrets (API keys are never written here). */
export type UseCase = "chat" | "code" | "image" | "video" | "voice" | "server";

export interface OnboardingState {
  done: boolean;
  uses: UseCase[];
  /** Model ids the user chose to install at the end of onboarding. */
  picks: string[];
}

export const ONBOARDING_KEY = "apex.onboarding.v1";
export const EMPTY_ONBOARDING: OnboardingState = { done: false, uses: [], picks: [] };

export function loadOnboarding(): OnboardingState {
  try {
    const raw = JSON.parse(localStorage.getItem(ONBOARDING_KEY) ?? "null") as Partial<OnboardingState> | null;
    if (!raw) return EMPTY_ONBOARDING;
    return {
      done: raw.done === true,
      uses: Array.isArray(raw.uses) ? raw.uses : [],
      picks: Array.isArray(raw.picks) ? raw.picks : [],
    };
  } catch {
    return EMPTY_ONBOARDING;
  }
}

export function saveOnboarding(s: OnboardingState) {
  try {
    localStorage.setItem(ONBOARDING_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
