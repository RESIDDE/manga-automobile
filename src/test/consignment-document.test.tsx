import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConsignmentDocument } from "@/pages/ConsignmentAgreement";

const base: any = {
  agreementDate: "2026-11-20", documentNo: "002", companyRep: "Muhammad Manga (CEO)",
  companyAddress: "", companyPhone: "", ownerName: "Ada Obi", ownerAddress: "", ownerPhone: "",
  ownerIdNumber: "", vehicleMakeModel: "Toyota Camry", vehicleYear: "2018", vehicleColor: "Black",
  vehicleChassis: "4T1BF1FK5CU123456", vehicleMileage: "85,000 km", vehicleCondition: "foreign_used",
  agreedPrice: "5000000", commissionAmount: "0", commissionNote: "", withdrawalDays: "3",
  withdrawalCharge: "100000", notes: "", companySignature: "", companySignDate: "", ownerSignature: "",
  ownerSignName: "", ownerSignDate: "", witnessSignature: "", witnessName: "",
};

describe("Consignment agreement document", () => {
  it("prints the mileage and the condition in words", () => {
    render(<ConsignmentDocument data={base} />);
    expect(screen.getByText("85,000 km")).toBeInTheDocument();
    expect(screen.getByText("Foreign Used")).toBeInTheDocument();
  });

  it("carries the fuel / EV charge clause before the general terms", () => {
    const { container } = render(<ConsignmentDocument data={{ ...base, vehicleCondition: "brand_new" }} />);
    expect(screen.getByText("Brand New")).toBeInTheDocument();
    const text = container.textContent ?? "";
    expect(text).toMatch(/5\. CONDITION FOR DISPLAY\./);
    expect(text).toMatch(/at least half a tank of fuel/);
    expect(text).toMatch(/60% to 70%/);
    expect(text.indexOf("5. CONDITION FOR DISPLAY")).toBeLessThan(text.indexOf("6. GENERAL TERMS"));
  });
});
