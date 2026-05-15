"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase, Message, Profile } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { RealtimePostgresInsertPayload } from "@supabase/supabase-js";

interface MessageWithProfile extends Message {
  profiles: Profile;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function MessageBubble({
  msg,
  isOwn,
  showAvatar,
}: {
  msg: MessageWithProfile;
  isOwn: boolean;
  showAvatar: boolean;
}) {
  const profile = msg.profiles;
  return (
    <div
      className={`msg-row ${isOwn ? "msg-row-own" : "msg-row-other"}`}
      style={{ animation: "fadeSlideUp 0.3s ease forwards" }}
    >
      {!isOwn && showAvatar && (
        <div
          className="msg-avatar"
          style={{ background: profile?.avatar_color || "#00c896" }}
          title={profile?.username || "User"}
        >
          {getInitials(profile?.username || "?")}
        </div>
      )}
      {!isOwn && !showAvatar && <div className="msg-avatar-spacer" />}
      <div className={`msg-bubble ${isOwn ? "msg-bubble-own" : "msg-bubble-other"}`}>
        {!isOwn && showAvatar && (
          <span
            className="msg-sender"
            style={{ color: profile?.avatar_color || "#00c896" }}
          >
            {profile?.username || "Unknown"}
          </span>
        )}
        <p className="msg-text">{msg.content}</p>
        <span className="msg-time">{formatTime(msg.created_at)}</span>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="typing-wrapper">
      <div className="typing-bubble">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="typing-dot"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const router = useRouter();
  const [messages, setMessages] = useState<MessageWithProfile[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Profile[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Cache profiles in a ref to avoid re-fetching
  const profileCacheRef = useRef<Map<string, Profile>>(new Map());

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      window.location.href = "/login";
    }
  }, [authLoading, user]);

  // Load initial messages (once)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*, profiles(*)")
        .order("created_at", { ascending: true })
        .limit(50);

      if (!cancelled && data) {
        // Cache all profiles from initial load
        (data as MessageWithProfile[]).forEach((msg) => {
          if (msg.profiles) {
            profileCacheRef.current.set(msg.user_id, msg.profiles);
          }
        });
        setMessages(data as MessageWithProfile[]);
      }
      if (!cancelled) setLoadingMessages(false);
    };

