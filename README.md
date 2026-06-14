# @hintergrund/telegram-cloudflare

Telegram webhook helpers for Cloudflare Workers. The package is intentionally small and designed to connect a Telegram bot to a Worker handler, including `@hintergrund/serverless-pi`.

A minimal live example is included in [`example/`](example/) and runs at https://telegram-cloudflare.hintergrund.dev.

## Usage with serverless-pi

```ts
import { createTelegramWebhookHandler } from "@hintergrund/telegram-cloudflare";
import { createServerlessPi } from "@hintergrund/serverless-pi";
import { D1SessionStore } from "@hintergrund/serverless-pi/cloudflare";

interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ANTHROPIC_API_KEY: string;
}

export default createTelegramWebhookHandler<Env>({
  botToken: (env) => env.TELEGRAM_BOT_TOKEN,
  secretToken: (env) => env.TELEGRAM_WEBHOOK_SECRET,
  async handleMessage(message, env) {
    const pi = createServerlessPi({
      store: new D1SessionStore(env.DB),
      systemPrompt: "You are a concise Telegram assistant.",
      model: { provider: "anthropic", model: "claude-sonnet-4-6", thinkingLevel: "medium" },
      getApiKey: (provider) => provider === "anthropic" ? env.ANTHROPIC_API_KEY : undefined,
    });

    const result = await pi.chat({ sessionId: message.sessionId, message: message.text });
    return result.text || "Done.";
  },
});
```

Set the webhook with Telegram's `secret_token` so the Worker can verify `x-telegram-bot-api-secret-token`.
