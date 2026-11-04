/** Keep Discord Markdown as inert text; Voax renders it with its own safe renderer. */
export function discordToVoaxMarkdown(input: string): string { return input; }
export function voaxToDiscordMarkdown(input: string): string { return input.slice(0, 4000); }
export function escapeDiscordMentions(input: string): string { return input.replace(/@(everyone|here)/gi, "@\u200b$1"); }
