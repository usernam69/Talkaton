import { createHash } from "node:crypto";

const MAX_HISTORY_MESSAGES = 18;
const MAX_MEMORY_ITEMS = 8;
const MAX_ATTACHMENTS = 10;
const MAX_EXTRACTED_TEXT = 260_000;
const OPENROUTER_KEY_PATTERN = /^sk-or-v1-[A-Za-z0-9_-]{16,}$/;
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const SUPPORTED_MODELS = new Set([
  DEFAULT_MODEL,
  "openai/gpt-4.1-mini",
  "anthropic/claude-3-haiku",
  "google/gemini-2.5-flash-lite",
  "deepseek/deepseek-chat",
  "meta-llama/llama-3.1-8b-instruct",
  "mistralai/mistral-small-3.1-24b-instruct"
]);
const MODEL_ALIASES = new Map([
  ["google/gemini-pro", "google/gemini-2.5-flash-lite"]
]);

export default async function handler(req, res) {
  const requestId = getRequestId(req);
  const startedAt = Date.now();

  logInfo(requestId, "Request received", { method: req.method });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const abortController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abortController.abort();
  });

  try {
    const {
      message,
      model,
      mode,
      plan,
      timeZone,
      history = [],
      memory = [],
      attachments = []
    } = req.body || {};
    const apiKey = getValidatedOpenRouterApiKey(requestId);
    const openRouterHeaders = createOpenRouterHeaders(apiKey, req.headers.origin, requestId);

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required." });
    }

    const safeHistory = sanitizeHistory(history);
    const safeMemory = sanitizeMemory(memory);
    const safeAttachments = sanitizeAttachments(attachments);
    const userContent = createUserContent(message, safeAttachments);
    const hasPdf = safeAttachments.some(attachment => attachment.kind === "pdf");
    const selectedModel = resolveModel(model);
    const userTimeZone = resolveTimeZone(timeZone);
    const requestTime = new Date(startedAt);

    logInfo(requestId, "Sending OpenRouter request", {
      requestedModel: typeof model === "string" ? model : "",
      model: selectedModel,
      timeZone: userTimeZone,
      historyMessages: safeHistory.length,
      memoryItems: safeMemory.length,
      attachments: safeAttachments.length
    });

    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: openRouterHeaders,
      signal: abortController.signal,
      body: JSON.stringify({
        model: selectedModel,
        stream: true,
        messages: [
          {
            role: "system",
            content: createSystemPrompt(mode, plan, safeMemory, requestTime, userTimeZone)
          },
          ...safeHistory,
          {
            role: "user",
            content: userContent
          }
        ],
        ...(hasPdf ? {
          plugins: [{
            id: "file-parser",
            pdf: { engine: "cloudflare-ai" }
          }]
        } : {})
      })
    });

    logInfo(requestId, "OpenRouter response received", {
      status: upstream.status,
      ok: upstream.ok,
      contentType: upstream.headers.get("content-type") || "",
      openRouterRequestId: upstream.headers.get("x-request-id") || "",
      elapsedMs: Date.now() - startedAt
    });

    if (!upstream.ok) {
      const errorData = await readErrorBody(upstream);
      return res.status(upstream.status).json({
        error: errorData?.error?.message || errorData?.message || `Model request failed (${upstream.status}).`
      });
    }

    if (!upstream.body) {
      return res.status(502).json({ error: "The model returned an empty stream." });
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const reader = upstream.body.getReader();
    let streamedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      streamedBytes += value.byteLength;
      res.write(Buffer.from(value));
    }

    logInfo(requestId, "OpenRouter stream completed", {
      streamedBytes,
      elapsedMs: Date.now() - startedAt
    });
    res.end();
  } catch (error) {
    if (error?.name === "AbortError") {
      logInfo(requestId, "OpenRouter request aborted", {
        elapsedMs: Date.now() - startedAt
      });
      if (!res.writableEnded) res.end();
      return;
    }

    logError(requestId, "Chat request failed", error, {
      elapsedMs: Date.now() - startedAt,
      headersSent: res.headersSent
    });

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: { message: "The response stream was interrupted." } })}\n\n`);
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    if (error instanceof ChatConfigurationError) {
      return res.status(500).json({
        error: error.message,
        code: error.code,
        requestId
      });
    }

    return res.status(500).json({
      error: "Chat failed. Please try again.",
      requestId
    });
  }
}

class ChatConfigurationError extends Error {
  constructor(message, code, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "ChatConfigurationError";
    this.code = code;
  }
}

function getValidatedOpenRouterApiKey(requestId) {
  const rawKey = process.env.OPENROUTER_API_KEY;

  logInfo(requestId, "Validating OpenRouter API key", {
    configured: typeof rawKey === "string",
    valueType: typeof rawKey,
    rawLength: typeof rawKey === "string" ? rawKey.length : 0
  });

  if (typeof rawKey !== "string") {
    throw new ChatConfigurationError(
      "Missing OPENROUTER_API_KEY. Add it to your deployment environment variables.",
      "OPENROUTER_KEY_MISSING"
    );
  }

  const apiKey = rawKey.trim();
  if (!apiKey) {
    throw new ChatConfigurationError(
      "OPENROUTER_API_KEY is empty. Add a valid OpenRouter API key.",
      "OPENROUTER_KEY_EMPTY"
    );
  }

  if (/^Bearer(?:\s|$)/i.test(apiKey)) {
    throw new ChatConfigurationError(
      "OPENROUTER_API_KEY must contain only the key, without the Bearer prefix.",
      "OPENROUTER_KEY_HAS_BEARER_PREFIX"
    );
  }

  if (/[\u0000-\u001f\u007f]/.test(apiKey)) {
    throw new ChatConfigurationError(
      "OPENROUTER_API_KEY contains a line break or invalid control character.",
      "OPENROUTER_KEY_HAS_CONTROL_CHARACTERS"
    );
  }

  if (!OPENROUTER_KEY_PATTERN.test(apiKey)) {
    throw new ChatConfigurationError(
      "OPENROUTER_API_KEY is malformed. Expected a key beginning with sk-or-v1-.",
      "OPENROUTER_KEY_MALFORMED"
    );
  }

  logInfo(requestId, "OpenRouter API key validated", {
    normalizedWhitespace: apiKey.length !== rawKey.length,
    normalizedLength: apiKey.length,
    prefixValid: true,
    keyFingerprint: fingerprintSecret(apiKey)
  });

  return apiKey;
}

function createOpenRouterHeaders(apiKey, origin, requestId) {
  const authorizationValue = `Bearer ${apiKey}`;
  if (!/^[\x20-\x7e]+$/.test(authorizationValue)) {
    throw new ChatConfigurationError(
      "The OpenRouter Authorization header contains invalid characters.",
      "OPENROUTER_AUTHORIZATION_INVALID"
    );
  }

  const headers = new Headers();
  try {
    headers.set("Authorization", authorizationValue);
    headers.set("Content-Type", "application/json");
    headers.set("HTTP-Referer", getSafeReferer(origin));
    headers.set("X-Title", "Talkaton");
  } catch (error) {
    throw new ChatConfigurationError(
      "Failed to create valid OpenRouter request headers.",
      "OPENROUTER_HEADERS_INVALID",
      error
    );
  }

  logInfo(requestId, "OpenRouter Authorization header created", {
    scheme: "Bearer",
    headerLength: authorizationValue.length,
    headersInstance: "request-local"
  });

  return headers;
}

function getSafeReferer(origin) {
  if (typeof origin !== "string") return "https://talkaton.org";
  try {
    const url = new URL(origin);
    if (url.protocol === "https:" || url.hostname === "localhost") return url.origin;
  } catch {}
  return "https://talkaton.org";
}

function resolveModel(requestedModel) {
  if (typeof requestedModel !== "string") return DEFAULT_MODEL;
  const normalized = requestedModel.trim();
  const resolved = MODEL_ALIASES.get(normalized) || normalized;
  return SUPPORTED_MODELS.has(resolved) ? resolved : DEFAULT_MODEL;
}

function getRequestId(req) {
  const vercelId = req.headers?.["x-vercel-id"];
  if (typeof vercelId === "string" && vercelId) return vercelId;
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function fingerprintSecret(secret) {
  return createHash("sha256").update(secret).digest("hex").slice(0, 12);
}

function logInfo(requestId, event, details = {}) {
  console.info(`[api/chat][${requestId}] ${event}`, details);
}

function logError(requestId, event, error, details = {}) {
  console.error(
    `[api/chat][${requestId}] ${event}`,
    details,
    error?.stack || error
  );
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(item => item && ["user", "assistant"].includes(item.role) && typeof item.content === "string")
    .slice(-MAX_HISTORY_MESSAGES)
    .map(({ role, content }) => ({ role, content: content.slice(0, MAX_EXTRACTED_TEXT) }));
}

function sanitizeMemory(memory) {
  if (!Array.isArray(memory)) return [];
  return memory
    .slice(-MAX_MEMORY_ITEMS)
    .map(item => {
      if (typeof item === "string") return item.slice(0, 8_000);
      if (!item || typeof item !== "object") return "";
      return `User: ${String(item.user || "").slice(0, 4_000)}\nTalkaton: ${String(item.ai || "").slice(0, 4_000)}`;
    })
    .filter(Boolean);
}

function sanitizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.slice(0, MAX_ATTACHMENTS).map(attachment => ({
    name: String(attachment?.name || "attachment").slice(0, 180),
    type: String(attachment?.type || "application/octet-stream").slice(0, 120),
    kind: String(attachment?.kind || "file").slice(0, 32),
    dataUrl: typeof attachment?.dataUrl === "string" && attachment.dataUrl.startsWith("data:")
      ? attachment.dataUrl
      : "",
    extractedText: typeof attachment?.extractedText === "string"
      ? attachment.extractedText.slice(0, MAX_EXTRACTED_TEXT)
      : ""
  }));
}

function createUserContent(message, attachments) {
  if (!attachments.length) return message;

  const content = [{ type: "text", text: message }];

  for (const attachment of attachments) {
    if (attachment.kind === "image" && attachment.dataUrl) {
      content.push({
        type: "image_url",
        image_url: { url: attachment.dataUrl }
      });
      continue;
    }

    if (attachment.kind === "pdf" && attachment.dataUrl) {
      content.push({
        type: "file",
        file: {
          filename: attachment.name,
          file_data: attachment.dataUrl
        }
      });
      continue;
    }

    if (attachment.kind === "document" && attachment.dataUrl) {
      content.push({
        type: "file",
        file: {
          filename: attachment.name,
          file_data: attachment.dataUrl
        }
      });
      if (attachment.extractedText) {
        content.push({
          type: "text",
          text: `\n\nAttached file: ${attachment.name}. Use the attached document as context.`
        });
      }
      continue;
    }

    if (attachment.kind === "folder" && attachment.extractedText) {
      content.push({
        type: "text",
        text: `\n\n--- Attached folder: ${attachment.name} ---\n${attachment.extractedText}`
      });
      continue;
    }

    if (attachment.extractedText) {
      content.push({
        type: "text",
        text: `\n\n--- Attached file: ${attachment.name} (${attachment.type}) ---\n${attachment.extractedText}`
      });
      continue;
    }

    if (attachment.dataUrl) {
      content.push({
        type: "file",
        file: {
          filename: attachment.name,
          file_data: attachment.dataUrl
        }
      });
    }
  }

  return content;
}

function createSystemPrompt(mode, plan, memory, requestTime, timeZone) {
  const localDate = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeZone
  }).format(requestTime);
  const localTime = new Intl.DateTimeFormat("en-US", {
    timeStyle: "long",
    timeZone
  }).format(requestTime);

  return `You are Talkaton.

