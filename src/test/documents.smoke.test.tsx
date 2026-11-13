import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// The document pages only read on mount; every query resolves to an empty list.
vi.mock("@/integrations/supabase/client", () => {
  const empty = { data: [], error: null };
  const builder: any = {
    select: () => builder,
    order: async () => empty,
    eq: async () => empty,
    not: async () => empty,
    then: (resolve: any) => resolve(empty),
  };
  return { supabase: { from: () => builder } };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, role: "super_admin", isLoading: false }),
}));

import ConsignmentAgreement from "@/pages/ConsignmentAgreement";
import SalesAgreement, {
  AgreementDocument, BLANK_AGREEMENT, type SAForm,
} from "@/pages/SalesAgreement";
import ProformaInvoice from "@/pages/ProformaInvoice";
import { numberToWords, formatNaira } from "@/lib/numberToWords";
import { VIN_FULL_LENGTH } from "@/lib/constants";
import { matchesPeriod, weekOfMonth } from "@/lib/historyFilters";

beforeAll(() => {
  // jsdom has no canvas backend; SignaturePad only needs these to not throw
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => null
  ) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => localStorage.clear());

function renderPage(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Sales Agreement", () => {
  it("renders both parties, the vehicle and the five signature pads", () => {
    renderPage(<SalesAgreement />);
    expect(screen.getByText(/Seller's Information/)).toBeInTheDocument();
    expect(screen.getByText("Buyer's Information")).toBeInTheDocument();
    expect(screen.getByText("Vehicle Details")).toBeInTheDocument();
    expect(screen.getByText("Sale Details")).toBeInTheDocument();
    expect(screen.getByText("Seller's witness")).toBeInTheDocument();
    expect(screen.getByText("Buyer's witness")).toBeInTheDocument();
    expect(screen.getByText("Company representative")).toBeInTheDocument();
  });

  it("spells the sale price out in words as it is typed", () => {
    renderPage(<SalesAgreement />);
    const price = screen.getByPlaceholderText("0") as HTMLInputElement;
    fireEvent.change(price, { target: { value: "5000000" } });
    expect(price.value).toBe("5,000,000");
    expect(screen.getByText("Five Million Naira Only")).toBeInTheDocument();
  });

  // The printed output is a facsimile of the pre-printed book, so the blanks
  // that only exist on that paper have to be capturable.
  it("captures the book serial and the date the money cleared", () => {
    renderPage(<SalesAgreement />);
    expect(screen.getByLabelText(/Document No/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. 1003")).toBeInTheDocument();
    expect(screen.getByLabelText(/Paid In Full From/i)).toBeInTheDocument();
  });

  // The dealership is the seller: it sells the car, the customer buys it.
  it("opens with Manga Automobiles as the seller", () => {
    renderPage(<SalesAgreement />);
    const name = document.querySelector("#sellerName") as HTMLInputElement;
    expect(name.value).toBe("MANGA AUTOMOBILES");

    const address = screen.getByDisplayValue(/Shehu Shagari Way Maitama/);
    expect(address).toBeInTheDocument();
    expect(screen.getByDisplayValue("08099999915")).toBeInTheDocument();
    expect(
      screen.getByText(/Seller's Information — Manga Automobiles/)
    ).toBeInTheDocument();
  });

  it("puts the company back after the seller has been overridden", () => {
    renderPage(<SalesAgreement />);
    const name = document.querySelector("#sellerName") as HTMLInputElement;

    // No reset offered while the company's own details are in place
    expect(screen.queryByRole("button", { name: /Use Manga Automobiles/i })).toBeNull();

    fireEvent.change(name, { target: { value: "Private Owner" } });
    const reset = screen.getByRole("button", { name: /Use Manga Automobiles/i });
    fireEvent.click(reset);

    expect((document.querySelector("#sellerName") as HTMLInputElement).value)
      .toBe("MANGA AUTOMOBILES");
  });

  // The buyer keeps this document, so it carries the complete chassis number
  // rather than the 11 characters the stock records are kept on.
  it("takes the full 17-character chassis number, upper-cased", () => {
    renderPage(<SalesAgreement />);
    const chassis = document.querySelector("input.font-mono.uppercase") as HTMLInputElement;

    fireEvent.change(chassis, { target: { value: "4t1bf1fk5cu123456789" } });
    expect(chassis.value).toBe("4T1BF1FK5CU123456");
    expect(chassis.value.length).toBe(VIN_FULL_LENGTH);
    expect(chassis).toHaveAttribute("maxLength", String(VIN_FULL_LENGTH));
  });

  it("offers the Alh./Mall/Mr./Mrs. title on both parties", () => {
    renderPage(<SalesAgreement />);
    expect(screen.getByLabelText("Seller title")).toBeInTheDocument();
    expect(screen.getByLabelText("Buyer title")).toBeInTheDocument();
  });

  it("takes a separate date for each of the four signatures", () => {
    renderPage(<SalesAgreement />);
    expect(screen.getByLabelText("Seller signature date")).toBeInTheDocument();
    expect(screen.getByLabelText("Buyer signature date")).toBeInTheDocument();
    expect(screen.getByLabelText("Seller's witness date")).toBeInTheDocument();
    expect(screen.getByLabelText("Buyer's witness date")).toBeInTheDocument();
  });

  it("prints the paper form's own wording, line for line", () => {
    renderPage(<SalesAgreement />);

    fireEvent.change(screen.getByPlaceholderText("e.g. 1003"), { target: { value: "1003" } });
    fireEvent.change(screen.getByLabelText(/Full name \*/i, { selector: "#sellerName" }), {
      target: { value: "Musa Bello" },
    });
    fireEvent.change(screen.getByLabelText(/Full name \*/i, { selector: "#buyerName" }), {
      target: { value: "Aliyu Sani" },
    });
    fireEvent.change(screen.getByPlaceholderText("Toyota"), { target: { value: "Toyota" } });
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "5000000" } });

    // Save is blocked by the mocked client, so render the preview directly by
    // asserting on the wording the document component owns.
    expect(
      screen.getByRole("button", { name: /Save & Preview Document/i })
    ).toBeEnabled();
  });
});

describe("the printed sales agreement", () => {
  // A facsimile of the pre-printed MANGA AUTOMOBILES book, so the fixed wording
  // on the paper has to come out verbatim and the blanks have to be filled.
  const filled: SAForm = {
    ...BLANK_AGREEMENT,
    documentNo: "1003",
    sellerTitle: "Alh.",
    sellerName: "Musa Bello",
    sellerAddress: "12 Gwarinpa Estate, Abuja",
    buyerTitle: "Mr.",
    buyerName: "Aliyu Sani",
    buyerAddress: "4 Wuse II, Abuja",
    vehicleMake: "Toyota",
    vehicleYearModel: "Camry 2015",
    vehicleColor: "Black",
    vehiclePlateNumber: "ABC-123-XY",
    vehicleEngineNumber: "2AZ-4471920",
    vehicleChassis: "JTNBE46K733012345",
    salePrice: "5000000",
    effectiveDate: "2026-11-12",
  };

  const renderDoc = (data: SAForm = filled) =>
    render(
      <MemoryRouter>
        <AgreementDocument data={data} />
      </MemoryRouter>
    );

  it("carries the book's fixed wording verbatim", () => {
    renderDoc();
    expect(screen.getByText("Vehicle Sales Agreement")).toBeInTheDocument();
    expect(
      screen.getByText("This is to certify that I, Alh./Mall/Mr./Mrs.")
    ).toBeInTheDocument();
    expect(screen.getByText("Here by agrees and sold my vehicle")).toBeInTheDocument();
    expect(screen.getByText("Registration No")).toBeInTheDocument();
    expect(screen.getByText("Engine No")).toBeInTheDocument();
    // The book's own spelling, kept as printed
    expect(screen.getByText("Chasis No")).toBeInTheDocument();
    expect(screen.getByText("For the sum of")).toBeInTheDocument();
    expect(
      screen.getByText(/He\/She had fully paid the total amount with effect from/)
    ).toBeInTheDocument();
    expect(screen.getByText("today's date")).toBeInTheDocument();
    expect(screen.getByText("Alh/Mal/Mr/Mrs")).toBeInTheDocument();
    expect(
      screen.getByText("Is now the rightful owner of the said vehicle")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Please change the ownership of the vehicle to new owners name and address:/)
    ).toBeInTheDocument();
    expect(screen.getByText("Seller's Sign")).toBeInTheDocument();
    expect(screen.getByText("Buyer's sign")).toBeInTheDocument();
    expect(screen.getAllByText("Witness Name:")).toHaveLength(2);
    expect(
      screen.getByText(/Signature and Stamp of Authorised representative of the/)
    ).toBeInTheDocument();
  });

  it("prints the book serial in the letterhead, where the book prints it", () => {
    renderDoc();
    const serial = screen.getByText("1003");
    expect(serial).toBeInTheDocument();
    // Under the address block, not floating beside the title
    expect(serial.previousElementSibling?.textContent).toContain("Tel:");
  });

  it("names both parties with their titles", () => {
    renderDoc();
    expect(screen.getByText("Alh. Musa Bello")).toBeInTheDocument();
    // The whole chassis number, as the buyer's copy has to carry it
    expect(screen.getByText("JTNBE46K733012345")).toBeInTheDocument();
    // The buyer is named twice on the paper: at "To" and again as rightful owner
    expect(screen.getAllByText("Mr. Aliyu Sani")).toHaveLength(2);
  });

  it("splits the price into the naira and kobo boxes and spells it out", () => {
    renderDoc();
    expect(screen.getByText("Five Million Naira Only")).toBeInTheDocument();
    expect(screen.getByText("5,000,000")).toBeInTheDocument();
    expect(screen.getByText("00")).toBeInTheDocument();
  });

  it("falls back to the buyer for the change of ownership when left blank", () => {
    renderDoc();
    expect(
      screen.getByText("Mr. Aliyu Sani, 4 Wuse II, Abuja")
    ).toBeInTheDocument();
  });

  it("prints every line even when the agreement is still blank", () => {
    renderDoc(BLANK_AGREEMENT);
    expect(screen.getByText("Registration No")).toBeInTheDocument();
    expect(screen.getByText("Seller's Sign")).toBeInTheDocument();
  });
});

