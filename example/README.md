# Telegram Message Board Worker

A self-contained Cloudflare Worker example for `@hintergrund/telegram-cloudflare`.

It receives Telegram webhook messages at `/telegram`, filters profanity, stores accepted messages in KV for one hour, replies to Telegram, and renders the latest messages as HTML at `https://telegram-cloudflare.hintergrund.dev/`.

## Local secrets

Local development uses `.dev.vars`:

```txt
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
```

`.dev.vars` is gitignored. Keep `.dev.vars.example` committed as the template.

## Cloudflare secrets

Deploy the bot token and webhook secret to Cloudflare with Wrangler:

```sh
cd packages/telegram-cloudflare/example
printf '%s' '<telegram-bot-token>' | pnpm wrangler secret put TELEGRAM_BOT_TOKEN
printf '%s' '<random-webhook-secret>' | pnpm wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

## KV

Create the KV namespace and update `wrangler.jsonc` with the real namespace `id`:

```sh
pnpm wrangler kv namespace create MESSAGES
```

Messages are stored with a one-hour expiration. The public page only shows message text and timestamp; Telegram usernames are not stored or printed.

Profanity filtering is handled by [`obscenity`](https://www.npmjs.com/package/obscenity). Rejected messages are not stored.

## Deploy

```sh
pnpm deploy
```

The Worker is configured for the custom domain:

```txt
telegram-cloudflare.hintergrund.dev
```

## Telegram webhook

After deploy, configure Telegram to send updates to the Worker:

```sh
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -F "url=https://telegram-cloudflare.hintergrund.dev/telegram" \
  -F "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```
