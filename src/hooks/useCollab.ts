import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const db = supabase as any;

export type TeamMember = { id: string; name: string; username: string | null };

export type Notification = {
  id: string;
  kind: "tag" | "mention" | "message";
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type PageTag = {
  id: string;
  page_path: string;
  page_title: string | null;
  from_user: string;
  to_user: string;
  note: string;
  status: "open" | "done";
  read_at: string | null;
  created_at: string;
};

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/** Everyone who can be messaged or tagged. */
export function useTeam() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["team-directory"],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TeamMember[]> => {
      const { data, error } = await db.from("profiles").select("id, display_name, username");
      if (error) throw error;
      return (data ?? [])
        .map((p: any) => ({ id: p.id, name: p.display_name || p.username || "Unnamed", username: p.username }))
        .sort((a: TeamMember, b: TeamMember) => a.name.localeCompare(b.name));
    },
  });
}

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    staleTime: 10_000,
    // Live updates do the work; this re-check catches anything they miss
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await db
        .from("notifications").select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export async function markNotificationsRead(ids: string[]) {
  if (!ids.length) return;
  await db.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
}

/**
 * One realtime channel for everything collaborative. Mounted once in the
 * layout; it invalidates queries so lists, badges and the open chat refresh.
 */
export function CollabRealtimeSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`collab_${user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
          queryClient.invalidateQueries({ queryKey: ["page-tags"] });
          const n = payload.new;
          // Pop up new arrivals, unless that conversation is already open
          if (payload.eventType === "INSERT" && n && !(n.link && window.location.pathname + window.location.search === n.link)) {
            toast(n.title, {
              description: n.body ?? undefined,
              action: n.link ? { label: "Open", onClick: () => navRef.current(n.link) } : undefined,
            });
          }
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "page_tags" },
        () => queryClient.invalidateQueries({ queryKey: ["page-tags"] }))
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload: any) => {
          queryClient.invalidateQueries({ queryKey: ["chat-messages", payload.new?.thread_id] });
          queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
        })
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages" },
        () => queryClient.invalidateQueries({ queryKey: ["chat-messages"] }))
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_members" },
        () => queryClient.invalidateQueries({ queryKey: ["chat-threads"] }))
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Not fatal: the 20-second re-check keeps everything arriving
          console.warn("[collab] realtime unavailable:", status);
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  return null;
}

// ─── Chat ──────────────────────────────────────────────────────────────────

export type ChatThread = {
  id: string;
  kind: "direct" | "group" | "team";
  title: string | null;
  last_message_at: string;
  members: string[];
  last_read_at: string | null;
  unread: number;
  preview: string | null;
};

function previewOf(m: any): string | null {
  if (!m) return null;
  if (m.body?.trim()) return m.body;
  if (m.attachment_type === "image") return "📷 Photo";
  if (m.attachment_type === "audio") return "🎤 Voice note";
  if (m.attachment_type === "file") return `📎 ${m.attachment_name ?? "File"}`;
  return null;
}

export function useChatThreads() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["chat-threads", user?.id],
    enabled: !!user,
    staleTime: 10_000,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<ChatThread[]> => {
      const { data: threads, error } = await db
        .from("chat_threads").select("id, kind, title, last_message_at")
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      const ids = (threads ?? []).map((t: any) => t.id);
      if (!ids.length) return [];

      const [{ data: members }, { data: recent }] = await Promise.all([
        db.from("chat_members").select("thread_id, user_id, last_read_at").in("thread_id", ids),
        // Enough recent messages to compute previews and unread counts
        db.from("chat_messages").select("thread_id, sender_id, body, created_at, attachment_type, attachment_name")
          .in("thread_id", ids).order("created_at", { ascending: false }).limit(500),
      ]);

      return (threads ?? []).map((t: any) => {
        const mine = (members ?? []).find((m: any) => m.thread_id === t.id && m.user_id === user!.id);
        const lastRead = mine?.last_read_at ?? null;
        const msgs = (recent ?? []).filter((m: any) => m.thread_id === t.id);
        const unread = msgs.filter((m: any) =>
          m.sender_id !== user!.id && (!lastRead || m.created_at > lastRead)).length;
        return {
          ...t,
          members: (members ?? []).filter((m: any) => m.thread_id === t.id).map((m: any) => m.user_id),
          last_read_at: lastRead,
          unread,
          preview: previewOf(msgs[0]),
        };
      });
    },
  });
}

export function useUnreadChatCount() {
  const { data = [] } = useChatThreads();
  return data.reduce((n, t) => n + t.unread, 0);
}

/** "@Ada Obi" / "@ada.obi" in a message → the ids of the people named. */
export function extractMentions(body: string, team: TeamMember[]): string[] {
  const found = new Set<string>();
  const lower = body.toLowerCase();
  for (const m of team) {
    const handles = [m.username, m.name].filter(Boolean).map((h) => "@" + h!.toLowerCase());
    if (handles.some((h) => {
      const i = lower.indexOf(h);
      if (i < 0) return false;
      const next = lower[i + h.length];
      return next === undefined || !/[a-z0-9._-]/.test(next);
    })) found.add(m.id);
  }
  return [...found];
}