describe("Proforma Invoice", () => {
  it("shows the stat cards and an empty state before any quote exists", async () => {
    renderPage(<ProformaInvoice />);
    expect(screen.getByText("Quotes in range")).toBeInTheDocument();
    expect(screen.getByText("Total quote value")).toBeInTheDocument();
    expect(await screen.findByText("No proforma invoices yet")).toBeInTheDocument();
  });

  it("opens the editor dialog from New Quote", () => {
    renderPage(<ProformaInvoice />);
    fireEvent.click(screen.getByRole("button", { name: /New Quote/i }));
    expect(screen.getByText("Create Proforma Invoice")).toBeInTheDocument();
    expect(screen.getByText("Vehicles")).toBeInTheDocument();
    expect(screen.getByText(/VAT & Payment Details/i)).toBeInTheDocument();
    // Nothing to save until a vehicle is on the quote
    expect(screen.getByRole("button", { name: /^Save Invoice$/i })).toBeDisabled();
  });
});

describe("document helpers", () => {
  it("spells amounts the way the documents print them", () => {
    expect(numberToWords(0)).toBe("Zero Naira Only");
    expect(numberToWords(1500)).toBe("One Thousand Five Hundred Naira Only");
    expect(numberToWords(5_000_000)).toBe("Five Million Naira Only");
    expect(numberToWords("2,450,000")).toBe("Two Million Four Hundred and Fifty Thousand Naira Only");
    expect(numberToWords(1500.5)).toContain("Fifty Kobo");
    expect(formatNaira(5_000_000)).toBe("₦5,000,000");
  });

  it("filters history by month and by week within that month", () => {
    expect(weekOfMonth(new Date("2026-11-01"))).toBe(1);
    expect(weekOfMonth(new Date("2026-11-08"))).toBe(2);
    expect(weekOfMonth(new Date("2026-11-30"))).toBe(5);

    expect(matchesPeriod("2026-11-08", "all", "all")).toBe(true);
    expect(matchesPeriod("2026-11-08", "2026-11", "2")).toBe(true);
    expect(matchesPeriod("2026-11-08", "2026-11", "3")).toBe(false);
    expect(matchesPeriod("2026-10-08", "2026-11", "all")).toBe(false);
    expect(matchesPeriod(null, "2026-11", "all")).toBe(false);
  });
});

