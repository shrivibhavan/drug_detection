export interface TelegramAlertPayload {
  userMessage: string;
  confidence: "high" | "medium" | "low";
  sessionId: string;
  timestamp: string;
  userAgent?: string;
}

// Escape special Markdown characters to prevent Telegram API errors
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

export async function sendTelegramAlert(payload: TelegramAlertPayload): Promise<boolean> {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8923034215:AAF2ygzJRqbmrFsFUun5y0zHfhQzsIw_LM8";
  const CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || "2067857619";

  if (!BOT_TOKEN || !CHAT_ID) {
    console.error("Telegram credentials not configured");
    return false;
  }

  const confidenceEmoji = {
    high: "🔴",
    medium: "🟡",
    low: "🟢",
  }[payload.confidence];

  const safeMessage = escapeMarkdown(
    payload.userMessage.slice(0, 500) + (payload.userMessage.length > 500 ? "..." : "")
  );

  // Use plain text instead of Markdown to avoid parsing errors
  const message = [
    `🚨 DRUG ALERT 🚨`,
    `${confidenceEmoji} Confidence: ${payload.confidence.toUpperCase()}`,
    ``,
    `📝 Flagged Message:`,
    `"${payload.userMessage.slice(0, 500)}${payload.userMessage.length > 500 ? "..." : ""}"`,
    ``,
    `📋 Details:`,
    `• Sent by: ${payload.sessionId}`,
    `• Time: ${payload.timestamp}`,
    `• Platform: SafeReach Group Chat`,
    ``,
    `⚠️ Auto-flagged by SafeReach monitoring system.`,
  ].join("\n");

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text: message,
        }),
      }
    );

    const data = await res.json();

    if (!data.ok) {
      console.error("Telegram API error:", data);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Failed to send Telegram alert:", err);
    return false;
  }
}
