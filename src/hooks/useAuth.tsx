import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/permissions";

type AuthState = {
  user: User | null;
  profile: any | null;
  role: AppRole | null;
  isLoading: boolean;
};

type AuthContextValue = AuthState & { refreshProfile: () => Promise<void> };

const SIGNED_OUT: AuthState = {
  user: null,
  profile: null,
  role: null,
  isLoading: false,
};

const CACHE_KEY = "manga_auth_cache_v1";

/** Profile and role of the last signed-in session, so a refresh doesn't flash an empty shell. */
type CachedIdentity = { userId: string; profile: any | null; role: AppRole | null };

function readCache(): CachedIdentity | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedIdentity) : null;
  } catch {
    return null;
  }
}

function writeCache(identity: CachedIdentity) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(identity));
  } catch {
    /* storage blocked — we simply revalidate every load */
  }
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

const AuthContext = createContext<AuthContextValue>({
  ...SIGNED_OUT,
  isLoading: true,
  refreshProfile: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AuthState>({ ...SIGNED_OUT, isLoading: true });
  const mounted = useRef(true);

  /**
   * profiles and user_roles sit behind RLS keyed on auth.uid(), so they only
   * resolve once a real session exists. Both are read in parallel.
   *
   * `role` stays null until the role row resolves: guards must read null as
   * "not allowed yet" and wait on isLoading, never as a permanent denial.
   */
  const loadIdentity = useCallback(async (user: User) => {
    const cached = readCache();
    const sameUser = cached?.userId === user.id;

    setState({
      user,
      profile: sameUser ? cached!.profile : null,
      role: sameUser ? cached!.role : null,
      // With a warm cache the shell can render immediately while we revalidate
      isLoading: !sameUser,
    });

    const [{ data: profile }, { data: roleData }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      (supabase as any).from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
    ]);

    if (!mounted.current) return;

    // handle_new_user() assigns a role at signup; fall back to the least
    // privileged role rather than assuming admin.
    const role = ((roleData as any)?.role as AppRole) ?? "mechanic";
    const resolved = { user, profile: profile ?? null, role, isLoading: false };
    setState(resolved);
    writeCache({ userId: user.id, profile: profile ?? null, role });
  }, []);

  useEffect(() => {
    mounted.current = true;

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted.current) return;
      if (error || !session?.user) {
        clearCache();
        setState(SIGNED_OUT);
        return;
      }
      loadIdentity(session.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted.current) return;
      if (event === "INITIAL_SESSION") return;

      if (session?.user) {
        loadIdentity(session.user);
      } else {
        clearCache();
        setState(SIGNED_OUT);
      }
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, [loadIdentity]);

  /** Re-reads profile and role — call after changing your own name, avatar or role. */
  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) await loadIdentity(session.user);
  }, [loadIdentity]);

  return (
    <AuthContext.Provider value={{ ...state, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