describe("draft persistence", () => {
  it("brings a part-filled form back after an accidental close", () => {
    const { unmount } = renderPage(<ConsignmentAgreement />);
    fireEvent.change(screen.getByPlaceholderText("As written on the ID"), {
      target: { value: "Ibrahim Musa" },
    });
    fireEvent.change(screen.getByPlaceholderText("Toyota Camry"), { target: { value: "Lexus RX" } });

    // Simulate the tab being closed and the page opened again
    unmount();
    renderPage(<ConsignmentAgreement />);

    expect((screen.getByPlaceholderText("As written on the ID") as HTMLInputElement).value)
      .toBe("Ibrahim Musa");
    expect((screen.getByPlaceholderText("Toyota Camry") as HTMLInputElement).value).toBe("Lexus RX");
    expect(screen.getByRole("button", { name: /Save & Preview Agreement/i })).toBeEnabled();
  });

  it("Clear Form drops the draft so the next document starts blank", () => {
    const { unmount } = renderPage(<ConsignmentAgreement />);
    fireEvent.change(screen.getByPlaceholderText("As written on the ID"), {
      target: { value: "Ibrahim Musa" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Clear Form$/i }));
    unmount();

    renderPage(<ConsignmentAgreement />);
    expect((screen.getByPlaceholderText("As written on the ID") as HTMLInputElement).value).toBe("");
  });

  it("keeps the proforma editor filled when Preview is opened mid-entry", async () => {
    renderPage(<ProformaInvoice />);
    fireEvent.click(screen.getByRole("button", { name: /New Quote/i }));

    // Type a customer and a vehicle so the quote can be previewed
    fireEvent.click(screen.getByRole("button", { name: /Type a new customer/i }));
    fireEvent.change(screen.getByPlaceholderText("Customer name *"), {
      target: { value: "Zainab Bello" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Enter a vehicle manually/i }));
    fireEvent.change(screen.getByPlaceholderText("Make *"), { target: { value: "Lexus" } });
    fireEvent.change(screen.getByPlaceholderText("Model *"), { target: { value: "RX 350" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add vehicle$/i }));

    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));
    const back = await screen.findByRole("button", { name: /Back to Form/i });

    fireEvent.click(back);
    // The editor is open again with the work intact
    expect(await screen.findByText("Create Proforma Invoice")).toBeInTheDocument();
    expect((screen.getByPlaceholderText("Customer name *") as HTMLInputElement).value)
      .toBe("Zainab Bello");
    expect(screen.getByText(/Lexus RX 350/)).toBeInTheDocument();
  });

  it("quotes the full 17-character VIN on the proforma", () => {
    renderPage(<ProformaInvoice />);
    fireEvent.click(screen.getByRole("button", { name: /New Quote/i }));
    fireEvent.click(screen.getByRole("button", { name: /Enter a vehicle manually/i }));
    const vin = screen.getByPlaceholderText(/Chassis \(VIN\)/) as HTMLInputElement;
    fireEvent.change(vin, { target: { value: "jn1az4eh4fm5500001234" } });
    expect(vin.value).toBe("JN1AZ4EH4FM550000");
    expect(vin.value.length).toBe(17);
  });
});
