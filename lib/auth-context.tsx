"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase, Profile } from "./supabase";
import { PostgrestSingleResponse, Session, User } from "@supabase/supabase-js";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, username: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AVATAR_COLORS = [
  "#00c896", "#6c5ce7", "#fd79a8", "#fdcb6e", "#0984e3",
  "#e17055", "#00b894", "#e84393", "#74b9ff", "#fab1a0",
];

function getRandomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

// Timeout wrapper to prevent hanging Supabase calls
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    try {
      console.log("[SafeReach] Fetching profile for:", userId);
      const { data, error } = await withTimeout<PostgrestSingleResponse<Profile>>(
        supabase.from("profiles").select("*").eq("id", userId).single(),
        8000,
        "fetchProfile"
      );
      if (error) {
        console.error("[SafeReach] Fetch profile error:", error.message, error.code);
        return null;
      }
      console.log("[SafeReach] Profile fetched:", data?.username);
      if (data) setProfile(data);
      return data;
    } catch (err) {
      console.error("[SafeReach] Fetch profile crash:", err);
      return null;
    }
  }, []);

  const ensureProfile = useCallback(async (userId: string, username?: string): Promise<Profile | null> => {
    console.log("[SafeReach] Ensuring profile for:", userId);
    let profileData = await fetchProfile(userId);
    if (profileData) return profileData;

    const displayName = username || `user_${userId.slice(0, 6)}`;
    try {
      console.log("[SafeReach] Creating new profile:", displayName);
      const { error: insertError } = await withTimeout<PostgrestSingleResponse<null>>(
        supabase.from("profiles").insert({
          id: userId,
          username: displayName,
          avatar_color: getRandomColor(),
        }),
        8000,
        "insertProfile"
      );

      if (insertError) {
        console.error("[SafeReach] Profile insert error:", insertError.message, insertError.code);
        profileData = await fetchProfile(userId);
        if (profileData) return profileData;
        return null;
      }
    } catch (err) {
      console.error("[SafeReach] Profile insert crash:", err);
      // Don't block sign-in if profile creation fails
      return null;
    }

    return await fetchProfile(userId);
  }, [fetchProfile]);

  useEffect(() => {
    let mounted = true;

    // Safety timeout — never stay stuck on loading
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn("Auth loading timed out");
        setLoading(false);
      }
    }, 5000);

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (!mounted) return;

      if (error) {
        console.error("getSession error:", error);
        setLoading(false);
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await ensureProfile(session.user.id, session.user.user_metadata?.username);
      }

      if (mounted) setLoading(false);
    }).catch((err) => {
      console.error("getSession crash:", err);
      if (mounted) setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await ensureProfile(session.user.id, session.user.user_metadata?.username);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [ensureProfile]);

  const signUp = async (email: string, password: string, username: string) => {
    const { count, error: countError } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true });

    if (!countError && count !== null && count >= 10) {
      return { error: "Maximum 10 users reached. Contact admin for access." };
    }

    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", username)
      .single();

    if (existing) {
      return { error: "Username already taken. Pick another one." };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
      },
    });

    if (error) return { error: error.message };

    if (data.user) {
      await ensureProfile(data.user.id, username);
    }

    return {};
  };

  const signIn = async (email: string, password: string) => {
    try {
      console.log("[SafeReach] Signing in:", email);
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        10000,
        "signIn"
      );
      if (error) {
        console.error("[SafeReach] Sign-in error:", error.message);
        return { error: error.message };
      }

      console.log("[SafeReach] Sign-in successful, user:", data.user?.id);

      if (data.user) {
        // Don't block sign-in if profile fetch fails
        ensureProfile(data.user.id, data.user.user_metadata?.username).catch((err) =>
          console.error("[SafeReach] ensureProfile failed (non-blocking):", err)
        );
      }

      return {};
    } catch (err) {
      console.error("[SafeReach] Sign-in crash:", err);
      const msg = err instanceof Error ? err.message : "Sign-in failed";
      return { error: msg };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, signUp, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
