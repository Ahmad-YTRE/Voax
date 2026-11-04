type Level = "debug" | "info" | "warn" | "error";
const rank: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const configured = (process.env.LOG_LEVEL ?? "info") as Level;
export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  if (rank[level] < (rank[configured] ?? 20)) return;
  const safe = { ...fields };
  for (const key of ["token", "authorization", "secret", "access_token", "refresh_token"]) delete safe[key];
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...safe });
  if (level === "error") console.error(line); else if (level === "warn") console.warn(line); else console.log(line);
}
