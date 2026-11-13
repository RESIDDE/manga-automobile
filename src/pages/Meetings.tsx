import { format } from "date-fns";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { CustomerMatchHint } from "@/components/CustomerMatchHint";
import { Button } from "@/components/ui/button";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { 
  Calendar, Users, FileText, CheckCircle2, XCircle, Clock, 
  ExternalLink, Search, Download, Trash2, Mail, Phone,
  ChevronRight, BadgeCheck, MessageSquare, AlertCircle,
  Copy, Plus, Eye, Upload, X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { confirmDelete } from "@/components/DeleteConfirm";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { canCreate, canDelete, canEdit } from "@/lib/permissions";
import { CustomPagination } from "@/components/CustomPagination";
import { RecordActions } from "@/components/RecordActions";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip } from "recharts";

const statuses = ["Pending", "Approved", "Rejected", "Completed"];
const STATUS_COLORS = {
  Pending: "#f59e0b",
  Approved: "#10b981",
  Rejected: "#ef4444",
  Completed: "#3b82f6"
};

export default function Meetings() {
  const { role } = useAuth();
  const { permissions } = usePermissions();
  const hasCreate = canCreate(role, "meetings", permissions);
  const hasEdit = canEdit(role, "meetings", permissions);
  const hasDelete = canDelete(role, "meetings", permissions);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAddingMeeting, setIsAddingMeeting] = useState(false);
  const [newMeeting, setNewMeeting, clearMeetingDraft] = useFormPersistence(
    "manga_meeting_draft",
    {
      fullName: "",
      phone: "",
      email: "",
      intent: "",
      bookingDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    }
  );
  const [adminFile, setAdminFile] = useState<File | null>(null);

  const queryClient = useQueryClient();

  // Queries
  const { data: meetings = [], isLoading, isError, error } = useQuery({
    queryKey: ["meetings"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any).from("meetings").select("*").order("booking_date", { ascending: false });
        if (error) throw error;
        return data as any[];
      } catch (err) {
        console.error("Error fetching meetings:", err);
        throw err;
      }
    },
  });

  const addMeetingMutation = useMutation({
    mutationFn: async (payload: any) => {
      let proposalUrl = "";

      // 1. Upload file if exists
      if (adminFile) {
        const fileExt = adminFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `admin_submissions/${fileName}`;

        const { error: uploadError } = await (supabase as any).storage
          .from('proposals')
          .upload(filePath, adminFile);

        if (uploadError) throw new Error("Failed to upload proposal: " + uploadError.message);
        proposalUrl = filePath;
      }

      const { error } = await (supabase as any).from("meetings").insert([{
        full_name: payload.fullName,
        contact_info: `Phone: ${payload.phone} | Email: ${payload.email}`,
        intent: payload.intent,
        proposal_url: proposalUrl,
        booking_date: new Date(payload.bookingDate).toISOString(),
        status: 'Approved'
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Meeting logged successfully");
      setIsAddingMeeting(false);
      setAdminFile(null);
      clearMeetingDraft();
      setNewMeeting({
        fullName: "",
        phone: "",
        email: "",
        intent: "",
        bookingDate: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      });
    },
    onError: (err: any) => toast.error(err.message || "Failed to log meeting"),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      const { error } = await (supabase as any).from("meetings").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Meeting status updated");
    },
    onError: () => toast.error("Failed to update status"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("meetings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Record deleted");
      setSelectedId(null);
    },
  });

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const filtered = meetings.filter(m => {
    const fullName = m.full_name || "";
    const intent = m.intent || "";
    const matchesSearch = fullName.toLowerCase().includes(search.toLowerCase()) || 
                          intent.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || m.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const getSafeDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const selectedMeeting = meetings.find(m => m.id === selectedId);

  const getProposalDownloadUrl = async (path: string) => {
    try {
      const { data, error } = await supabase.storage.from('proposals').createSignedUrl(path, 3600);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      toast.error("Failed to generate download link");
    }
  };

  const copyBookingLink = () => {
    const url = window.location.origin + "/book";
    navigator.clipboard.writeText(url);
    toast.success("Booking link copied to clipboard");
  };

  return (
    <div className="space-y-8 animate-fade-up pb-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 opacity-80">
            <Calendar className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium uppercase tracking-wider text-amber-500">Scheduling Hub</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-heading font-extrabold tracking-tight">Meetings & Proposals</h1>
          <p className="text-base text-muted-foreground mt-2 max-w-xl">
            Manage professional bookings and incoming business proposals from one central dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
           <Button variant="outline" className="rounded-xl border-amber-500/20 text-amber-500 hover:bg-amber-500/5" onClick={copyBookingLink}>
              <Copy className="mr-2 h-4 w-4" /> Copy Booking Link
           </Button>
           <Button variant="outline" className="rounded-xl" onClick={() => navigate('/book')}>
              <ExternalLink className="mr-2 h-4 w-4" /> Open Public Form
           </Button>
           {hasCreate && (
             <Button className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20" onClick={() => setIsAddingMeeting(true)}>
                <Plus className="mr-2 h-4 w-4" /> New Meeting
             </Button>
           )}
        </div>
      </div>

      {/* Small Dashboard Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
           <div className="glass-panel p-6 rounded-3xl border border-white/5 bg-white/[0.02] flex flex-col justify-between">
              <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mb-1">Total Requests</p>
              <p className="text-4xl font-black">{meetings.length}</p>
           </div>
           <div className="glass-panel p-6 rounded-3xl border border-white/5 bg-amber-500/5 flex flex-col justify-between">
              <p className="text-[10px] uppercase font-bold text-amber-500 tracking-widest mb-1">Pending</p>
              <p className="text-4xl font-black">{meetings.filter((m: any) => m.status === 'Pending').length}</p>
           </div>
           <div className="glass-panel p-6 rounded-3xl border border-white/5 bg-emerald-500/5 flex flex-col justify-between">
              <p className="text-[10px] uppercase font-bold text-emerald-500 tracking-widest mb-1">Approved</p>
              <p className="text-4xl font-black">{meetings.filter((m: any) => m.status === 'Approved').length}</p>
           </div>
           <div className="glass-panel p-6 rounded-3xl border border-white/5 bg-blue-500/5 flex flex-col justify-between">
              <p className="text-[10px] uppercase font-bold text-blue-500 tracking-widest mb-1">Completed</p>
              <p className="text-4xl font-black">{meetings.filter((m: any) => m.status === 'Completed').length}</p>
           </div>
        </div>
        <div className="glass-panel p-6 rounded-3xl border border-white/5 bg-white/[0.01] h-[160px] flex items-center justify-center">
           {meetings.length > 0 ? (
             <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                  <Pie
                    data={statuses.map(s => ({ 
                      name: s, 
                      value: meetings.filter((m: any) => m.status === s).length 
                    })).filter(d => d.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statuses.map(s => (
                      <Cell key={s} fill={STATUS_COLORS[s as keyof typeof STATUS_COLORS]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#111', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                    itemStyle={{ color: '#fff' }}
                  />
               </PieChart>
             </ResponsiveContainer>
           ) : (
             <p className="text-xs text-muted-foreground italic">No data yet</p>
           )}
           <div className="ml-4 space-y-1 hidden sm:block">
              {statuses.map(s => (
                <div key={s} className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[s as keyof typeof STATUS_COLORS] }} />
                   <span className="text-[10px] font-bold text-muted-foreground uppercase">{s}</span>
                </div>
              ))}
           </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-panel p-4 rounded-3xl flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative w-full group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-amber-500 transition-colors" />
          <Input 
            placeholder="Search applicants, intents..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            className="pl-10 h-11 rounded-xl bg-background/50 border-white/10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-full sm:w-48 h-11 rounded-xl border-white/10 bg-background/50">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent className="glass-panel border-white/10">
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Main Table */}
      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3,4].map(i => <div key={i} className="h-20 w-full rounded-2xl bg-card/40 animate-pulse border border-white/5" />)}
        </div>
      ) : isError ? (
        <div className="glass-panel p-16 flex flex-col items-center justify-center text-center rounded-[2.5rem] border border-red-500/20 bg-red-500/5">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <p className="text-red-500 font-bold mb-2">Error loading meetings</p>
          <p className="text-sm text-muted-foreground">{(error as any)?.message || "The meetings table might not be correctly set up in the database."}</p>
          <Button variant="outline" className="mt-6 rounded-xl" onClick={() => queryClient.invalidateQueries({ queryKey: ["meetings"] })}>
            Try Again
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel p-16 flex flex-col items-center justify-center text-center rounded-[2.5rem] border border-white/5 bg-background/30">
          <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground font-medium">No meeting requests found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/*
            A card per request rather than a six-column table. The old row put
            the applicant, the intent, the date, the proposal, the status and
            the actions side by side, which only fitted on a desktop — and the
            actions were a ghost "View" beside a muted bin icon.
          */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paged.map((m) => {
              const phone = m.contact_info?.includes("|")
                ? m.contact_info.split("|")[0].replace("Phone:", "").trim()
                : null;
              const when = getSafeDate(m.booking_date);

              return (
                <div
                  key={m.id}
                  className="bento-card p-5 flex flex-col gap-4 transition-colors hover:border-amber-500/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 shrink-0 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 text-xs font-black">
                        {(m.full_name || "?").charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm truncate">{m.full_name || "Unknown"}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {phone || "No phone"}
                        </p>
                      </div>
                    </div>
                    <span className={cn(
                      "shrink-0 inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider",
                      m.status === "Pending" ? "bg-amber-500/10 text-amber-500" :
                      m.status === "Approved" ? "bg-emerald-500/10 text-emerald-500" :
                      m.status === "Rejected" ? "bg-red-500/10 text-red-500" :
                      "bg-blue-500/10 text-blue-500"
                    )}>
                      {m.status}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      Meeting intent
                    </p>
                    <p className="text-sm line-clamp-2">{m.intent || "—"}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <p className="text-xs">
                      {when ? (
                        <>
                          <span className="font-semibold">
                            {format(new Date(m.booking_date), "MMM dd, yyyy")}
                          </span>
                          <span className="text-muted-foreground">
                            {" · "}{format(new Date(m.booking_date), "p")}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground italic">No valid date</span>
                      )}
                    </p>
                  </div>

                  {m.proposal_url && (
                    <p className="text-[11px] text-amber-500 font-semibold">
                      Proposal attached
                    </p>
                  )}

                  <RecordActions
                    menuLabel={`More actions for ${m.full_name || "this request"}`}
                    primary={[
                      { label: "View request", icon: Eye, onClick: () => setSelectedId(m.id) },
                    ]}
                    menu={[
                      {
                        label: "Download proposal", icon: Download,
                        onClick: () => getProposalDownloadUrl(m.proposal_url),
                        show: !!m.proposal_url,
                      },
                      {
                        label: "Delete request", icon: Trash2, destructive: true, show: hasDelete,
                        onClick: async () => {
                          const ok = await confirmDelete({
                            title: "Delete this meeting request?",
                            description: "The request and its details are removed permanently.",
                            confirmLabel: "Delete request",
                          });
                          if (ok) deleteMutation.mutate(m.id);
                        },
                      },
                    ]}
                  />
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t border-white/5">
            <CustomPagination
              page={safePage}
              pageCount={pageCount}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(0); }}
            />
          </div>
        </div>
      )}

      {/* Detailed Modal */}
      <Dialog open={!!selectedId} onOpenChange={open => !open && setSelectedId(null)}>
        <DialogContent className="max-w-xl rounded-[2.5rem] glass-panel border-white/10 p-0 overflow-hidden shadow-2xl bg-background/95 backdrop-blur-2xl">
          {selectedMeeting && (
            <>
              <div className="p-8 border-b border-white/5 bg-amber-500/5 relative">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                   <Calendar className="h-24 w-24" />
                </div>
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black tracking-tight">{selectedMeeting.full_name}</DialogTitle>
                  <p className="text-sm font-bold text-amber-500 uppercase tracking-widest">{selectedMeeting.status} Request</p>
                </DialogHeader>
              </div>

              <div className="p-8 space-y-8">
                <div className="grid grid-cols-2 gap-6">
                   <div className="space-y-1">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Contact Information</Label>
                      <div className="flex flex-col gap-1">
                         <div className="flex items-center gap-2 text-sm font-bold"><Phone className="h-3.5 w-3.5 text-amber-500" /> {selectedMeeting.contact_info.split('|')[0].replace('Phone:', '').trim()}</div>
                         <div className="flex items-center gap-2 text-sm font-bold"><Mail className="h-3.5 w-3.5 text-amber-500" /> {selectedMeeting.contact_info.split('|')[1].replace('Email:', '').trim()}</div>
                      </div>
                   </div>
                   <div className="space-y-1 text-right">
                      <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Preferred Date</Label>
                      <p className="text-sm font-bold break-all">{format(new Date(selectedMeeting.booking_date), "PPP p")}</p>
                   </div>
                </div>

                <div className="space-y-2">
                   <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Proposal / Intent Statement</Label>
                   <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/5 text-sm leading-relaxed whitespace-pre-wrap max-h-[150px] overflow-y-auto">
                      {selectedMeeting.intent}
                   </div>
                </div>

                {selectedMeeting.proposal_url && (
                  <Button variant="outline" className="w-full rounded-2xl h-14 border-white/10 hover:bg-white/5 gap-3 font-bold" onClick={() => getProposalDownloadUrl(selectedMeeting.proposal_url)}>
                    <Download className="h-5 w-5 text-amber-500" /> Download Proposal Attachment
                  </Button>
                )}

                <div className="space-y-4 pt-4">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest block text-center">Manage Status</Label>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {statuses.map(s => (
                      <Button 
                        key={s} 
                        variant={selectedMeeting.status === s ? "default" : "outline"}
                        onClick={() => hasEdit && updateStatusMutation.mutate({ id: selectedMeeting.id, status: s })}
                        className={cn(
                          "rounded-xl h-12 px-6 font-bold transition-all",
                          selectedMeeting.status === s ? "bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20" : "border-white/10"
                        )}
                        disabled={!hasEdit || updateStatusMutation.isPending}
                      >
                         {s === 'Approved' && <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-400" />}
                         {s === 'Rejected' && <XCircle className="h-4 w-4 mr-2 text-red-500" />}
                         {s === 'Completed' && <BadgeCheck className="h-4 w-4 mr-2 text-blue-400" />}
                         {s === 'Pending' && <Clock className="h-4 w-4 mr-2" />}
                         {s}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-8 border-t border-white/5 bg-foreground/5 flex justify-between gap-4">
                <Button variant="ghost" className="rounded-xl text-red-500 hover:bg-red-500/10 hover:text-red-500" onClick={() => deleteMutation.mutate(selectedMeeting.id)}>
                   <Trash2 className="h-4 w-4 mr-2" /> Delete Record
                </Button>
                <Button onClick={() => setSelectedId(null)} className="rounded-xl px-10 bg-white/5 hover:bg-white/10 border border-white/10">Close Detail</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Meeting Dialog */}
      <Dialog open={isAddingMeeting} onOpenChange={setIsAddingMeeting}>
        <DialogContent className="max-w-xl rounded-[2.5rem] glass-panel border-white/10 p-0 overflow-hidden shadow-2xl bg-background/95 backdrop-blur-2xl">
          <div className="p-8 border-b border-white/5 bg-amber-500/5">
             <DialogHeader>
                <DialogTitle className="text-2xl font-black">Log New Meeting</DialogTitle>
                <p className="text-sm text-muted-foreground">Manually add a meeting to the organization's schedule.</p>
             </DialogHeader>
          </div>
          
          <div className="p-8 space-y-4">
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                   <Label>Full Name</Label>
                   <Input value={newMeeting.fullName} onChange={e => setNewMeeting({...newMeeting, fullName: e.target.value})} placeholder="Applicant Name" className="rounded-xl bg-white/5 border-white/10" />
                </div>
                <div className="space-y-2">
                   <Label>Phone Number</Label>
                   <Input value={newMeeting.phone} onChange={e => setNewMeeting({...newMeeting, phone: e.target.value})} placeholder="+234..." className="rounded-xl bg-white/5 border-white/10" />
                </div>
             </div>
             
             <div className="space-y-2">
                <Label>Email Address</Label>
                <Input value={newMeeting.email} onChange={e => setNewMeeting({...newMeeting, email: e.target.value})} placeholder="email@example.com" className="rounded-xl bg-white/5 border-white/10" />
             </div>

             <CustomerMatchHint
                name={newMeeting.fullName}
                phone={newMeeting.phone}
                onPick={(c) => setNewMeeting({
                  ...newMeeting,
                  fullName: c.name ?? newMeeting.fullName,
                  phone: c.phone ?? newMeeting.phone,
                  email: c.email ?? newMeeting.email,
                })}
             />

             <div className="space-y-2">
                <Label>Meeting intent / Summary</Label>
                <Textarea value={newMeeting.intent} onChange={e => setNewMeeting({...newMeeting, intent: e.target.value})} placeholder="Reason for the meeting..." className="rounded-xl bg-white/5 border-white/10 min-h-[100px]" />
             </div>

             <div className="space-y-2">
                <Label>Meeting Date & Time</Label>
                <Input type="datetime-local" value={newMeeting.bookingDate} onChange={e => setNewMeeting({...newMeeting, bookingDate: e.target.value})} className="rounded-xl bg-white/5 border-white/10 [color-scheme:dark]" />
             </div>

             <div className="space-y-2">
                <Label>Attach Document / Proposal (Optional)</Label>
                <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-dashed border-white/10 hover:border-amber-500/50 transition-all cursor-pointer relative">
                   <input 
                     type="file" 
                     className="absolute inset-0 opacity-0 cursor-pointer" 
                     onChange={(e) => setAdminFile(e.target.files?.[0] || null)}
                   />
                   <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                      <Upload className="h-5 w-5" />
                   </div>
                   <div className="flex-1 truncate">
                      <p className="text-xs font-bold truncate">{adminFile ? adminFile.name : "Select a file to upload"}</p>
                      <p className="text-[10px] text-muted-foreground">{adminFile ? `${(adminFile.size / 1024 / 1024).toFixed(2)} MB` : "PDF, DOCX, Images, etc."}</p>
                   </div>
                   {adminFile && (
                     <Button type="button" variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setAdminFile(null); }} className="h-8 w-8 rounded-full">
                        <X className="h-4 w-4" />
                     </Button>
                   )}
                </div>
             </div>
          </div>

          <div className="p-8 border-t border-white/5 bg-foreground/5 flex justify-end gap-3">
             <Button variant="ghost" onClick={() => setIsAddingMeeting(false)} className="rounded-xl">Cancel</Button>
             <Button onClick={() => addMeetingMutation.mutate(newMeeting)} disabled={addMeetingMutation.isPending} className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold px-8">
                {addMeetingMutation.isPending ? "Saving..." : "Save Meeting"}
             </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
