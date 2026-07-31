# Discord Stream Schedule Builder

A compact private tool for turning stream times entered in Pacific time into Discord's viewer-local timestamp syntax. The editor, preview, template storage, and copy button work as a static GitHub Pages site. An optional Node server adds webhook posting without exposing the webhook URL to the browser.

## Prerequisites

- Node.js 20 or newer
- npm (included with Node)

There are no third-party runtime dependencies.

## Install and run locally

```sh
cd "Web Tools/Discord Scheduler"
npm install
npm start
```

Open `http://127.0.0.1:4173`. For automatic server restarts during development, use `npm run dev`.

## Test and build

```sh
npm test
npm run build
```

The build creates the static GitHub Pages artifact in `dist/`. The included GitHub Actions workflow tests, builds, and deploys the site when the repository's `main` branch is pushed.

The Pages copy is static, so its **Post to Discord** button remains disabled; copy-to-clipboard still works normally.

## Optional Discord webhook

Set the environment variable only on the trusted machine or Node host running the server:

```sh
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
npm start
```

The server sends the generated text as normal Discord message content. It allows `@everyone` mentions only when that option is selected. Discord channel permissions still control whether the mention notifies anyone.

**Security:** Never share, paste into client-side code, log, or commit a webhook URL. Treat it like a password. Keep it in `DISCORD_WEBHOOK_URL`; `.env` files are ignored, and `.env.example` contains only a placeholder. This zero-dependency server does not automatically load `.env` files.

## How Discord timestamps work

Discord renders `<t:UNIX_TIMESTAMP:t>` using each viewer's local timezone. This app interprets entered wall times in `America/Los_Angeles`, automatically applying PST or PDT, then converts them to Unix seconds. For example, July 31, 2026 at 9:00 AM Pacific becomes `<t:1785513600:t>`.

During the spring daylight-saving gap, nonexistent times such as 2:30 AM are rejected. During the repeated fall-back hour, the first occurrence is used.

## Local templates and limits

Templates are saved only in the browser's local storage on the current device. The selected date is not saved, so loading a template always targets tomorrow. Limits are 20 schedule rows, 100 characters per event, 240 characters for the announcement, and Discord's 2,000-character message maximum.

There is no authentication in this version. The public Pages URL is accessible to anyone who knows or discovers it, but schedules and templates remain in each browser's local storage and are never uploaded.
