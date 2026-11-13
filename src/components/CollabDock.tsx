import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AtSign, Bell, Check, CheckCheck, Lock, MessageSquare, Tag, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFeature } from "@/hooks/usePermissions";
import {
  initials, markNotificationsRead, useNotifications, useTeam, useUnreadChatCount, type PageTag,
} from "@/hooks/useCollab";
import { ALL_PAGES } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const db = supabase as any;

/** The page as a tag address: path + query, minus the ?tag= we add to links. */
function pageKeyFrom(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  params.delete("tag");
  const q = params.toString();
  return pathname + (q ? `?${q}` : "");
}

/** A readable name for the page being tagged: its heading, else its section. */
function pageTitleFor(pathname: string) {
  const heading = document.querySelector("main h1")?.textContent?.trim();
  const section = [...ALL_PAGES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((p) => pathname.startsWith(p.path))?.label;
  if (heading && section && heading !== section) return `${section} · ${heading}`.slice(0, 120);
  return (heading || section || pathname).slice(0, 120);
}

const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true });

export function CollabDock() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { data: team = [] } = useTeam();
  const { data: notifications = [] } = useNotifications();
  const unreadChats = useUnreadChatCount();
  const { allowed: canChat } = useFeature("messages");
  const { allowed: canTag } = useFeature("tags");

  const [tagOpen, setTagOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [toUser, setToUser] = useState("");
  const [note, setNote] = useState("");

  const pageKey = pageKeyFrom(location.pathname, location.search);
  const focusTag = searchParams.get("tag");
  const nameOf = (id: string) => team.find((m) => m.id === id)?.name ?? "Someone";
  const others = useMemo(() => team.filter((m) => m.id !== user?.id), [team, user?.id]);

  // RLS returns only tags I sent or received — never anyone else's
  const { data: tags = [], isLoading: tagsLoading } = useQuery({
    queryKey: ["page-tags", pageKey],
    enabled: !!user,
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<PageTag[]> => {
      const { data, error } = await db.from("page_tags").select("*")
        .eq("page_path", pageKey).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const forMeOpen = tags.filter((t) => t.to_user === user?.id && t.status === "open").length;
  const unreadNotes = notifications.filter((n) => !n.read_at).length;

  // Arriving from a tag notification opens the panel on that tag
  useEffect(() => {
    if (focusTag) setTagOpen(true);
  }, [focusTag]);

  // Opening the panel marks the tags addressed to me as read
  useEffect(() => {
    if (!tagOpen || !user) return;
    const unread = tags.filter((t) => t.to_user === user.id && !t.read_at).map((t) => t.id);
    if (!unread.length) return;
    db.from("page_tags").update({ read_at: new Date().toISOString() }).in("id", unread)
      .then(() => queryClient.invalidateQueries({ queryKey: ["page-tags"] }));
    const related = notifications.filter((n) => n.kind === "tag" && !n.read_at && n.link?.includes("tag=")
      && unread.some((id) => n.link!.includes(id))).map((n) => n.id);
    markNotificationsRead(related).then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }));
  }, [tagOpen, tags, user, notifications, queryClient]);

  const closeTagPanel = (open: boolean) => {
    setTagOpen(open);
    if (!open && focusTag) {
      const next = new URLSearchParams(searchParams);
      next.delete("tag");
      setSearchParams(next, { replace: true });
    }
  };

  const sendTag = useMutation({
    mutationFn: async () => {
      if (!toUser) throw new Error("Choose who to tag");
      if (!note.trim()) throw new Error("Write a note for them");
      const { error } = await db.from("page_tags").insert({
        page_path: pageKey,
        page_title: pageTitleFor(location.pathname),
        from_user: user!.id,
        to_user: toUser,
        note: note.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${nameOf(toUser)} has been tagged. Only the two of you can see this note.`);
      setNote("");
      setToUser("");
      queryClient.invalidateQueries({ queryKey: ["page-tags"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setStatus = async (t: PageTag, status: "open" | "done") => {
    const { error } = await db.from("page_tags").update({ status }).eq("id", t.id);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["page-tags"] });
  };

  const removeTag = async (t: PageTag) => {
    const { error } = await db.from("page_tags").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    queryClient.invalidateQueries({ queryKey: ["page-tags"] });
  };

  const openNotification = async (id: string, link: string | null) => {
    setBellOpen(false);
    await markNotificationsRead([id]);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    if (link) navigate(link);
  };

  const markAllRead = async () => {
    await markNotificationsRead(notifications.filter((n) => !n.read_at).map((n) => n.id));
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  // The chat page has its own composer in this corner, and nothing to tag
  if (!user || location.pathname.startsWith("/messages")) return null;

  const badge = (n: number) =>
    n > 0 && (
      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center">
        {n > 99 ? "99+" : n}
      </span>
    );

  const dockBtn = "relative h-11 w-11 rounded-full grid place-items-center bg-background/90 backdrop-blur border border-border shadow-lg hover:bg-accent transition-colors";

  return (
    <>
      <div className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-[calc(1.25rem+env(safe-area-inset-right,0px))] z-40 flex flex-col gap-2.5 print:hidden">
        {canChat && (
          <button type="button" aria-label="Messages" title="Messages" className={dockBtn} onClick={() => navigate("/messages")}>
            <MessageSquare className="h-5 w-5" />
            {badge(unreadChats)}
          </button>
        )}

        <Popover open={bellOpen} onOpenChange={setBellOpen}>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Notifications" title="Notifications" className={dockBtn}>
              <Bell className="h-5 w-5" />
              {badge(unreadNotes)}
            </button>
          </PopoverTrigger>
          <PopoverContent side="left" align="end" className="w-[340px] p-0 rounded-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="font-bold text-sm">Notifications</p>
              {unreadNotes > 0 && (
                <button type="button" onClick={markAllRead} className="text-xs text-primary font-semibold flex items-center gap-1">
                  <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {notifications.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-10">You're all caught up.</p>
              )}
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openNotification(n.id, n.link)}
                  className={cn("w-full text-left px-4 py-3 flex gap-3 border-b last:border-0 hover:bg-accent/60 transition-colors",
                    !n.read_at && "bg-primary/5")}
                >
                  <span className={cn("mt-0.5 h-8 w-8 shrink-0 rounded-full grid place-items-center",
                    n.kind === "tag" ? "bg-amber-500/15 text-amber-600" : "bg-sky-500/15 text-sky-600")}>
                    {n.kind === "tag" ? <Tag className="h-4 w-4" /> : n.kind === "message" ? <MessageSquare className="h-4 w-4" /> : <AtSign className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold leading-snug">{n.title}</span>
                    {n.body && <span className="block text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</span>}
                    <span className="block text-[11px] text-muted-foreground/70 mt-1">{ago(n.created_at)}</span>
                  </span>
                  {!n.read_at && <span className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0" />}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <button
          type="button"
          aria-label={canTag ? "Tag someone on this page" : "Tags on this page"}
          title={canTag ? "Tag someone on this page" : "Tags on this page"}
          className={cn(dockBtn, "bg-primary text-primary-foreground border-primary hover:bg-primary/90")}
          onClick={() => setTagOpen(true)}
        >
          <Tag className="h-5 w-5" />
          {badge(forMeOpen)}
        </button>
      </div>

      <Sheet open={tagOpen} onOpenChange={closeTagPanel}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          <SheetHeader className="p-5 border-b text-left">
            <SheetTitle className="flex items-center gap-2"><Tag className="h-5 w-5 text-primary" /> {canTag ? "Tag a colleague" : "Tags on this page"}</SheetTitle>
            <SheetDescription className="flex items-start gap-1.5">
              <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Private: only you and the person you tag can see the note. Nobody else on this page will.
            </SheetDescription>
          </SheetHeader>

          {canTag && <div className="p-5 space-y-3 border-b">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tag</Label>
              <Select value={toUser} onValueChange={setToUser}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Choose a team member…" /></SelectTrigger>
                <SelectContent>
                  {others.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}{m.username ? ` (@${m.username})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Note for them</Label>
              <Textarea
                rows={4}
                placeholder="e.g. Please confirm the chassis number on this one before printing."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="rounded-xl resize-none"
              />
            </div>
            <Button className="w-full rounded-xl" disabled={sendTag.isPending} onClick={() => sendTag.mutate()}>
              {sendTag.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send private tag"}
            </Button>
          </div>}

          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your tags on this page</p>
            {tagsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {!tagsLoading && tags.length === 0 && (
              <p className="text-sm text-muted-foreground">No tags here yet.</p>
            )}
            {tags.map((t) => {
              const toMe = t.to_user === user.id;
              const other = toMe ? t.from_user : t.to_user;
              return (
                <div
                  key={t.id}
                  className={cn("rounded-2xl border p-3.5 space-y-2",
                    focusTag === t.id && "ring-2 ring-primary",
                    t.status === "done" && "opacity-60")}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-7 w-7 rounded-full bg-primary/10 text-primary text-[10px] font-black grid place-items-center">
                      {initials(nameOf(other))}
                    </span>
                    <p className="text-xs flex-1 min-w-0">
                      <span className="font-semibold">{toMe ? nameOf(t.from_user) : "You"}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="font-semibold">{toMe ? "You" : nameOf(t.to_user)}</span>
                      <span className="block text-muted-foreground">{ago(t.created_at)}</span>
                    </p>
                    {t.status === "done" && <span className="text-[10px] font-bold uppercase text-emerald-600">Done</span>}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{t.note}</p>
                  <div className="flex gap-2">
                    {toMe && (
                      <Button size="sm" variant="outline" className="h-7 rounded-lg text-xs"
                        onClick={() => setStatus(t, t.status === "open" ? "done" : "open")}>
                        <Check className="h-3.5 w-3.5 mr-1" /> {t.status === "open" ? "Mark done" : "Reopen"}
                      </Button>
                    )}
                    {!toMe && (
                      <Button size="sm" variant="ghost" className="h-7 rounded-lg text-xs text-destructive"
                        onClick={() => removeTag(t)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Withdraw
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
