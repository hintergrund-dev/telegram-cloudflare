import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import { createTelegramWebhookHandler } from "../../../src/index";

interface Env {
  MESSAGES: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
}

interface StoredMessage {
  id: string;
  text: string;
  received_at: string;
}

const MESSAGE_TTL_SECONDS = 60 * 60;
const profanityMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

const telegram = createTelegramWebhookHandler<Env>({
  botToken: (env) => env.TELEGRAM_BOT_TOKEN,
  secretToken: (env) => env.TELEGRAM_WEBHOOK_SECRET,
  async handleMessage(message, env) {
    const telegramMessage = message.update.message || message.update.edited_message;
    if (!telegramMessage) return undefined;

    if (message.text.length > 500) {
      return "Please keep messages under 500 characters.";
    }

    if (profanityMatcher.hasMatch(message.text)) {
      return "That message was not added to the board.";
    }

    const receivedAt = new Date().toISOString();
    const id = `${Date.now()}-${crypto.randomUUID()}`;
    const storedMessage: StoredMessage = {
      id,
      text: message.text,
      received_at: receivedAt,
    };

    await env.MESSAGES.put(`message:${id}`, JSON.stringify(storedMessage), {
      expirationTtl: MESSAGE_TTL_SECONDS,
    });

    return "Thanks, your message was received and added to the board.";
  },
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/telegram") {
      return telegram.fetch(request, env, ctx);
    }

    if (request.method === "GET" && url.pathname === "/api/messages") {
      const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
      const list = await env.MESSAGES.list({ prefix: "message:", limit });
      const messages = await Promise.all(
        list.keys.map(async (key) => {
          const value = await env.MESSAGES.get(key.name, "json");
          return value as StoredMessage | null;
        }),
      );
      return Response.json({
        messages: messages
          .filter((message): message is StoredMessage => message !== null)
          .sort((a, b) => b.id.localeCompare(a.id))
          .slice(0, limit),
      });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(renderHtml(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("not found", { status: 404 });
  },
};

function renderHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Telegram Message Board</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #fafafa; color: #111; }
    main { max-width: 720px; margin: 0 auto; padding: 48px 20px; }
    header { margin-bottom: 32px; }
    h1 { margin: 0 0 8px; font-size: 40px; line-height: 1; letter-spacing: -0.04em; font-weight: 500; }
    p { margin: 0; color: #555; }
    nav { margin-top: 18px; }
    a { color: #111; }
    button { border: 1px solid #ccc; background: #fff; color: #111; padding: 7px 10px; cursor: pointer; }
    button:hover { background: #f2f2f2; }
    ul { list-style: none; padding: 0; margin: 24px 0 0; border-top: 1px solid #ddd; }
    li { padding: 16px 0; border-bottom: 1px solid #ddd; }
    .meta { color: #666; font-size: 13px; margin-bottom: 6px; }
    .text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 18px; }
    .empty { color: #666; padding: 24px 0; border-top: 1px solid #ddd; }
    footer { display: flex; justify-content: center; margin-top: 40px; }
    footer a { display: inline-flex; color: #111; opacity: 0.65; }
    footer a:hover { opacity: 1; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Telegram Message Board</h1>
      <p>A minimal Cloudflare Worker that gets invoked by Telegram messages and replies to them.</p>
      <nav>
        <button id="refresh">Refresh</button>
      </nav>
    </header>

    <div id="status">Loading messages…</div>
    <ul id="messages"></ul>
    <footer>
      <a href="https://github.com/hintergrund-dev/telegram-cloudflare" target="_blank" rel="noopener" aria-label="GitHub repository">
        <svg height="24" viewBox="0 0 16 16" width="24" aria-hidden="true">
          <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.65 7.65 0 0 1 8 3.87c.68 0 1.36.09 2 .26 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
      </a>
    </footer>
  </main>

  <script>
    const status = document.getElementById('status');
    const list = document.getElementById('messages');
    const refresh = document.getElementById('refresh');

    function escapeHtml(value) {
      return value.replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));
    }

    async function load() {
      status.textContent = 'Loading messages…';
      const response = await fetch('/api/messages?limit=50', { cache: 'no-store' });
      const data = await response.json();
      const messages = data.messages || [];
      list.innerHTML = '';
      if (messages.length === 0) {
        status.innerHTML = '<div class="empty">No Telegram messages received yet.</div>';
        return;
      }
      status.textContent = '';
      for (const message of messages) {
        const item = document.createElement('li');
        item.innerHTML = '<div class="meta">' + escapeHtml(message.received_at) + '</div>' +
          '<div class="text">' + escapeHtml(message.text) + '</div>';
        list.appendChild(item);
      }
    }

    refresh.addEventListener('click', load);
    load();
  </script>
</body>
</html>`;
}
