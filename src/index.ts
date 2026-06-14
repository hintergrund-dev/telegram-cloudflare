export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel" | string;
  title?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

export interface TelegramAgentRequest {
  chatId: number;
  userId?: number;
  username?: string;
  sessionId: string;
  text: string;
  update: TelegramUpdate;
}

export interface TelegramAgentResponse {
  text: string;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
}

export interface TelegramWebhookOptions<Env> {
  botToken: (env: Env) => string;
  secretToken?: (env: Env) => string | undefined;
  sessionId?: (message: TelegramMessage) => string;
  handleMessage: (request: TelegramAgentRequest, env: Env, ctx: ExecutionContext) => Promise<TelegramAgentResponse | string | undefined>;
}

export function createTelegramWebhookHandler<Env>(options: TelegramWebhookOptions<Env>) {
  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      if (request.method !== "POST") return new Response("method not allowed", { status: 405 });

      const expectedSecret = options.secretToken?.(env);
      if (expectedSecret) {
        const got = request.headers.get("x-telegram-bot-api-secret-token");
        if (got !== expectedSecret) return new Response("unauthorized", { status: 401 });
      }

      const update = await request.json() as TelegramUpdate;
      const message = update.message || update.edited_message;
      const text = message?.text || message?.caption;
      if (!message || !text?.trim()) return Response.json({ ok: true, ignored: true });

      ctx.waitUntil(processTelegramMessage(options, env, ctx, update, message, text.trim()));
      return Response.json({ ok: true });
    },
  };
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  options: { parseMode?: "Markdown" | "MarkdownV2" | "HTML"; replyToMessageId?: number } = {},
): Promise<TelegramApiResponse<TelegramMessage>> {
  return telegramApi<TelegramMessage>(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode,
    reply_to_message_id: options.replyToMessageId,
    disable_web_page_preview: true,
  });
}

export async function sendTelegramChatAction(
  botToken: string,
  chatId: number,
  action: "typing" | "upload_photo" | "upload_document" = "typing",
): Promise<TelegramApiResponse<boolean>> {
  return telegramApi<boolean>(botToken, "sendChatAction", { chat_id: chatId, action });
}

async function processTelegramMessage<Env>(
  options: TelegramWebhookOptions<Env>,
  env: Env,
  ctx: ExecutionContext,
  update: TelegramUpdate,
  message: TelegramMessage,
  text: string,
): Promise<void> {
  const botToken = options.botToken(env);
  await sendTelegramChatAction(botToken, message.chat.id);

  const result = await options.handleMessage({
    chatId: message.chat.id,
    userId: message.from?.id,
    username: message.from?.username,
    sessionId: options.sessionId?.(message) || `telegram:${message.chat.id}`,
    text,
    update,
  }, env, ctx);

  if (!result) return;
  if (typeof result === "string") {
    await sendTelegramMessage(botToken, message.chat.id, result, { replyToMessageId: message.message_id });
    return;
  }
  await sendTelegramMessage(botToken, message.chat.id, result.text, {
    parseMode: result.parseMode,
    replyToMessageId: message.message_id,
  });
}

async function telegramApi<T>(botToken: string, method: string, body: Record<string, unknown>): Promise<TelegramApiResponse<T>> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<TelegramApiResponse<T>>;
}
