import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { makes, getModelsForMake, years } from "@/data/vehicleData";

interface Props {
  make: string;
  model: string;
  year: string;
  onMakeChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onYearChange: (value: string) => void;
  errors?: { make?: string; model?: string; year?: string };
  required?: { make?: boolean; model?: boolean; year?: boolean };
}

export default function VehicleMakeModelSelector({
  make,
  model,
  year,
  onMakeChange,
  onModelChange,
  onYearChange,
  errors = {},
  required = {},
}: Props) {
  const models = make ? getModelsForMake(make) : [];

  return (
    <>
      {/* Make Input */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">
          Make {required.make && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          list="makes-list"
          value={make}
          onChange={(e) => {
            onMakeChange(e.target.value);
            // Optionally clear model if they type a completely new make, 
            // but for pure text inputs, we can just leave it as is.
          }}
          placeholder="e.g. Toyota, Ford, Acura"
          className="rounded-xl"
          autoComplete="off"
        />
        <datalist id="makes-list">
          {makes.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {errors.make && <p className="text-sm text-destructive">{errors.make}</p>}
      </div>

      {/* Model Input */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">
          Model {required.model && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          list="models-list"
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
          placeholder="e.g. Camry, F-150, MDX"
          className="rounded-xl"
          autoComplete="off"
        />
        <datalist id="models-list">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {errors.model && <p className="text-sm text-destructive">{errors.model}</p>}
      </div>

      {/* Year Input */}
      <div className="space-y-1">
        <Label className="text-xs font-medium">
          Year {required.year && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          list="years-list"
          value={year}
          onChange={(e) => onYearChange(e.target.value)}
          placeholder="e.g. 2023"
          className="rounded-xl"
          autoComplete="off"
        />
        <datalist id="years-list">
          {years.map((y) => (
            <option key={y} value={y} />
          ))}
        </datalist>
        {errors.year && <p className="text-sm text-destructive">{errors.year}</p>}
      </div>
    </>
  );
}
