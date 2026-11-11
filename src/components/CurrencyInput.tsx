import React, { useState, useEffect } from "react";
import { Input } from "./ui/input";

export type CurrencyInputProps = Omit<React.ComponentProps<"input">, "onChange"> & { 
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void 
};

export function CurrencyInput({
  value,
  onChange,
  className,
  placeholder,
  ...props
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState("");

  useEffect(() => {
    // When the raw value changes from outside, format it for display
    if (value === undefined || value === null || value === "") {
      setDisplayValue("");
    } else {
      // Remove any non-digit chars (except decimal point if we wanted to support it, but assuming whole numbers or limited decimals)
      const numericString = value.toString().replace(/,/g, "");
      const isNegative = numericString.startsWith("-");
      const cleanNumericString = numericString.replace(/[^\d.]/g, "");
      
      const parts = cleanNumericString.split(".");
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      
      const formatted = (isNegative ? "-" : "") + parts.join(".");
      if (formatted !== displayValue) {
        setDisplayValue(formatted);
      }
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawValue = e.target.value;
    
    // Check if it's negative
    const isNegative = rawValue.startsWith("-");
    const cleanRawValue = rawValue.replace(/[^\d.]/g, "");
    
    // Create new event with unformatted value. `name` and `id` are copied
    // explicitly: spreading a DOM element yields no own properties, so a parent
    // using a generic `handleChange` keyed by `e.target.name` would see undefined.
    const newEvent = {
       ...e,
       target: {
         ...e.target,
         name: e.target.name,
         id: e.target.id,
         value: (isNegative ? "-" : "") + cleanRawValue
       }
    };
    
    onChange(newEvent as React.ChangeEvent<HTMLInputElement>);
  };

  return (
    <Input
      type="text"
      value={displayValue}
      onChange={handleChange}
      className={className}
      placeholder={placeholder}
      {...props}
    />
  );
}