    loadMessages();
    return () => { cancelled = true; };
  }, [user]);

  // Subscribe to real-time messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload: RealtimePostgresInsertPayload<Message>) => {
          const newMsg = payload.new;

          // Try to get profile from cache first (no DB call!)
          let cachedProfile = profileCacheRef.current.get(newMsg.user_id);

          if (!cachedProfile) {
            // Only fetch if not in cache
            const { data } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", newMsg.user_id)
              .single();
            if (data) {
              cachedProfile = data;
              profileCacheRef.current.set(newMsg.user_id, data);
            }
          }

          const messageWithProfile: MessageWithProfile = {
            ...newMsg,
            profiles: cachedProfile || {
              id: newMsg.user_id,
              username: "Unknown",
              avatar_color: "#00c896",
              created_at: "",
            },
          };

          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Keep only last 100 messages to prevent memory buildup
            const updated = [...prev, messageWithProfile];
            return updated.length > 100 ? updated.slice(-100) : updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Track online presence
  useEffect(() => {
    if (!user || !profile) return;

    const channel = supabase.channel("online-users", {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        const users: Profile[] = [];
        Object.values(presenceState).forEach((presences: unknown) => {
          const arr = presences as Array<{ profile: Profile }>;
          if (arr[0]?.profile) {
            users.push(arr[0].profile);
          }
        });
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ profile });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, profile]);

  // Auto-scroll only on new messages (debounced)
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || !user || !profile || sending) return;

    setInput("");
    setSending(true);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    // Optimistic update — show message instantly before DB confirms
    const optimisticMsg: MessageWithProfile = {
      id: `temp-${Date.now()}`,
      user_id: user.id,
      content: text,
      flagged: false,
      created_at: new Date().toISOString(),
      profiles: profile,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      // Insert message into Supabase
      const { data: insertedMsg } = await supabase
        .from("messages")
        .insert({ user_id: user.id, content: text })
        .select("id")
        .single();

      // Replace optimistic message with real one
      if (insertedMsg) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticMsg.id ? { ...m, id: insertedMsg.id } : m
          )
        );
      }

      // Run drug detection via API (non-blocking, fire and forget)
      fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          username: profile.username,
          userId: user.id,
        }),
      }).catch(() => {});
    } catch (err) {
      console.error("Failed to send:", err);
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, user, profile, sending]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const handleTextareaInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      const ta = e.target;
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
    },
    []
  );

  const handleLogout = useCallback(async () => {
    await signOut();
    router.push("/login");
  }, [signOut, router]);

  // Memoize avatar display logic
  const messagesWithAvatarFlags = useMemo(() => {
    return messages.map((msg, index) => ({
      msg,
      showAvatar: index === 0 || messages[index].user_id !== messages[index - 1].user_id,
    }));
  }, [messages]);

  // Loading state — only while auth is initializing
  if (authLoading) {
    return (
      <div className="chat-loading">
        <div className="chat-loading-spinner" />
        <p>Loading SafeReach...</p>
      </div>
    );
  }

  // Not logged in — redirect is happening via useEffect
  if (!user) {
    return (
      <div className="chat-loading">
        <div className="chat-loading-spinner" />
        <p>Redirecting to login...</p>
      </div>
    );
  }

  return (
    <div className="chat-root">
      <div className="chat-bg-grid" />

      {/* Header */}
      <header className="chat-header">
        <div className="chat-header-left">
          <div className="chat-logo-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="var(--accent-primary)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h1 className="chat-logo-text">SafeReach</h1>
            <span className="chat-online-count">
              <span className="chat-online-dot" />
              {onlineUsers.length} online
            </span>
          </div>
        </div>

        <div className="chat-header-right">
          <button
            className="chat-members-btn"
            onClick={() => setShowMembers(!showMembers)}
            title="Members"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="chat-members-count">{onlineUsers.length}</span>
          </button>

          <div className="chat-user-info">
            <div
              className="chat-user-avatar"
              style={{ background: profile?.avatar_color || "#00c896" }}
            >
              {getInitials(profile?.username || "?")}
            </div>
          </div>

          <button className="chat-logout-btn" onClick={handleLogout} title="Logout">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>

      <div className="chat-body">
        {/* Members sidebar */}
        {showMembers && (
          <aside className="chat-sidebar">
            <div className="chat-sidebar-section">
              <h3 className="chat-sidebar-title">Online Members</h3>
              {onlineUsers.map((u) => (
                <div key={u.id} className="chat-member-card">
                  <div
                    className="chat-member-avatar"
                    style={{ background: u.avatar_color }}
                  >
                    {getInitials(u.username)}
                  </div>
                  <div className="chat-member-info">
                    <span className="chat-member-name">
                      {u.username}
                      {u.id === user.id && (
                        <span className="chat-member-you"> (you)</span>
                      )}
                    </span>
                  </div>
                  <span className="chat-member-status" />
                </div>
              ))}
            </div>

            <div className="chat-sidebar-section">
              <h3 className="chat-sidebar-title">Room Info</h3>
              <p className="chat-sidebar-text">
                SafeReach group chat. Max 10 members. All messages are monitored for drug-related content.
              </p>
            </div>

            <div className="chat-confidential-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6L12 2z"
                  fill="var(--accent-primary)"
                  opacity="0.8"
                />
              </svg>
              Monitored Chat Room
            </div>
          </aside>
        )}

        {/* Chat area */}
        <main className="chat-area">
          <div className="chat-messages">
            {loadingMessages ? (
              <div className="chat-messages-loading">
                <TypingDots />
                <p>Loading messages...</p>
              </div>
            ) : messages.length === 0 ? (
              <div className="chat-empty">
                <div className="chat-empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
                      stroke="var(--accent-primary)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.5"
                    />
                  </svg>
                </div>
                <h3 className="chat-empty-title">No messages yet</h3>
                <p className="chat-empty-text">
                  Be the first to start a conversation!
                </p>
              </div>
            ) : (
              messagesWithAvatarFlags.map(({ msg, showAvatar }) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isOwn={msg.user_id === user.id}
                  showAvatar={showAvatar}
                />
              ))
            )}
            {sending && <TypingDots />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="chat-input-area">
            <div className="chat-input-wrapper">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleTextareaInput}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="chat-textarea"
                rows={1}
                disabled={sending}
                autoFocus
              />
              <button
                className="chat-send-btn"
                onClick={sendMessage}
                disabled={!input.trim() || sending}
                title="Send message"
                style={{
                  opacity: input.trim() && !sending ? 1 : 0.4,
                  cursor: input.trim() && !sending ? "pointer" : "not-allowed",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
            <p className="chat-input-hint">
              Messages are monitored for safety • Shift+Enter for new line
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
