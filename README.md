# Voax

**A lightweight place to chat, chill, and have fun.**

Voax is a real-time chat platform for friends, gaming groups, and online communities. Chat privately, organize communities with servers and channels, and personalize the way you connect.

- **Live app:** https://voax.vercel.app
- **User guide:** https://voax.vercel.app/docs
- **Repository:** https://github.com/Ahmad-YTRE/Voax
- **Upstream project:** https://github.com/Shahadah-Studs/Voax

## Features

### Communication
- **Direct messages** — Have private conversations with friends.
- **Servers and channels** — Organize communities and topic-based conversations.
- **Real-time updates** — Keep messages and presence up to date with Supabase Realtime.
- **Message tools** — Reply to messages, edit your own messages, delete messages when permitted, and copy message text.
- **Reactions and attachments** — React with emoji and share supported files.
- **Link previews** — Display rich previews for supported websites.

### Communities
- **Friends** — Send and manage friend requests, start DMs, and remove friends.
- **Profiles and presence** — Customize your profile and share your availability status.
- **Custom server roles** — Create roles, assign them to members, and configure permissions.
- **Role hierarchy** — Restrict role and member management to actors with sufficient authority; the server creator retains top-level authority.
- **Invites** — Share invite links and codes to help people join servers.
- **Channel access controls** — Manage access to channels through available permissions.

### Personalization and safety
- **Notifications** — Configure notification preferences and server/channel overrides.
- **Appearance** — Choose supported themes and a 12-hour or 24-hour clock.
- **Account safety** — Block accounts, mute member alerts, and report accounts, messages, or servers.
- **Progressive Web App** — Install Voax on supported desktop and mobile browsers.
- **Responsive interface** — Use Voax across different screen sizes.
- **Documentation** — Read the in-app guide at [voax.vercel.app/docs](https://voax.vercel.app/docs).

> Available actions depend on the current app version, the selected space, and your account's permissions.

## Tech stack

| Technology | Purpose |
| --- | --- |
| [React](https://react.dev/) | Component-based user interface |
| [TypeScript](https://www.typescriptlang.org/) | Type-safe application code |
| [Vite](https://vite.dev/) | Development server and production build |
| [Supabase](https://supabase.com/) | PostgreSQL database, authentication, realtime features, and storage |
| [Supabase JavaScript client](https://supabase.com/docs/reference/javascript/introduction) | Client-side communication with Supabase |
| [Vercel](https://vercel.com/) | Hosting and deployments |

## Getting started

### Requirements

- Node.js
- npm
- A Supabase project configured with the database schema and services required by the application

### Install dependencies

```bash
npm install
```

### Configure environment variables

Create a `.env` file in the project root and configure:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

Use your own Supabase project values. The publishable key is intended for client-side use; never put a Supabase service-role key, database password, or other server secret in a Vite `VITE_*` variable or commit it to the repository. Review the project's Supabase setup and migrations so your database has the schema and policies expected by the app.

### Run locally

```bash
npm run dev
```

### Build and preview

```bash
npm run build
npm run preview
```

The production build runs the TypeScript project build before Vite creates the deployable assets.

## Deployment

Voax is configured for Vercel. Connect the repository and configure the Supabase environment variables in the Vercel project settings for each required environment. Production deployments are created from the configured production branch.

## Contributing and bug reports

Found a bug or have an idea? [Open an issue in this repository](https://github.com/Ahmad-YTRE/Voax/issues) with clear steps to reproduce it and any relevant details. Do not include passwords, access tokens, private invite links, or other secrets.

---

Made for friends, teams, and communities. **Chat. Chill. Have Fun.**

**© Shahadah Studios Elite and BloxdLabs**


## Voax Linking worker

The unified Discord Gateway worker for two-way channel synchronization, member welcomes, and welcome-sticker replies lives in [`BotLinking/`](./BotLinking/README.md). It runs as an always-on Node.js service and must be configured with `DISCORD_BOT_TOKEN`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Enable the Discord Server Members Intent and grant the bot the required permissions in each linked channel. See the worker README for setup details.
