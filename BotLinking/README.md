# Voax Linking Bot (BotLinking)

**BotLinking is the one and only bot runtime folder.** It contains the complete Voax Linking Gateway worker and the Node.js entry point required by bot-hosting.net. This is the single runtime for two-way message synchronization, member-join welcome events, welcome cards, and welcome sticker actions. The website/API and this persistent bot process deploy independently.

## bot-hosting.net setup

1. Upload the contents of this `BotLinking/` folder as the bot project.
2. Use Node.js **20.11 or newer** (Node 22 recommended).
3. Set the startup file to `index.js` or use the package start command `npm start`.
4. Install dependencies from `package.json`.
5. Add the required environment variables below in the host's environment/secrets panel.
6. Enable **Message Content Intent** in the Discord Developer Portal.
7. Start exactly one worker instance initially.

The root `index.js` is a small Node.js ES-module launcher for hosting panels. It starts the shared TypeScript runtime in `src/`; there is no second, separately maintained JavaScript bot implementation.

## Required environment variables

- `DISCORD_BOT_TOKEN` — token for the Voax Linking Discord bot.
- `SUPABASE_URL` — Voax Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role key (keep private).

Optional queue settings:

- `OUTBOX_POLL_MS` — queue polling interval (default 1200 ms).
- `OUTBOX_BATCH_SIZE` — jobs claimed per poll (default 10).
- `OUTBOX_MAX_ATTEMPTS` — attempts before a message-sync job is marked dead (default 12).
- `POLL_INTERVAL_MS` — welcome queue polling interval (default 1500 ms).
- `VOAX_PUBLIC_URL` — public Voax URL (default https://voax.app).
- `LOG_LEVEL` — debug, info, warn, or error.

Use `.env.example` as a reference for local development. Never upload a real `.env` file or expose the service-role key in frontend variables.

## Discord permissions and intents

Enable **Message Content Intent**. The unified bot uses Guilds, Guild Members, Guild Messages, and Message Content gateway intents. Enable Server Members Intent and Message Content Intent in the Discord Developer Portal.

The install link requests no guild-wide permissions. Grant the bot these permissions only in channels that should be linked: View Channel, Send Messages, Read Message History, Embed Links, Attach Files, Manage Webhooks, and Use External Stickers when using Discord welcome stickers. For strict isolation, deny the bot role View Channel in unlinked channels where `@everyone` otherwise grants visibility. Voax never changes Discord channel permissions automatically.

## Development and checks

```bash
cd BotLinking
npm install
cp .env.example .env
# Fill in the local secrets
npm run dev
```

```bash
npm run typecheck
npm test
npm run build
npm start
```

## Database and Vercel setup

Apply all SQL migrations in `supabase/migrations` in timestamp order before enabling the integration. The website OAuth API at `api/linking/oauth.ts` runs on Vercel and needs server-side `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_REDIRECT_URI`, and `VOAX_PUBLIC_URL`.

Set the redirect URI to `https://YOUR_VOAX_DOMAIN/api/linking/oauth?action=callback`. Keep the bot token, client secret, and Supabase service-role key out of browser-exposed environment variables.

## Runtime behavior

- Only newly created messages are imported; there is no historical channel backfill.
- Discord and Voax messages synchronize both ways, including supported edits and deletes.
- Discord Markdown is preserved as text for Voax's safe renderer; message attribution is `[Discord]` / `[Voax]`.
- Linked user mentions are translated where an identity connection exists; unlinked mentions remain readable.
- The persistent Supabase outbox provides idempotency, ordering, retries, and recovery.
- Bot/webhook-authored Discord messages are ignored to prevent loops.
- Attachments and supported embeds are relayed where accessible. External Discord URLs may expire; permanent mirroring is not guaranteed.
- Only standard Discord text/announcement channels and standard Voax text channels are supported in this phase.

## One worker only

Both message synchronization and welcome-event processing now run through one Discord Gateway client in this `BotLinking` folder. Upload this folder only; do not run a second copy of the old `LinkingBot` worker.
