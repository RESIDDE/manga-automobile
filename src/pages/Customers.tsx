import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { CustomerMatchHint } from "@/components/CustomerMatchHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { PlusCircle, Pencil, Trash2, Users, Phone, Mail, MapPin, Search, Download } from "lucide-react";
import { exportPhoneNumbers } from "@/lib/phoneExport";
import { toast } from "sonner";
import { SignaturePad } from "@/components/SignaturePad";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { canCreate, canDelete, canEdit } from "@/lib/permissions";

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  signature_data: string | null;
};

const emptyForm = { name: "", email: "", phone: "", address: "", notes: "", signature_data: "" };

export default function Customers() {
  const { role } = useAuth();
  const { permissions } = usePermissions();
  const hasCreate = canCreate(role, "customers", permissions);
  const hasEdit = canEdit(role, "customers", permissions);
  const hasDelete = canDelete(role, "customers", permissions);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 9; // 3x3 grid looks good

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  /** Every customer and source phone number, as a CSV that opens in Excel. */
  const handleExportPhones = async () => {
    setExporting(true);
    try {
      const count = await exportPhoneNumbers();
      if (count === 0) toast.info("No phone numbers recorded yet");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not export phone numbers");
    } finally {
      setExporting(false);
    }
  };
  const [form, setForm, clearDraft, startNewForm] = useFormPersistence(
    "manga_customer_draft", emptyForm, !!editId, editId
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Customer[];
    },
  });

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)) || (c.email && c.email.toLowerCase().includes(q));
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const upsertMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
        notes: form.notes || null,
        signature_data: form.signature_data || null,
      };
      if (editId) {
        const { error } = await supabase.from("customers").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(editId ? "Customer updated" : "Customer added");
      resetForm();
      closeDialog();
    },
    onError: () => toast.error("Failed to save customer"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success("Customer deleted");
    },
    onError: (error: any) => {
      console.error("Delete error:", error);
      toast.error(error.message || "Failed to delete customer");
    },
  });

  // Closing the dialog keeps the draft, so an accidental dismissal loses nothing.
  const closeDialog = () => { setDialogOpen(false); setEditId(null); };
  const resetForm = () => { clearDraft(); setForm(emptyForm); };

  const openEdit = (c: Customer) => {
    setEditId(c.id);
    setForm({ name: c.name, email: c.email || "", phone: c.phone || "", address: c.address || "", notes: c.notes || "", signature_data: c.signature_data || "" });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-8 animate-fade-up pb-10 max-w-6xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 opacity-80">
            <Users className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-medium uppercase tracking-wider text-emerald-500">Client Directory</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-heading font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-foreground via-foreground to-foreground/70 tracking-tight">
            Customers
          </h1>
          <p className="text-base text-muted-foreground mt-2 max-w-xl">
            Manage your customer relationships, contact details, and electronic signatures.
          </p>
        </div>
        <div className="shrink-0 flex flex-wrap gap-2">
          <Button variant="outline" size="lg" onClick={handleExportPhones} disabled={exporting} className="rounded-2xl border-white/10 hover:bg-white/5">
            <Download className="mr-2 h-5 w-5" /> {exporting ? "Exporting…" : "Export phone numbers"}
          </Button>
          {hasCreate && (
          <Button onClick={() => { setEditId(null); startNewForm(); setDialogOpen(true); }} size="lg" className="rounded-2xl shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all bg-emerald-500 hover:bg-emerald-600 text-white">
            <PlusCircle className="mr-2 h-5 w-5" /> Add Customer
          </Button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="glass-panel p-4 rounded-3xl flex flex-col sm:flex-row gap-4 items-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent pointer-events-none" />
        <div className="relative w-full group z-10">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-emerald-500 transition-colors" />
          <Input 
            placeholder="Search by name, email, or phone..." 
            value={search} 
            onChange={(e) => { setSearch(e.target.value); setPage(0); }} 
            className="pl-10 h-10 rounded-xl bg-background/50 border-white/10 focus-visible:ring-emerald-500/50 transition-all font-medium text-sm w-full"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {[1, 2, 3, 4].map((n) => <div key={n} className="h-32 rounded-3xl bg-card/40 animate-pulse border border-white/5" />)}
        </div>
      ) : customers.length === 0 ? (
        <div className="bento-card p-12 flex flex-col items-center justify-center text-center">
          <div className="bg-emerald-500/10 p-5 rounded-full mb-4">
            <Users className="h-10 w-10 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold mb-2">No customers yet.</h2>
          <p className="text-muted-foreground max-w-sm mb-6">Start building your client database by adding your first customer.</p>
          {hasCreate && (
            <Button onClick={() => { setEditId(null); startNewForm(); setDialogOpen(true); }} className="rounded-xl shadow-lg shadow-emerald-500/20 bg-emerald-500 hover:bg-emerald-600 text-white">Add Customer</Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paged.map((c) => (
              <div key={c.id} className="bento-card p-6 flex flex-col justify-between group">
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="bg-foreground/5 p-3 rounded-2xl group-hover:bg-emerald-500/10 transition-colors">
                      <Users className="h-5 w-5 text-foreground/70 group-hover:text-emerald-500 transition-colors" />
                    </div>
                    {c.signature_data && (
                       <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                         Signed
                       </span>
                    )}
                  </div>
                  
                  <h3 className="font-bold text-lg text-foreground group-hover:text-emerald-500 transition-colors">{c.name}</h3>
                  
                  <div className="mt-4 space-y-2">
                    {c.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                         <Phone className="h-3.5 w-3.5 opacity-70" /> {c.phone}
                      </div>
                    )}
                    {c.email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground truncate" title={c.email}>
                         <Mail className="h-3.5 w-3.5 opacity-70" /> {c.email}
                      </div>
                    )}
                    {c.address && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground">
                         <MapPin className="h-3.5 w-3.5 opacity-70 shrink-0 mt-0.5" /> 
                         <span className="line-clamp-2" title={c.address}>{c.address}</span>
                      </div>
                    )}
                  </div>
                </div>

                {(hasEdit || hasDelete) && (
                  <div className="flex gap-2 mt-6 pt-4 border-t border-white/5 justify-end">
                    {hasEdit && (
                      <Button variant="ghost" size="sm" className="h-8 rounded-lg hover:bg-foreground/10 hover:text-foreground text-muted-foreground transition-all" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                      </Button>
                    )}
                    {hasDelete && (
                      <Button variant="ghost" size="icon" aria-label="Delete customer" className="h-8 w-8 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all" onClick={() => setDeleteId(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="glass-panel p-6 rounded-3xl border border-white/5">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => page > 0 && setPage(page - 1)}
                      className={page === 0 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  
                  {[...Array(totalPages)].map((_, i) => (
                    <PaginationItem key={i} className="hidden sm:block">
                      <PaginationLink 
                        isActive={page === i}
                        onClick={() => setPage(i)}
                        className="cursor-pointer"
                      >
                        {i + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}

                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => page < totalPages - 1 && setPage(page + 1)}
                      className={page >= totalPages - 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
              <div className="text-center mt-4 text-xs text-muted-foreground sm:hidden">
                Page {page + 1} of {totalPages}
              </div>
            </div>
          )}
        </div>
      )}

      {/* QR Dialog */}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl glass-panel shadow-2xl border-white/10 p-0 bg-background/95 backdrop-blur-3xl">
          <div className="p-6 border-b border-white/5 bg-foreground/5 pointer-events-none">
             <DialogHeader>
                <DialogTitle className="text-xl font-bold">{editId ? "Edit Customer" : "Add Customer"}</DialogTitle>
             </DialogHeader>
          </div>
          <div className="p-6 space-y-5">
            <div className="space-y-2">
               <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full Name *</Label>
               <Input className="rounded-xl h-11 bg-background/50 border-white/10 focus-visible:ring-emerald-500" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                 <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label>
                 <Input className="rounded-xl h-11 bg-background/50 border-white/10 focus-visible:ring-emerald-500" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" />
              </div>
              <div className="space-y-2">
                 <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phone</Label>
                 <Input className="rounded-xl h-11 bg-background/50 border-white/10 focus-visible:ring-emerald-500" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+234..." />
              </div>
            </div>
            <CustomerMatchHint
              name={form.name}
              phone={form.phone}
              excludeId={editId}
              onPick={(c) => {
                // Edit the record on file instead of adding a second one
                setEditId(c.id);
                setForm({
                  name: c.name ?? "",
                  email: c.email ?? "",
                  phone: c.phone ?? "",
                  address: c.address ?? "",
                  notes: "",
                  signature_data: "",
                });
                toast.info(`Editing the existing record for ${c.name}`);
              }}
            />
            <div className="space-y-2">
               <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Address</Label>
               <Input className="rounded-xl h-11 bg-background/50 border-white/10 focus-visible:ring-emerald-500" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St..." />
            </div>
            <div className="space-y-2">
               <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Internal Notes</Label>
               <Textarea className="rounded-xl min-h-[80px] bg-background/50 border-white/10 focus-visible:ring-emerald-500" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Any preference or additional info..." />
            </div>
            <div className="space-y-2">
               <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Electronic Signature</Label>
               <div className="rounded-xl overflow-hidden border border-white/10">
                 <SignaturePad
                          label="Customer" value={form.signature_data} onChange={(v) => setForm({ ...form, signature_data: v })} />
               </div>
            </div>
          </div>
          <div className="p-6 border-t border-white/5 bg-foreground/5 flex justify-end gap-3">
            <Button variant="ghost" onClick={resetForm} className="rounded-xl hover:bg-white/5">Clear</Button>
            <Button variant="outline" onClick={closeDialog} className="rounded-xl border-white/10 hover:bg-white/5">Cancel</Button>
            <Button onClick={() => upsertMutation.mutate()} disabled={!form.name || upsertMutation.isPending} className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white border-0 shadow-lg shadow-emerald-500/20">{editId ? "Save Changes" : "Create Customer"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-3xl glass-panel border-white/10 p-6 shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-foreground">Delete Customer</AlertDialogTitle>
            <AlertDialogDescription className="text-base text-muted-foreground">
              Are you sure you want to permanently delete this customer record? All associated data might be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2">
            <AlertDialogCancel className="rounded-xl border-white/10 text-foreground hover:bg-white/5 sm:mt-0">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteMutation.mutate(deleteId); setDeleteId(null); }} className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/20 border-none">
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
