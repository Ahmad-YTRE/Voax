import test from "node:test";
import assert from "node:assert/strict";
import { discordToVoaxMarkdown, escapeDiscordMentions, voaxToDiscordMarkdown } from "./markdown.js";
test("Discord Markdown is preserved without HTML interpretation",()=>{const source="**bold** *italic* ~~strike~~ ||spoiler|| `code`\n> quote\n```ts\nconst x = 1;\n```";assert.equal(discordToVoaxMarkdown(source),source);});
test("Voax Markdown is bounded to Discord message limit",()=>{assert.equal(voaxToDiscordMarkdown("x".repeat(5000)).length,4000);});
test("mass mentions are escaped to prevent unintended notifications",()=>{assert.equal(escapeDiscordMentions("@everyone and @here"),"@\u200beveryone and @\u200bhere");});
