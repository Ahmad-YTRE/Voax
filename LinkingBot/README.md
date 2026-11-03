# Voax Linking Bot

A separately deployed Discord Gateway worker for Voax two-way channel bridge. All bot source lives in this folder. The Vercel website and worker deploy independently.

## Prerequisites
- Node.js 20.11+ (Node 22 recommended)
- A Discord application and bot owned by the Voax operator
- The Voax Linking Supabase migrations applied
- A persistent Node worker host (Docker, Fly.io, Railway, Render background worker, or a VM)

## Discord Developer Portal
1. Create an application named **Voax Linking**.
2. Under **Bot**, create/reset the bot token and store it as DISCORD_BOT_TOKEN in the worker secret manager.
3. Enable **Message Content Intent**. Do not enable Server Members or Presence intents.
4. Configure the OAuth2 redirect URI exactly as https://YOUR_VOAX_DOMAIN/api/linking/oauth?action=callback.
5. The install flow requests identify and guilds for the installing administrator, then asks Discord to install the bot in the selected guild with bot and applications.commands scopes.
6. Requested bot permissions: View Channels, Send Messages, Read Message History, Embed Links, Attach Files, and Manage Webhooks. Administrator is not requested.
7. Grant these permissions only in channels that will be linked. For private channels, explicitly grant the bot access before linking. Do not change member permissions automatically.
8. Gateway intents used: Guilds, Guild Messages, and Message Content.

## Environment variables
### Discord worker (LinkingBot/.env)
Copy .env.example to .env and set DISCORD_BOT_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and VOAX_PUBLIC_URL. Optional queue tuning: OUTBOX_POLL_MS, OUTBOX_BATCH_SIZE, OUTBOX_MAX_ATTEMPTS, LOG_LEVEL.

### Vercel API (server-side environment only)
Configure these in Vercel project settings. Do not prefix secrets with VITE_: SUPABASE_URL, SUPABASE_ANON_KEY (or existing VITE_SUPABASE_PUBLISHABLE_KEY), SUPABASE_SERVICE_ROLE_KEY, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, DISCORD_REDIRECT_URI, and VOAX_PUBLIC_URL.
Set DISCORD_REDIRECT_URI to https://YOUR_VOAX_DOMAIN/api/linking/oauth?action=callback.

The service-role key, bot token, and client secret must never be exposed to the browser or committed. Never place them in frontend environment variables.

## Run locally

    cd LinkingBot
    npm install
    cp .env.example .env
    # Fill in the secrets above
    npm run dev

Production build: npm run build; then npm start.

## Deploy the bot independently
Deploy LinkingBot as a persistent Node 22 service using the included Dockerfile, or set the working directory to LinkingBot on your worker host. Configure environment variables in the host secret manager. Keep one active worker initially. Vercel does not host the Discord Gateway process.

## Database setup
Apply the migrations in supabase/migrations in timestamp order before enabling the integration. The integration uses discord_integrations and discord_channel_links for guild/channel configuration; discord_user_connections for verified identities; discord_message_mappings for cross-platform idempotency; discord_sync_outbox for durable jobs; and discord_oauth_states for short-lived hashed OAuth state.

The queue and webhook credentials are service-role-only. Never expose the service-role key. The migration adds a message trigger that queues Voax-originated events but deliberately does not import existing history.

## Phase 1 boundaries
Only standard Discord text and announcement channels can be linked to standard Voax text channels. Voice, stage, forum, ticket, and other specialized channels are not supported. Channels are never auto-created. Disconnecting a link stops new synchronization and preserves existing messages/mappings.

## Operational behavior
- Bot/webhook-authored Discord messages are ignored to prevent loops.
- Voax-originated posts use a bot-owned channel webhook with the Voax username, avatar, and [Voax] suffix; they are not Discord-user impersonation.
- Discord-originated posts carry original Discord identity metadata and [Discord] attribution in Voax. Linked user accounts translate to Voax member mentions when the target belongs to the linked server; unlinked users, role mentions, and channel mentions remain readable text.
- Outbox retries use persistent Supabase state and exponential backoff. Repeated failures move jobs to dead and mark the channel link degraded.
- Attachment URLs are relayed where accessible; unsupported files or expired external URLs may not be retained indefinitely.
- Message content is never rendered as raw HTML by the bridge. The current bridge preserves Markdown source text, but the full Discord-specific Markdown renderer and rich-embed parity are not yet complete.

## Tests
Run npm test from LinkingBot.