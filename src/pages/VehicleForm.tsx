import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { X, Upload } from "lucide-react";
import VehicleMakeModelSelector from "@/components/VehicleMakeModelSelector";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { canCreate, canEdit } from "@/lib/permissions";
import { CurrencyInput } from "@/components/CurrencyInput";
import { toast } from "sonner";
import { VIN_MAX_LENGTH } from "@/lib/constants";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { SignaturePad } from "@/components/SignaturePad";
import { logAction } from "@/lib/logger";
import { isMissingSchema, omitKeys, warnOnce } from "@/lib/dbCompat";

interface FormData {
  make: string;
  model: string;
  year: string;
  trim: string;
  vin: string;
  color: string;
  price: string;
  cost_price: string;
  mileage: string;
  fuel_type: string;
  transmission: string;
  status: string;
  description: string;
  date_arrived: string;
  date_stored: string;
  num_keys: string;
  source_company: string;
  source_company_phone: string;
  source_rep_name: string;
  source_rep_phone: string;
  source_rep_signature: string;
  accepted_by_name: string;
  accepted_by_phone: string;
  accepted_date: string;
  accepted_signature: string;
  inventory_type: string;
  condition: string;
}

const emptyForm: FormData = {
  make: "",
  model: "",
  year: new Date().getFullYear().toString(),
  trim: "",
  vin: "",
  color: "",
  price: "0",
  cost_price: "0",
  mileage: "0",
  fuel_type: "Petrol",
  transmission: "Automatic",
  status: "Available",
  description: "",
  date_arrived: "",
  date_stored: "",
  num_keys: "0",
  source_company: "",
  source_company_phone: "",
  source_rep_name: "",
  source_rep_phone: "",
  source_rep_signature: "",
  accepted_by_name: "",
  accepted_by_phone: "",
  accepted_date: "",
  accepted_signature: "",
  inventory_type: "main",
  condition: "Used",
};

