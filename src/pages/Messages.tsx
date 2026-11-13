import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { ArrowLeft, Hash, ImagePlus, Loader2, MessageSquarePlus, Mic, Paperclip, Search, Send, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  extractMentions, initials, useChatThreads, useTeam, type ChatThread, type TeamMember,
} from "@/hooks/useCollab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { compressImage } from "@/lib/imageCompress";
import {
  AttachmentView, CHAT_BUCKET, MAX_ATTACHMENT_BYTES, VoiceRecorder, formatBytes, type Attachment,
} from "@/components/ChatAttachments";

const db = supabase as any;

type Message = { id: string; thread_id: string; sender_id: string; body: string; created_at: string } & Partial<Attachment>;

const stamp = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM");
};

/** Renders a message body with @mentions highlighted. */
function Body({ text, team }: { text: string; team: TeamMember[] }) {
  const handles = team
    .flatMap((m) => [m.username, m.name])
    .filter(Boolean)
    .sort((a, b) => b!.length - a!.length)
    .map((h) => h!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!handles.length) return <>{text}</>;
  const re = new RegExp(`(@(?:${handles.join("|")}))(?![a-z0-9._-])`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1
          ? <span key={i} className="font-semibold text-sky-600 dark:text-sky-400">{part}</span>
          : <span key={i}>{part}</span>)}
    </>
  );
}

