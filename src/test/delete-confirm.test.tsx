import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DeleteConfirmDialog, phraseMatches } from "@/components/DeleteConfirm";

describe("type-to-confirm delete", () => {
  it("accepts only the exact word, any case, ignoring spaces at the ends", () => {
    expect(phraseMatches("DELETE")).toBe(true);
    expect(phraseMatches(" delete ")).toBe(true);
    expect(phraseMatches("DELET")).toBe(false);
    expect(phraseMatches("")).toBe(false);
  });

  it("keeps the Delete button off until DELETE is typed", () => {
    const onConfirm = vi.fn();
    render(<DeleteConfirmDialog open onOpenChange={() => {}} title="Delete this sale?" confirmLabel="Delete sale" onConfirm={onConfirm} />);
    const button = screen.getByRole("button", { name: /delete sale/i });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("DELETE"), { target: { value: "dele" } });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText("DELETE"), { target: { value: "DELETE" } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
