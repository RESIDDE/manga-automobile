import { useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SignaturePad } from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle } from "lucide-react";

export default function SignCustomer() {
  const { id } = useParams<{ id: string }>();
  const [submitted, setSubmitted] = useState(false);
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!signature || !id) return;
    setSaving(true);
    const { error } = await supabase.from("customers").update({ signature_data: signature }).eq("id", id);
    setSaving(false);
    if (error) {
      toast.error("Failed to save signature");
    } else {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md text-center">
          <CardContent className="py-12">
            <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-foreground">Signature Submitted</h2>
            <p className="text-sm text-muted-foreground mt-2">Thank you. You can close this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Customer Signature</CardTitle>
          <p className="text-sm text-muted-foreground text-center">Please sign below to confirm</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <SignaturePad
                          label="Customer" value={signature} onChange={setSignature} />
          <Button onClick={handleSubmit} disabled={!signature || saving} className="w-full rounded-xl">
            {saving ? "Submitting..." : "Submit Signature"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
