# BotLinking (bot-hosting.net)

This folder is a standalone CommonJS deployment package for the Voax Linking Discord bot. Set the host's startup file to `index.js` (or run `npm start`) and use Node.js 20.11+.

## Required environment variables

Set these in the bot-hosting.net environment/secrets panel:

- `DISCORD_BOT_TOKEN` — token for the Voax Linking bot. `BOT_TOKEN` and `TOKEN` are accepted aliases.
- `SUPABASE_URL` — Voax Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role key. `SUPABASE_SERVICE_KEY` is accepted as an alias.

Optional:

- `OUTBOX_POLL_MS` — queue polling interval in milliseconds (default 1500; minimum 1000).
- `OUTBOX_BATCH_SIZE` — maximum jobs per poll (default 10; maximum 50).
- `OUTBOX_MAX_ATTEMPTS` — attempts before a job is marked dead (default 12).

## Discord setup

Enable **Message Content Intent** in the Discord Developer Portal. The bot needs the channel-specific permissions documented in `LinkingBot/README.md`. The bot uses Guilds, Guild Messages, and Message Content gateway intents; it does not need Presence or Server Members intents.

## Deploy

Upload/deploy this folder as a Node.js bot project. Install dependencies using the included `package.json`, then start `index.js`. Do not upload a `.env` file or put credentials in source code.

The Supabase Voax Linking migrations must be applied before starting the bot. Keep the service-role key private. This bot-hosting package and `LinkingBot/` use the same database queue and message mappings; do not run two copies of the worker against the same queue unless you intentionally want multiple workers.

## Notes

- Only newly created messages are imported; no historical channel backfill is performed.
- Discord bot/webhook messages are ignored to prevent bridge loops.
- The bridge preserves Discord message content/embeds and uses `[Discord]` / `[Voax]` attribution.
- The hosting service must support a persistent Node.js process and outbound Discord Gateway connections (WebSocket).
