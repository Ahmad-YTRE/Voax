# Voax Linking Bot

This is the always-on Discord Gateway worker for the two-way Discord ↔ Voax channel integration. It handles member-join events, synchronized welcome cards, welcome-sticker button interactions, and the durable Supabase welcome queues.

## Requirements

- Node.js 20 or newer
- A Discord application with a bot user
- The bot installed in each linked Discord server
- The **Server Members Intent** enabled in the Discord Developer Portal
- The Voax Supabase project's service-role key

## Configure

Copy `.env.example` to `.env` and set:

- `DISCORD_BOT_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Use the same bot token configured for the Voax Vercel API's `DISCORD_BOT_TOKEN`. Never put the service-role key or bot token in a `VITE_*` variable, browser code, or a public repository.

## Install and run

```sh
npm install
npm start
```

Run this process on an always-on Node host (for example, a small worker service). Vercel serverless functions are not suitable for a persistent Discord Gateway connection.

## Discord permissions

Grant the bot only the permissions it needs in the channel being linked:

- View Channel
- Send Messages
- Read Message History
- Embed Links
- Use External Stickers (when using Discord stickers)

Enable **Server Members Intent** under the Discord application's Bot settings. The bot does not need Message Content Intent for join events or its own welcome-sticker buttons.

## Welcome stickers

Each channel link stores two independent sticker choices:

- A Discord sticker ID, selected from a sticker available to the Discord bot in that guild.
- A publicly reachable HTTPS image/GIF URL for the corresponding Voax sticker.

The welcome button is enabled only when both are configured. A click on either platform creates one idempotent action, then the worker posts the configured Discord sticker as a reply and mirrors the sticker reply into Voax. The join origin is retained as Discord or Voax.

The worker processes the durable `discord_welcome_events` and `discord_welcome_actions` queues. Failed work is retried with backoff; exhausted jobs remain visible as dead-letter rows for diagnosis.
