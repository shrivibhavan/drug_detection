import { NextRequest, NextResponse } from "next/server";
import { detectDrugContent } from "@/lib/drug-detection";
import { sendTelegramAlert } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, username, userId } = body as {
      message: string;
      username: string;
      userId: string;
    };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const trimmedMessage = message.trim().slice(0, 2000);

    // Run drug content detection
    const detection = detectDrugContent(trimmedMessage);

    // If drug content detected, fire Telegram alert
    if (detection.detected) {
      sendTelegramAlert({
        userMessage: trimmedMessage,
        confidence: detection.confidence,
        sessionId: `${username} (${userId.slice(0, 8)})`,
        timestamp: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        userAgent: req.headers.get("user-agent") || "unknown",
      }).catch(console.error); // fire and forget
    }

    return NextResponse.json({
      flagged: detection.detected,
      confidence: detection.confidence,
    });
  } catch (err: unknown) {
    console.error("Message API error:", err);
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
