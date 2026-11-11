import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Calendar, Upload, User, Phone, Mail, FileText, CheckCircle2, 
  Loader2, ArrowRight, MessageSquare, Briefcase, X
} from "lucide-react";
import { toast } from "sonner";
import logoPrint from "@/assets/logo-print.png";

export default function PublicBooking() {
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    intent: "",
    bookingDate: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 10 * 1024 * 1024) { // 10MB limit
        toast.error("File is too large. Max limit is 10MB.");
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let proposalUrl = "";

      // 1. Upload file if exists
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `public_submissions/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('proposals')
          .upload(filePath, file);

        if (uploadError) throw new Error("Failed to upload proposal: " + uploadError.message);
        proposalUrl = filePath;
      }

      // 2. Validate Date
      const bookingDate = new Date(formData.bookingDate);
      if (isNaN(bookingDate.getTime())) {
        throw new Error("Please select a valid meeting date.");
      }

      // 3. Insert into meetings table
      const { error: insertError } = await (supabase as any)
        .from('meetings')
        .insert([{
          full_name: formData.fullName,
          contact_info: `Phone: ${formData.phone} | Email: ${formData.email}`,
          intent: formData.intent,
          proposal_url: proposalUrl,
          booking_date: bookingDate.toISOString(),
          status: 'Pending'
        }]);

      if (insertError) throw insertError;

      setSubmitted(true);
      toast.success("Meeting request submitted successfully!");
    } catch (error: any) {
      console.error("Booking Error:", error);
      toast.error(error.message || "Failed to submit request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div 
          className="bg-white p-12 rounded-[2.5rem] border border-gray-200 shadow-2xl max-w-lg w-full relative overflow-hidden animate-in fade-in zoom-in-95 duration-700"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />
          <div className="bg-emerald-500/20 p-6 rounded-full w-fit mx-auto mb-8 relative">
            <CheckCircle2 className="h-16 w-16 text-emerald-500" />
          </div>
          <h2 className="text-4xl font-black mb-4 tracking-tight text-gray-900">Request Received!</h2>
          <p className="text-gray-500 text-lg mb-10 leading-relaxed">
            Thank you for reaching out to Manga Automobiles. Our team will review your proposal and get back to you shortly.
          </p>
          <Button 
            onClick={() => window.location.reload()}
            size="lg"
            className="rounded-2xl h-14 px-10 bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-all shadow-lg shadow-emerald-500/20"
          >
            Submit Another Request
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 relative overflow-hidden selection:bg-amber-500/30">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-amber-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
      
      <header className="p-4 sm:p-6 md:p-10 z-20 sticky top-0 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoPrint} alt="Manga Automobiles" className="h-9 sm:h-11 w-auto object-contain shrink-0" />
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tighter uppercase leading-none text-gray-900">MANGA</h1>
              <p className="text-[10px] uppercase font-bold tracking-[0.3em] text-amber-500 mt-1">Automobiles</p>
            </div>
          </div>
          <div className="hidden md:flex gap-6 items-center">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Professional Inquiries</span>
            <div className="h-1 w-1 rounded-full bg-gray-300" />
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Partnership Proposals</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-16 items-start relative z-10">
        <div className="space-y-10 animate-fade-up">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 text-amber-600 text-xs font-bold uppercase tracking-widest border border-amber-500/20">
              <Briefcase className="h-3.5 w-3.5" /> Work with us
            </span>
            <h2 className="text-6xl md:text-7xl font-black tracking-tight leading-[0.9] text-gray-900">
              Let's build <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 uppercase">something great.</span>
            </h2>
            <p className="text-xl text-gray-500 max-w-lg leading-relaxed pt-2 border-l-2 border-amber-500/40 pl-6 italic">
              Share your proposal with our investment and management team. We review every submission for potential synergy.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm hover:border-amber-500/40 hover:shadow-md transition-all group">
              <Calendar className="h-10 w-10 text-amber-500 mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-lg mb-1 text-gray-900">Strategic Meetings</h4>
              <p className="text-sm text-gray-500 leading-relaxed">Book a consultation with our experts to discuss logistics or vehicle procurement.</p>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm hover:border-blue-500/30 hover:shadow-md transition-all group">
              <FileText className="h-10 w-10 text-blue-500 mb-4 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-lg mb-1 text-gray-900">Proposal Drop</h4>
              <p className="text-sm text-gray-500 leading-relaxed">Submit your business plan or service proposal directly to our decision makers.</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-gray-200 shadow-xl relative overflow-hidden animate-fade-in">
           <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-[80px] pointer-events-none" />
           
           <h3 className="text-2xl font-bold mb-8 flex items-center gap-3 text-gray-900">
             <MessageSquare className="h-6 w-6 text-amber-500" /> Intake Form
           </h3>

           <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input required placeholder="John Doe" className="pl-12 h-14 rounded-2xl bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400 focus-visible:ring-amber-500 focus-visible:border-amber-500 transition-all" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1">Contact Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input required placeholder="+234..." className="pl-12 h-14 rounded-2xl bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400 focus-visible:ring-amber-500 focus-visible:border-amber-500 transition-all" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input required type="email" placeholder="john@example.com" className="pl-12 h-14 rounded-2xl bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400 focus-visible:ring-amber-500 focus-visible:border-amber-500 transition-all" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1">Meeting Intent / Summary</Label>
                <Textarea required placeholder="Tell us why you'd like to meet or what your proposal covers..." className="min-h-[120px] rounded-2xl bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400 focus-visible:ring-amber-500 focus-visible:border-amber-500 transition-all resize-none p-5" value={formData.intent} onChange={e => setFormData({...formData, intent: e.target.value})} />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1">Preferred Meeting Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input required type="date" className="pl-12 h-14 rounded-2xl bg-gray-50 border-gray-300 text-gray-900 focus-visible:ring-amber-500 focus-visible:border-amber-500 transition-all [color-scheme:light]" value={formData.bookingDate} onChange={e => setFormData({...formData, bookingDate: e.target.value})} />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1">Upload Proposal (PDF/DOCX/Images, Max 10MB)</Label>
                <div className="relative group/file">
                   <div className={`h-24 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center cursor-pointer ${file ? 'border-amber-500/60 bg-amber-50' : 'border-gray-300 hover:border-amber-400 hover:bg-amber-50/50'}`}>
                      <input type="file" onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                      {file ? (
                        <div className="flex items-center gap-3 px-6 w-full overflow-hidden">
                          <FileText className="h-8 w-8 text-amber-500 shrink-0" />
                          <div className="flex-1 truncate">
                             <p className="text-sm font-bold truncate text-gray-800">{file.name}</p>
                             <p className="text-[10px] text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); }} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-6 w-6 text-gray-400 mb-1" />
                          <span className="text-xs font-medium text-gray-400">Click or drag file here</span>
                        </>
                      )}
                   </div>
                </div>
              </div>

              <Button 
                disabled={loading}
                type="submit" 
                size="lg" 
                className="w-full h-16 rounded-[1.5rem] bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-lg shadow-xl shadow-amber-500/20 transition-all active:scale-[0.98] mt-4"
              >
                {loading ? <Loader2 className="h-6 w-6 animate-spin text-white" /> : <><CheckCircle2 className="h-5 w-5 mr-3" /> Submit Meeting Request</>}
              </Button>
              
              <p className="text-[10px] text-center text-gray-400 px-6">
                By submitting, you agree to our professional engagement terms. All proposals are treated as confidential.
              </p>
           </form>
        </div>
      </main>

      <footer className="p-12 border-t border-gray-200 z-20 relative bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
           <div className="flex items-center gap-2">
             <span className="font-black text-sm tracking-widest text-gray-600">MANGA AUTOMOBILES © 2024</span>
           </div>
           <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Crafting Excellence in Automotive Logistics</p>
        </div>
      </footer>
    </div>
  );
}
