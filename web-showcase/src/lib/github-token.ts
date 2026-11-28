/** In-memory holder for the signed-in user's own GitHub token. Persistence lives in secure-store.ts only. */
let token = "";
export const getGithubToken = (): string => token;
export const setGithubTokenMemory = (t: string) => {
  token = t;
};
