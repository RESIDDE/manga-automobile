import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { RecordActions } from "@/components/RecordActions";

const renderActions = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

/** Radix opens on pointerdown, which jsdom cannot synthesise; Enter is equivalent. */
async function openMenu(name = /More actions/i) {
  fireEvent.keyDown(await screen.findByRole("button", { name }), { key: "Enter" });
  return within(await screen.findByRole("menu"));
}

describe("RecordActions", () => {
  it("gives each primary action its own button", () => {
    renderActions(
      <RecordActions
        primary={[
          { label: "Preview", icon: Eye, onClick: () => {} },
          { label: "Edit", icon: Pencil, onClick: () => {} },
        ]}
      />
    );
    expect(screen.getByRole("button", { name: /Preview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument();
  });

  it("keeps the rest behind one overflow menu", async () => {
    renderActions(
      <RecordActions
        primary={[{ label: "Preview", icon: Eye, onClick: () => {} }]}
        menu={[{ label: "Delete", icon: Trash2, onClick: () => {}, destructive: true }]}
      />
    );
    // Not in the DOM until the menu is opened — that is the point of it
    expect(screen.queryByText("Delete")).toBeNull();

    const menu = await openMenu();
    expect(menu.getByRole("menuitem", { name: /Delete/i })).toBeInTheDocument();
  });

  it("runs a primary action when it is clicked", () => {
    const onClick = vi.fn();
    renderActions(<RecordActions primary={[{ label: "Preview", icon: Eye, onClick }]} />);
    fireEvent.click(screen.getByRole("button", { name: /Preview/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("runs a menu action when it is chosen", async () => {
    const onClick = vi.fn();
    renderActions(
      <RecordActions
        primary={[{ label: "Preview", icon: Eye, onClick: () => {} }]}
        menu={[{ label: "Delete", icon: Trash2, onClick, destructive: true }]}
      />
    );
    const menu = await openMenu();
    fireEvent.click(menu.getByRole("menuitem", { name: /Delete/i }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  // show: false is how the permission matrix hides an action
  it("leaves out an action the role may not perform", async () => {
    renderActions(
      <RecordActions
        primary={[
          { label: "Preview", icon: Eye, onClick: () => {} },
          { label: "Edit", icon: Pencil, onClick: () => {}, show: false },
        ]}
        menu={[{ label: "Delete", icon: Trash2, onClick: () => {}, show: false }]}
      />
    );
    expect(screen.queryByRole("button", { name: /Edit/i })).toBeNull();
    // With every menu action hidden there is no menu button at all
    expect(screen.queryByRole("button", { name: /More actions/i })).toBeNull();
  });

  it("renders nothing when the role may do nothing", () => {
    const { container } = renderActions(
      <RecordActions
        primary={[{ label: "Edit", icon: Pencil, onClick: () => {}, show: false }]}
        menu={[{ label: "Delete", icon: Trash2, onClick: () => {}, show: false }]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("navigates in-app rather than reloading the page", () => {
    renderActions(
      <RecordActions primary={[{ label: "Details", icon: Eye, to: "/vehicles/42" }]} />
    );
    const link = screen.getByRole("link", { name: /Details/i });
    expect(link).toHaveAttribute("href", "/vehicles/42");
  });

  it("links from inside the menu too", async () => {
    renderActions(
      <RecordActions
        primary={[{ label: "Details", icon: Eye, to: "/vehicles/42" }]}
        menu={[{ label: "Edit car", icon: Pencil, to: "/vehicles/42/edit" }]}
      />
    );
    const menu = await openMenu();
    expect(menu.getByRole("menuitem", { name: /Edit car/i }))
      .toHaveAttribute("href", "/vehicles/42/edit");
  });
});
