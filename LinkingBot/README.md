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

When deploying from the GitHub repository, set the service root directory to `/LinkingBot`, the build command to `npm install`, and the start command to `npm start`. Run this process on an always-on Node host (for example, Railway). Vercel serverless functions are not suitable for a persistent Discord Gateway connection.

## Discord permissions

Grant the bot only the permissions it needs in the channel being linked:

- View Channel
- Send Messages
- Read Message History
- Embed Links
- Use External Stickers (when using Discord stickers)

Enable **Server Members Intent** under the Discord application's Bot settings. The worker also subscribes to the standard Guild Messages intent so it can detect Discord's native join system messages and the sticker replies created by Discord's built-in welcome button. It does not need Message Content Intent.

## Welcome stickers

Each channel link stores two independent sticker choices:

- A Discord sticker ID, selected from a sticker available to the Discord bot in that guild.
- A publicly reachable HTTPS image/GIF URL for the corresponding Voax sticker.

The Voax-side welcome button is enabled when both are configured. If the linked Discord channel is also the server's system welcome channel, the worker reuses Discord's native join message and captures the sticker reply created by Discord's built-in welcome button. Otherwise it posts its own Discord welcome card and button. A click on Voax or either Discord button is synchronized as one idempotent reply. The join origin is retained as Discord or Voax.

The worker processes the durable `discord_welcome_events` and `discord_welcome_actions` queues. Failed work is retried with backoff; exhausted jobs remain visible as dead-letter rows for diagnosis.