export default function VehicleForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // A part-filled vehicle survives an accidental tab close. New vehicles share one
  // draft; an edit is keyed to its record (and still reloads from the row on open).
  const [form, setForm, clearDraft] = useFormPersistence<FormData>(
    "manga_vehicle_draft", emptyForm, isEdit, id
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<{ id: string; image_url: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { role } = useAuth();
  const { permissions } = usePermissions();
  const hasEdit = canEdit(role, "vehicles", permissions);
  const hasCreate = canCreate(role, "vehicles", permissions);

  useEffect(() => {
    if (isEdit && !hasEdit) {
      toast.error("You do not have permission to edit existing vehicles.");
      navigate("/vehicles");
    }
  }, [isEdit, hasEdit, navigate]);

  const { data: vehicle } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  const { data: vehicleImages = [] } = useQuery({
    queryKey: ["vehicle-images", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("vehicle_images")
        .select("*")
        .eq("vehicle_id", id);
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (vehicle) {
      const v = vehicle as any;
      setForm({
        make: v.make || "",
        model: v.model || "",
        year: v.year?.toString() || "",
        trim: v.trim || "",
        vin: v.vin || "",
        color: v.color || "",
        price: v.price?.toString() || "0",
        cost_price: v.cost_price?.toString() || "0",
        mileage: v.mileage?.toString() || "0",
        fuel_type: v.fuel_type || "Petrol",
        transmission: v.transmission || "Manual",
        status: v.status || "Available",
        description: v.description || "",
        date_arrived: v.date_arrived || "",
        date_stored: v.date_stored || "",
        source_company_phone: v.source_company_phone || "",
        source_rep_name: v.source_rep_name || "",
        source_rep_phone: v.source_rep_phone || "",
        source_rep_signature: v.source_rep_signature || "",
        accepted_by_name: v.accepted_by_name || "",
        accepted_by_phone: v.accepted_by_phone || "",
        accepted_date: v.accepted_date || "",
        accepted_signature: v.accepted_signature || "",
        inventory_type: v.inventory_type || "main",
        num_keys: v.num_keys?.toString() || "0",
        source_company: v.source_company || "",
        condition: v.condition || "Used",
      });
    }
  }, [vehicle]);

  useEffect(() => {
    if (vehicleImages.length > 0) {
      setExistingImages(vehicleImages);
    }
  }, [vehicleImages]);

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.make.trim()) e.make = "Make is required";
    if (!form.model.trim()) e.model = "Model is required";
    if (!form.year || isNaN(Number(form.year))) e.year = "Valid year required";
    if (form.vin && form.vin.length > VIN_MAX_LENGTH) e.vin = `Chassis number must be ≤${VIN_MAX_LENGTH} characters`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const checkVinUnique = async (): Promise<boolean> => {
    if (!form.vin.trim()) return true;
    const query = supabase
      .from("vehicles")
      .select("id")
      .eq("vin", form.vin.trim());
    if (isEdit) query.neq("id", id!);
    const { data } = await query;
    if (data && data.length > 0) {
      setErrors((prev) => ({ ...prev, vin: "This VIN already exists" }));
      return false;
    }
    return true;
  };

  const uploadImages = async (vehicleId: string) => {
    for (const file of imageFiles) {
      const ext = file.name.split(".").pop();
      const path = `${vehicleId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("vehicle-images")
        .upload(path, file);
      if (uploadError) {
        console.error("Upload error:", uploadError);
        continue;
      }
      const { data: urlData } = supabase.storage
        .from("vehicle-images")
        .getPublicUrl(path);
      await supabase.from("vehicle_images").insert({
        vehicle_id: vehicleId,
        image_url: urlData.publicUrl,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (!(await checkVinUnique())) return;
    setSubmitting(true);

    try {
      // Columns that arrive with a pending migration. If the database does not
      // have them yet, the vehicle is still saved without them.
      const NEW_COLUMNS = [
        "inventory_type", "source_company_phone", "source_rep_name", "source_rep_phone",
        "source_rep_signature", "accepted_by_name", "accepted_by_phone", "accepted_date",
        "accepted_signature",
      ];

      const payload: any = {
        make: form.make.trim(),
        model: form.model.trim(),
        year: parseInt(form.year),
        trim: form.trim.trim() || null,
        vin: form.vin.trim().toUpperCase() || null,
        color: form.color.trim() || null,
        price: parseFloat(form.price) || 0,
        cost_price: parseFloat(form.cost_price) || 0,
        mileage: parseInt(form.mileage) || 0,
        fuel_type: form.fuel_type,
        transmission: form.transmission,
        status: form.status,
        description: form.description.trim() || null,
        date_arrived: form.date_arrived || null,
        date_stored: form.date_stored || null,
        num_keys: parseInt(form.num_keys) || 0,
        source_company: form.source_company.trim() || null,
        source_company_phone: form.source_company_phone.trim() || null,
        source_rep_name: form.source_rep_name.trim() || null,
        source_rep_phone: form.source_rep_phone.trim() || null,
        source_rep_signature: form.source_rep_signature || null,
        accepted_by_name: form.accepted_by_name.trim() || null,
        accepted_by_phone: form.accepted_by_phone.trim() || null,
        accepted_date: form.accepted_date || null,
        accepted_signature: form.accepted_signature || null,
        inventory_type: form.inventory_type || "main",
        condition: form.condition,
      };

      if (isEdit) {
        let { error } = await supabase
          .from("vehicles")
          .update(payload)
          .eq("id", id!);
        if (error && isMissingSchema(error, NEW_COLUMNS)) {
          warnOnce("vehicle_columns", () => toast.warning(
            "Saved without the source and acceptance details — the database migration is still pending."
          ));
          ({ error } = await supabase
            .from("vehicles")
            .update(omitKeys(payload, NEW_COLUMNS))
            .eq("id", id!));
        }
        if (error) throw error;
        await uploadImages(id!);
        toast.success("Vehicle updated successfully");
      } else {
        let { data, error } = await supabase
          .from("vehicles")
          .insert(payload)
          .select()
          .single();
        if (error && isMissingSchema(error, NEW_COLUMNS)) {
          warnOnce("vehicle_columns", () => toast.warning(
            "Saved without the source and acceptance details — the database migration is still pending."
          ));
          ({ data, error } = await supabase
            .from("vehicles")
            .insert(omitKeys(payload, NEW_COLUMNS))
            .select()
            .single());
        }
        if (error) throw error;
        await uploadImages(data.id);
        toast.success("Vehicle added successfully");
      }

      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      await logAction(isEdit ? "UPDATE" : "CREATE", "Vehicle", id ?? null, {
        make: payload.make, model: payload.model, vin: payload.vin,
      });
      clearDraft();
      navigate("/vehicles");
    } catch (err: any) {
      toast.error(err.message || "Failed to save vehicle");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setImageFiles((prev) => [...prev, ...files]);
    files.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImagePreviews((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(f);
    });
  };

  const removeNewImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingImage = async (imgId: string) => {
    await supabase.from("vehicle_images").delete().eq("id", imgId);
    setExistingImages((prev) => prev.filter((img) => img.id !== imgId));
  };

  const field = (
    key: keyof FormData,
    label: string,
    type: string = "text",
    required = false,
    currency = false
  ) => (
    <div className="space-y-1">
      <Label htmlFor={key}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {currency ? (
        <CurrencyInput
          id={key}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      ) : (
        <Input
          id={key}
          type={type}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        />
      )}
      {errors[key] && (
        <p className="text-sm text-destructive">{errors[key]}</p>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-foreground">
        {isEdit ? "Edit Vehicle" : "Add Vehicle"}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Vehicle Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <VehicleMakeModelSelector
              make={form.make}
              model={form.model}
              year={form.year}
              onMakeChange={(v) => setForm({ ...form, make: v })}
              onModelChange={(v) => setForm({ ...form, model: v })}
              onYearChange={(v) => setForm({ ...form, year: v })}
              errors={{ make: errors.make, model: errors.model, year: errors.year }}
              required={{ make: true, model: true, year: true }}
            />
            {field("trim", "Trim / Variant (e.g. LX 600)")}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <Label htmlFor="vin">Chassis Number (VIN)</Label>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${form.vin.length === VIN_MAX_LENGTH ? 'bg-emerald-500 text-white' : 'bg-violet-500/10 text-violet-500'}`}>
                  {form.vin.length} / {VIN_MAX_LENGTH}
                </span>
              </div>
              <Input
                id="vin"
                value={form.vin}
                onChange={(e) => setForm({ ...form, vin: e.target.value.toUpperCase().slice(0, VIN_MAX_LENGTH) })}
                className={`font-mono uppercase transition-all ${form.vin.length === VIN_MAX_LENGTH ? 'border-emerald-500 ring-emerald-500/20' : ''}`}
                placeholder="e.g. JN1AZ4EH4FM"
                maxLength={VIN_MAX_LENGTH}
              />
              {errors.vin && <p className="text-sm text-destructive">{errors.vin}</p>}
            </div>
            {field("color", "Color")}
            {field("mileage", "Mileage", "number")}

            <div className="space-y-1">
              <Label>Fuel Type</Label>
              <Select
                value={form.fuel_type}
                onValueChange={(v) => setForm({ ...form, fuel_type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Petrol">Petrol</SelectItem>
                  <SelectItem value="Diesel">Diesel</SelectItem>
                  <SelectItem value="Electric">Electric</SelectItem>
                  <SelectItem value="Hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Transmission</Label>
              <Select
                value={form.transmission}
                onValueChange={(v) => setForm({ ...form, transmission: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Manual">Manual</SelectItem>
                  <SelectItem value="Automatic">Automatic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pricing & Status</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {field("price", "Selling Price", "text", false, true)}
            {field("cost_price", "Cost Price", "text", false, true)}

            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Available">Available</SelectItem>
                  <SelectItem value="Sold">Sold</SelectItem>
                  <SelectItem value="Reserved">Reserved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Condition</Label>
              <Select
                value={form.condition}
                onValueChange={(v) => setForm({ ...form, condition: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="Used">Used</SelectItem>
                  <SelectItem value="Damaged">Damaged</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventory Info</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {field("date_arrived", "Date Arrived", "date")}
            {field("date_stored", "Date Stored", "date")}
            {field("num_keys", "Number of Keys", "number")}
            <div className="space-y-1">
              <Label htmlFor="inventory_type">Inventory</Label>
              <Select
                value={form.inventory_type}
                onValueChange={(v) => setForm({ ...form, inventory_type: v })}
              >
                <SelectTrigger id="inventory_type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">Stock (for sale)</SelectItem>
                  <SelectItem value="service">Workshop only (not for sale)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Workshop cars stay out of the inventory lists and off every sale and quote picker.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Source Company / Owner</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {field("source_company", "Company / Owner Name")}
            {field("source_company_phone", "Company Phone")}
            {field("source_rep_name", "Representative Name")}
            {field("source_rep_phone", "Representative Phone")}
            <div className="space-y-1 md:col-span-2">
              <Label>Representative Signature</Label>
              <div className="rounded-2xl overflow-hidden border bg-background/50 max-w-md">
                <SignaturePad
                          label="Source representative"
                  value={form.source_rep_signature}
                  onChange={(v) => setForm({ ...form, source_rep_signature: v })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acceptance — who received the vehicle</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {field("accepted_by_name", "Received By")}
            {field("accepted_by_phone", "Phone")}
            {field("accepted_date", "Date Received", "date")}
            <div className="space-y-1 md:col-span-2">
              <Label>Receiver Signature</Label>
              <div className="rounded-2xl overflow-hidden border bg-background/50 max-w-md">
                <SignaturePad
                          label="Received by"
                  value={form.accepted_signature}
                  onChange={(v) => setForm({ ...form, accepted_signature: v })}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Description</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              rows={4}
              placeholder="Additional notes about the vehicle..."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Images</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="cursor-pointer inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent transition-colors">
                <Upload className="h-4 w-4" />
                Choose Files
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
              <span className="text-sm text-muted-foreground">
                {imageFiles.length + existingImages.length} image(s)
              </span>
            </div>

            {(existingImages.length > 0 || imagePreviews.length > 0) && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {existingImages.map((img) => (
                  <div key={img.id} className="relative group">
                    <img
                      src={img.image_url}
                      alt=""
                      className="w-full h-24 object-cover rounded-md border"
                    />
                    <button
                      type="button"
                      onClick={() => removeExistingImage(img.id)}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {imagePreviews.map((src, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={src}
                      alt=""
                      className="w-full h-24 object-cover rounded-md border"
                    />
                    <button
                      type="button"
                      onClick={() => removeNewImage(i)}
                      className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Saving..."
              : isEdit
              ? "Update Vehicle"
              : "Add Vehicle"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/vehicles")}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => { clearDraft(); setForm(emptyForm); toast.success("Form cleared"); }}
          >
            Clear Form
          </Button>
        </div>
      </form>
    </div>
  );
}
