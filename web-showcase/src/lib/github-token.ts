/**
 * The user's OWN GitHub token. Lives only in this device's localStorage under `apex_user_github_token`.
 * Nothing about any GitHub account is bundled with the app: no token, no default profile, no fallback user.
 */
export const USER_TOKEN_KEY = "apex_user_github_token";
export const USER_PUBLIC_KEY = "apex_user_github_username";
const LEGACY = ["apex.github.pat.v1", "apex.github.public.v1", "apex.github.profile.v1", "apex.github.repo.v1"];

export const getGithubToken = (): string => {
  try {
    return localStorage.getItem(USER_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
};
export function setGithubToken(t: string) {
  try {
    if (t.trim()) localStorage.setItem(USER_TOKEN_KEY, t.trim());
    else localStorage.removeItem(USER_TOKEN_KEY);
  } catch {
    /* storage blocked */
  }
}

/** One-time cleanup: earlier builds offered a one-tap connect to a fixed account. Drop that session so nobody stays attached to an account they never chose. */
export function purgeLegacyGithubSession() {
  try {
    for (const k of LEGACY) localStorage.removeItem(k);
  } catch {
    /* storage blocked */
  }
}
if (typeof window !== "undefined") purgeLegacyGithubSession();
