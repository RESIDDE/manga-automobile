import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));
const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

import { VinScanner } from "@/components/VinScanner";

const LEAF = {
  vin: "1N4AZ1CP8JC306135", standard: true, checkDigitOk: true, confidence: null,
  fields: { make: "NISSAN", model: "Leaf", year: "2018", trim: null, color: null, fuel_type: "Electric", transmission: null },
  sources: {}, summary: "Hatchback/Liftback/Notchback · 4x2",
  warnings: ["Compare it with the plate."],
};

describe("VinScanner", () => {
  it("only offers a look-up once 11 characters are typed", () => {
    const { rerender } = render(<VinScanner vin="1N4AZ" onResult={() => {}} />);
    expect(screen.getByRole("button", { name: /look up typed vin/i })).toBeDisabled();
    rerender(<VinScanner vin="1N4AZ1CP8JC" onResult={() => {}} />);
    expect(screen.getByRole("button", { name: /look up typed vin/i })).toBeEnabled();
  });

  it("decodes the typed VIN, hands the result to the form and shows what it found", async () => {
    invoke.mockResolvedValueOnce({ data: LEAF, error: null });
    const onResult = vi.fn();
    render(<VinScanner vin="1N4AZ1CP8JC" onResult={onResult} />);

    fireEvent.click(screen.getByRole("button", { name: /look up typed vin/i }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(LEAF));
    expect(invoke).toHaveBeenCalledWith("vin-reader", { body: { vin: "1N4AZ1CP8JC" } });
    expect(screen.getByText("1N4AZ1CP8JC306135")).toBeInTheDocument();
    expect(screen.getByText(/2018 Nissan Leaf · Hatchback/)).toBeInTheDocument();
    expect(screen.getByText(/check digit ok/i)).toBeInTheDocument();
    expect(screen.getByText(/keeps the first 11 characters/)).toBeInTheDocument();
    expect(screen.getByText("Compare it with the plate.")).toBeInTheDocument();
  });

  it("shows the server's message when the read fails, and fills nothing", async () => {
    const context = new Response(JSON.stringify({ error: "The VIN reader is busy. Try again in a moment." }), { status: 503 });
    invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsHttpError", message: "x", context } });
    const onResult = vi.fn();
    render(<VinScanner vin="1N4AZ1CP8JC" onResult={onResult} />);

    fireEvent.click(screen.getByRole("button", { name: /look up typed vin/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("The VIN reader is busy. Try again in a moment."));
    expect(onResult).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /look up typed vin/i })).toBeEnabled();
  });
});