export default function Messages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data: team = [] } = useTeam();
  const { data: threads = [], isLoading: threadsLoading } = useChatThreads();

  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeId = params.get("thread");
  const active = threads.find((t) => t.id === activeId) ?? null;
  const nameOf = (id: string) => team.find((m) => m.id === id)?.name ?? "Someone";
  const others = useMemo(() => team.filter((m) => m.id !== user?.id), [team, user?.id]);

  const threadName = (t: ChatThread) => {
    if (t.kind === "team") return "Team room";
    if (t.kind === "group") return t.title || "Group";
    const other = t.members.find((id) => id !== user?.id);
    return other ? nameOf(other) : "Conversation";
  };

  const openThread = (id: string) => setParams({ thread: id });

  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ["chat-messages", activeId],
    enabled: !!activeId,
    staleTime: 5_000,
    // An open conversation re-checks often, in case a live update is missed
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await db.from("chat_messages").select("*")
        .eq("thread_id", activeId).order("created_at", { ascending: true }).limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Reading a conversation clears its unread count
  useEffect(() => {
    if (!activeId) return;
    db.rpc("mark_chat_read", { t: activeId }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    });
  }, [activeId, messages.length, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeId]);

  const startDirect = async (otherId: string) => {
    const { data, error } = await db.rpc("open_direct_chat", { other: otherId });
    if (error) return toast.error(error.message);
    await queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    setSearch("");
    openThread(data);
  };

  const createGroup = async () => {
    if (!groupName.trim()) return toast.error("Give the group a name");
    if (!groupMembers.length) return toast.error("Add at least one person");
    const { data, error } = await db.rpc("create_group_chat", { group_title: groupName, member_ids: groupMembers });
    if (error) return toast.error(error.message);
    await queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    setGroupOpen(false);
    setGroupName("");
    setGroupMembers([]);
    openThread(data);
  };

  // People who can be @mentioned here: the thread's members (everyone in the team room)
  const mentionable = useMemo(() => {
    if (!active) return [];
    const pool = active.kind === "team" ? others : others.filter((m) => active.members.includes(m.id));
    return pool;
  }, [active, others]);

  const send = useMutation({
    mutationFn: async () => {
      const body = draft.trim();
      if (!body || !activeId) return;
      const { error } = await db.from("chat_messages").insert({
        thread_id: activeId,
        sender_id: user!.id,
        body,
        mentions: extractMentions(body, mentionable),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      setMentionQuery(null);
      queryClient.invalidateQueries({ queryKey: ["chat-messages", activeId] });
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  /** Uploads into the conversation's private folder, then posts the message. */
  const sendAttachment = async (file: File, kind: Attachment["attachment_type"], duration?: number) => {
    if (!activeId || !user) return;
    if (kind === "image") file = await compressImage(file);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(`${file.name} is ${formatBytes(file.size)} — the limit is 25 MB`);
      return;
    }
    setUploading(kind === "audio" ? "voice note" : file.name);
    try {
      const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
      const path = `${activeId}/${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from(CHAT_BUCKET)
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) throw upErr;

      // Text typed alongside goes with the attachment as its caption
      const caption = kind === "audio" ? "" : draft.trim();
      const { error } = await db.from("chat_messages").insert({
        thread_id: activeId,
        sender_id: user.id,
        body: caption,
        mentions: extractMentions(caption, mentionable),
        attachment_path: path,
        attachment_type: kind,
        attachment_name: file.name,
        attachment_size: file.size,
        attachment_duration: duration ?? null,
      });
      if (error) {
        await supabase.storage.from(CHAT_BUCKET).remove([path]);
        throw error;
      }
      if (caption) setDraft("");
      queryClient.invalidateQueries({ queryKey: ["chat-messages", activeId] });
      queryClient.invalidateQueries({ queryKey: ["chat-threads"] });
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const onPickFiles = async (files: FileList | null, asImage: boolean) => {
    for (const f of Array.from(files ?? [])) {
      await sendAttachment(f, asImage || f.type.startsWith("image/") ? "image" : f.type.startsWith("audio/") ? "audio" : "file");
    }
  };

  const deleteMessage = async (id: string) => {
    const msg = messages.find((m) => m.id === id);
    const { error } = await db.from("chat_messages").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (msg?.attachment_path) await supabase.storage.from(CHAT_BUCKET).remove([msg.attachment_path]);
    queryClient.invalidateQueries({ queryKey: ["chat-messages", activeId] });
  };

  // Typing "@" opens a picker of people to mention
  const onDraftChange = (value: string) => {
    setDraft(value);
    const caret = inputRef.current?.selectionStart ?? value.length;
    const match = /(^|\s)@([\w.-]*)$/.exec(value.slice(0, caret));
    setMentionQuery(match ? match[2].toLowerCase() : null);
  };

  const mentionMatches = mentionQuery === null ? [] : mentionable
    .filter((m) => m.name.toLowerCase().includes(mentionQuery) || m.username?.includes(mentionQuery))
    .slice(0, 6);

  const insertMention = (m: TeamMember) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(/@([\w.-]*)$/, `@${m.username ?? m.name} `);
    const next = before + draft.slice(caret);
    setDraft(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const filteredThreads = threads.filter((t) => threadName(t).toLowerCase().includes(search.toLowerCase()));
  const peopleWithoutThread = search
    ? others.filter((m) =>
        (m.name.toLowerCase().includes(search.toLowerCase()) || m.username?.includes(search.toLowerCase())) &&
        !threads.some((t) => t.kind === "direct" && t.members.includes(m.id)))
    : [];

  return (
    <div className="h-[calc(100dvh-6rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] md:h-[calc(100dvh-4rem)] flex rounded-3xl border bg-card overflow-hidden">
      {/* ── Conversation list ── */}
      <aside className={cn("w-full md:w-80 border-r flex flex-col", active && "hidden md:flex")}>
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-extrabold">Messages</h1>
            <Button size="sm" variant="outline" className="rounded-xl gap-1.5" onClick={() => setGroupOpen(true)}>
              <Users className="h-4 w-4" /> New group
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search or start a chat…"
              className="pl-9 rounded-xl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threadsLoading && <Loader2 className="h-5 w-5 animate-spin m-6 text-muted-foreground" />}
          {filteredThreads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openThread(t.id)}
              className={cn("w-full text-left px-4 py-3 flex gap-3 items-center hover:bg-accent/60 transition-colors",
                t.id === activeId && "bg-accent")}
            >
              <span className="h-10 w-10 shrink-0 rounded-full bg-primary/10 text-primary text-xs font-black grid place-items-center">
                {t.kind === "team" ? <Hash className="h-4 w-4" /> : t.kind === "group" ? <Users className="h-4 w-4" /> : initials(threadName(t))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={cn("truncate text-sm", t.unread ? "font-bold" : "font-semibold")}>{threadName(t)}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">{t.preview ? stamp(t.last_message_at) : ""}</span>
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">{t.preview ?? "No messages yet"}</span>
                  {t.unread > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center">
                      {t.unread}
                    </span>
                  )}
                </span>
              </span>
            </button>
          ))}
          {peopleWithoutThread.length > 0 && (
            <>
              <p className="px-4 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Start a chat</p>
              {peopleWithoutThread.map((m) => (
                <button key={m.id} type="button" onClick={() => startDirect(m.id)}
                  className="w-full text-left px-4 py-2.5 flex gap-3 items-center hover:bg-accent/60">
                  <span className="h-9 w-9 rounded-full bg-muted text-xs font-black grid place-items-center">{initials(m.name)}</span>
                  <span className="text-sm font-medium">{m.name}{m.username && <span className="text-muted-foreground"> @{m.username}</span>}</span>
                </button>
              ))}
            </>
          )}
          {!search && others.length > 0 && (
            <>
              <p className="px-4 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Team</p>
              {others.filter((m) => !threads.some((t) => t.kind === "direct" && t.members.includes(m.id))).map((m) => (
                <button key={m.id} type="button" onClick={() => startDirect(m.id)}
                  className="w-full text-left px-4 py-2.5 flex gap-3 items-center hover:bg-accent/60">
                  <span className="h-9 w-9 rounded-full bg-muted text-xs font-black grid place-items-center">{initials(m.name)}</span>
                  <span className="text-sm font-medium flex-1">{m.name}</span>
                  <MessageSquarePlus className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </>
          )}
        </div>
      </aside>

      {/* ── Conversation ── */}
      <section className={cn("flex-1 flex flex-col min-w-0", !active && "hidden md:flex")}>
        {!active ? (
          <div className="flex-1 grid place-items-center text-center p-8">
            <div>
              <MessageSquarePlus className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-semibold">Pick a conversation</p>
              <p className="text-sm text-muted-foreground">Or choose someone from the team list to start one.</p>
            </div>
          </div>
        ) : (
          <>
            <header className="h-16 px-4 border-b flex items-center gap-3 shrink-0">
              <Button size="icon" variant="ghost" className="md:hidden" aria-label="Back" onClick={() => setParams({})}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <p className="font-bold truncate">{threadName(active)}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {active.kind === "team"
                    ? "Everyone on the team"
                    : active.kind === "group"
                      ? active.members.map(nameOf).join(", ")
                      : "Direct message"}
                </p>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {msgsLoading && <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />}
              {!msgsLoading && messages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-10">Say hello 👋</p>
              )}
              {messages.map((m, i) => {
                const mine = m.sender_id === user?.id;
                const showName = !mine && active.kind !== "direct" && messages[i - 1]?.sender_id !== m.sender_id;
                return (
                  <div key={m.id} className={cn("group flex", mine ? "justify-end" : "justify-start")}>
                    <div className="max-w-[78%]">
                      {showName && <p className="text-[11px] font-semibold text-muted-foreground ml-3 mb-0.5">{nameOf(m.sender_id)}</p>}
                      <div className="flex items-end gap-1.5">
                        {mine && (
                          <button type="button" aria-label="Delete message" onClick={() => deleteMessage(m.id)}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <div className={cn("rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                          mine ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md")}>
                          {m.attachment_path && m.attachment_type && (
                            <div className={cn(m.body && "mb-1.5", m.attachment_type === "image" && "-mx-1.5 -mt-0.5")}>
                              <AttachmentView a={m as Attachment} mine={mine} />
                            </div>
                          )}
                          {m.body && (mine ? m.body : <Body text={m.body} team={team} />)}
                          <span className={cn("block text-[10px] mt-0.5 text-right", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                            {format(new Date(m.created_at), "HH:mm")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form
              className="p-3 border-t relative"
              onSubmit={(e) => { e.preventDefault(); send.mutate(); }}
            >
              {mentionMatches.length > 0 && (
                <div className="absolute bottom-full left-3 mb-2 w-64 rounded-xl border bg-popover shadow-lg overflow-hidden z-10">
                  {mentionMatches.map((m) => (
                    <button key={m.id} type="button" onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2">
                      <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-[10px] font-black grid place-items-center">{initials(m.name)}</span>
                      <span className="truncate">{m.name}</span>
                      {m.username && <span className="text-xs text-muted-foreground truncate">@{m.username}</span>}
                    </button>
                  ))}
                </div>
              )}
              {uploading && (
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending {uploading}…
                </p>
              )}
              <input ref={imageInput} type="file" accept="image/*" multiple hidden
                onChange={(e) => { onPickFiles(e.target.files, true); e.target.value = ""; }} />
              <input ref={fileInput} type="file" multiple hidden
                onChange={(e) => { onPickFiles(e.target.files, false); e.target.value = ""; }} />
              {recording ? (
                <VoiceRecorder
                  onCancel={() => setRecording(false)}
                  onDone={(file, secs) => { setRecording(false); sendAttachment(file, "audio", secs); }}
                />
              ) : (
              <div className="flex items-end gap-2">
                <div className="flex items-center h-11 shrink-0">
                  <Button type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-lg" aria-label="Send a photo"
                    title="Photo" disabled={!!uploading} onClick={() => imageInput.current?.click()}>
                    <ImagePlus className="h-5 w-5" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-lg" aria-label="Attach a file"
                    title="File" disabled={!!uploading} onClick={() => fileInput.current?.click()}>
                    <Paperclip className="h-5 w-5" />
                  </Button>
                </div>
                <Textarea
                  ref={inputRef}
                  rows={1}
                  placeholder="Type a message… use @ to mention someone"
                  className="min-h-[44px] max-h-40 rounded-xl resize-none"
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (mentionMatches.length) insertMention(mentionMatches[0]);
                      else send.mutate();
                    }
                    if (e.key === "Escape") setMentionQuery(null);
                  }}
                />
                {draft.trim() ? (
                  <Button type="submit" size="icon" className="h-11 w-11 rounded-xl shrink-0" aria-label="Send"
                    disabled={send.isPending}>
                    {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                ) : (
                  <Button type="button" size="icon" className="h-11 w-11 rounded-xl shrink-0" aria-label="Record a voice note"
                    title="Voice note" disabled={!!uploading} onClick={() => setRecording(true)}>
                    <Mic className="h-5 w-5" />
                  </Button>
                )}
              </div>
              )}
            </form>
          </>
        )}
      </section>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent className="rounded-3xl max-w-md">
          <DialogHeader><DialogTitle>New group</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Group name</Label>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="e.g. Workshop team" />
            </div>
            <div className="space-y-1.5">
              <Label>Members</Label>
              <div className="max-h-64 overflow-y-auto rounded-xl border divide-y">
                {others.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent/50">
                    <Checkbox
                      checked={groupMembers.includes(m.id)}
                      onCheckedChange={(v) =>
                        setGroupMembers((list) => v ? [...list, m.id] : list.filter((id) => id !== m.id))}
                    />
                    <span className="text-sm">{m.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupOpen(false)}>Cancel</Button>
            <Button onClick={createGroup}>Create group</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