Product identity:
- Talkaton (talkaton.org) is a standalone, multi-model Web AI Dashboard.
- It aggregates AI models including GPT, Claude, Gemini, and DeepSeek.
- Its product features include Chaos Mode and memory dashboards.
- Never confuse Talkaton with "Talkatone," the unrelated VoIP calling app.
- Never describe Talkaton as a calling, phone, texting, or VoIP service.

Personality:
- smart
- funny
- helpful
- slightly chaotic
- witty but not corny

Be helpful first. Funny second.
Use Markdown when it makes the answer clearer. Use fenced code blocks with language names. Use LaTeX delimiters for math.

Capabilities:
- You have access to web search results when provided in the user's message (marked with "[Web search results for ...]").
- When search results are provided, summarize them naturally. Do not mention that results were "provided" — just answer as if you looked it up.
- You have access to generated images when provided (marked with "[Image generated for ...]"). Describe the image naturally and reference it in your response.

Current time:
- User timezone: ${timeZone}
- User local date: ${localDate}
- User local time: ${localTime}
- UTC timestamp: ${requestTime.toISOString()}
- Treat this request timestamp as the authoritative current moment. Interpret relative dates such as today, tomorrow, and yesterday in the user's timezone.
- Knowing the current time does not guarantee knowledge of events that happened after your training data. Be honest when live information would require search.

Current mode: ${mode || "Normal"}.
Current plan: ${plan === "dev" ? "dev (unlimited access to all features and models)" : plan === "free" ? "free (standard access with limited models)" : "guest (limited access, GPT-5.4 Nano only)"}.
${memory.length ? `Useful memory:\n${memory.join("\n\n")}` : ""}`;
}

function resolveTimeZone(timeZone) {
  if (typeof timeZone !== "string" || timeZone.length > 100) return "UTC";
  const normalized = timeZone.trim();
  if (!normalized) return "UTC";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format();
    return normalized;
  } catch {
    return "UTC";
  }
}

async function readErrorBody(response) {
  try {
    return await response.json();
  } catch {
    return { message: await response.text().catch(() => "") };
  }
}
