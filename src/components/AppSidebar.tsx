import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Car, Users, FileSignature,
  Crown, Calendar, Building2, Search, ChevronsLeft, ChevronsRight,
  ChevronDown, Plus, LogOut,
} from "lucide-react";
import { NairaIcon } from "@/components/NairaIcon";
import { NavLink } from "@/components/NavLink";
import { CommandPalette } from "@/components/CommandPalette";
import { BrandMark, BrandLockup } from "@/components/BrandMark";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { getAccessiblePages, type AppRole, type PageKey } from "@/lib/permissions";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type NavChild = { title: string; url: string; pageKey: PageKey; end?: boolean };
type NavItem = {
  title: string;
  url: string;
  pageKey: PageKey | "settings";
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  children?: NavChild[];
};

const ALL_NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", pageKey: "dashboard", icon: LayoutDashboard, end: true },
  {
    title: "Vehicles", url: "/vehicles", pageKey: "vehicles", icon: Car,
    children: [
      { title: "All Vehicles", url: "/vehicles", pageKey: "vehicles", end: true },
      { title: "Add Vehicle", url: "/vehicles/new", pageKey: "vehicles" },
    ],
  },
  { title: "Sales", url: "/sales", pageKey: "sales", icon: (props) => <NairaIcon {...props} /> },
  { title: "Customers", url: "/customers", pageKey: "customers", icon: Users },
  {
    title: "Documents", url: "/authority-to-sell", pageKey: "authority-to-sell", icon: FileSignature,
    children: [
      { title: "Authority to Sell", url: "/authority-to-sell", pageKey: "authority-to-sell", end: true },
      { title: "Sales Agreement", url: "/sales-agreement", pageKey: "authority-to-sell" },
      { title: "Proforma Invoice", url: "/performance-quotes", pageKey: "performance-quotes" },
    ],
  },
  { title: "Property", url: "/property-intake", pageKey: "property-intake", icon: Building2 },
  { title: "Meetings", url: "/meetings", pageKey: "meetings", icon: Calendar },
];

const ROW = "flex items-center gap-3 rounded-xl px-3 h-10 text-sm font-medium transition-colors duration-200";
const ROW_IDLE = "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground";
const ROW_ACTIVE = "bg-sidebar-accent text-sidebar-foreground font-semibold";

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";

/** Deterministic tint per name so a customer keeps the same chip colour. */
const TINTS = [
  "bg-amber-500/15 text-amber-600", "bg-sky-500/15 text-sky-600", "bg-emerald-500/15 text-emerald-600",
  "bg-violet-500/15 text-violet-600", "bg-rose-500/15 text-rose-600", "bg-teal-500/15 text-teal-600",
];
const tintFor = (s: string) => TINTS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];

export function AppSidebar() {
  const { state, toggleSidebar, isMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const { role, user, profile } = useAuth();
  const { permissions } = usePermissions();
  const location = useLocation();
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);

  const accessible = getAccessiblePages(role as AppRole | null, permissions);
  const isSuperAdmin = role === "super_admin";

  const items = useMemo(
    () =>
      ALL_NAV_ITEMS.filter((i) => accessible.includes(i.pageKey as PageKey)).map((i) => ({
        ...i,
        children: i.children?.filter((c) => accessible.includes(c.pageKey)),
      })),
    [accessible],
  );

  // A group opens by itself when you are somewhere inside it.
  useEffect(() => {
    const owner = items.find((i) => i.children?.some((c) => location.pathname === c.url));
    if (owner && !expanded.includes(owner.title)) setExpanded((prev) => [...prev, owner.title]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const { data: customers = [] } = useQuery({
    queryKey: ["sidebar-customers"],
    enabled: accessible.includes("customers"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers").select("id, name").order("created_at", { ascending: false }).limit(3);
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const displayName = profile?.full_name || profile?.display_name || user?.email?.split("@")[0] || "Admin";
  const roleLabel = (role || "user").replace(/_/g, " ");

  const toggleGroup = (title: string) =>
    setExpanded((prev) => (prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]));

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const sectionLabel = (text: string) => (
    <div className={cn("px-3 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-sidebar-foreground/40",
      collapsed && "text-center px-0")}>
      {collapsed ? <span className="inline-block w-6 border-t border-sidebar-border" /> : text}
    </div>
  );

  return (
    <>
      <Sidebar variant="floating" collapsible="icon" className="border-none">
        {/* ── Brand + collapse handle ─────────────────────────────────── */}
        <SidebarHeader className="relative p-3 pb-1">
          <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
            {collapsed ? <BrandMark size={34} /> : <BrandLockup width={168} className="my-1" />}
          </div>
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute -right-[13px] top-5 z-20 hidden h-6 w-6 place-items-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/60 shadow-sm transition-colors hover:text-sidebar-foreground md:grid"
          >
            {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
          </button>
        </SidebarHeader>

        <SidebarContent className="px-3 pb-2 overflow-x-hidden">
          {/* ── Search ───────────────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={cn(
              "mt-2 flex items-center rounded-xl border border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground hover:bg-sidebar-accent/70",
              collapsed ? "h-10 w-10 justify-center self-center" : "h-10 w-full gap-2.5 px-3",
            )}
          >
            <Search className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="text-sm flex-1 text-left">Search</span>
                <kbd className="rounded-md border border-sidebar-border bg-sidebar px-1.5 py-0.5 text-[10px] font-semibold">⌘</kbd>
                <kbd className="rounded-md border border-sidebar-border bg-sidebar px-1.5 py-0.5 text-[10px] font-semibold">S</kbd>
              </>
            )}
          </button>

          {sectionLabel("Main")}

          <nav className="flex flex-col gap-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              const kids = item.children ?? [];
              const hasKids = kids.length > 0;
              const isOpen = expanded.includes(item.title);
              const childActive = kids.some((c) => location.pathname === c.url);

              // Collapsed + has children → children live in a popover.
              if (collapsed && hasKids) {
                return (
                  <Popover key={item.title}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={item.title}
                        className={cn(ROW, "h-10 w-10 justify-center self-center px-0",
                          childActive ? ROW_ACTIVE : ROW_IDLE)}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="right" align="start" sideOffset={12} className="w-48 rounded-2xl p-1.5 shadow-xl">
                      <p className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {item.title}
                      </p>
                      {kids.map((c) => (
                        <NavLink
                          key={c.url}
                          to={c.url}
                          end={c.end}
                          className="block rounded-lg px-2.5 py-2 text-sm text-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
                          activeClassName="bg-accent text-foreground font-semibold"
                        >
                          {c.title}
                        </NavLink>
                      ))}
                    </PopoverContent>
                  </Popover>
                );
              }

              if (collapsed) {
                return (
                  <NavLink
                    key={item.title}
                    to={item.url}
                    end={item.end}
                    title={item.title}
                    className={cn(ROW, "h-10 w-10 justify-center self-center px-0", ROW_IDLE)}
                    activeClassName={ROW_ACTIVE}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                  </NavLink>
                );
              }

              return (
                <div key={item.title}>
                  <div className="relative">
                    <NavLink
                      to={item.url}
                      end={item.end}
                      className={cn(ROW, hasKids && "pr-9", ROW_IDLE)}
                      activeClassName={ROW_ACTIVE}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </NavLink>
                    {hasKids && (
                      <button
                        type="button"
                        onClick={() => toggleGroup(item.title)}
                        aria-label={`${isOpen ? "Collapse" : "Expand"} ${item.title}`}
                        aria-expanded={isOpen}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-lg text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      >
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", isOpen && "rotate-180")} />
                      </button>
                    )}
                  </div>

                  {hasKids && isOpen && (
                    <div className="ml-[22px] mt-0.5 flex flex-col border-l border-sidebar-border pl-0">
                      {kids.map((c) => (
                        <NavLink
                          key={c.url}
                          to={c.url}
                          end={c.end}
                          className="relative ml-0 rounded-lg py-1.5 pl-5 pr-3 text-[13px] text-sidebar-foreground/60 transition-colors before:absolute before:left-0 before:top-1/2 before:h-px before:w-3 before:bg-sidebar-border hover:text-sidebar-foreground"
                          activeClassName="bg-sidebar-accent text-sidebar-foreground font-semibold"
                        >
                          {c.title}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* ── Recent customers ─────────────────────────────────────── */}
          {accessible.includes("customers") && customers.length > 0 && (
            <>
              <div className={cn("flex items-center justify-between", collapsed && "justify-center")}>
                {sectionLabel("Customers")}
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => navigate("/customers")}
                    aria-label="Go to customers"
                    className="mt-3 grid h-6 w-6 place-items-center rounded-lg text-sidebar-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {customers.map((c) => (
                  <NavLink
                    key={c.id}
                    to="/customers"
                    title={c.name}
                    className={cn(ROW, ROW_IDLE, collapsed && "h-10 w-10 justify-center self-center px-0")}
                    activeClassName=""
                  >
                    <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold", tintFor(c.name))}>
                      {initials(c.name)}
                    </span>
                    {!collapsed && <span className="truncate">{c.name}</span>}
                  </NavLink>
                ))}
              </div>
            </>
          )}
        </SidebarContent>

        {/* ── User card ──────────────────────────────────────────────── */}
        <SidebarFooter className="p-3 pt-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex items-center rounded-2xl border border-sidebar-border bg-sidebar-accent/40 transition-colors hover:bg-sidebar-accent",
                  collapsed ? "h-11 w-11 justify-center self-center p-0" : "w-full gap-2.5 p-2",
                )}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-black text-primary">
                  {initials(displayName)}
                </span>
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[13px] font-bold leading-tight text-sidebar-foreground">{displayName}</span>
                      <span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">{roleLabel}</span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-sidebar-foreground/40" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-[200px] rounded-2xl p-1.5">
              {isSuperAdmin && (
                <DropdownMenuItem onClick={() => navigate("/settings")} className="rounded-lg cursor-pointer font-medium">
                  <Crown className="mr-2 h-4 w-4 text-amber-500" /> Settings
                </DropdownMenuItem>
              )}
              {isSuperAdmin && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={signOut} className="rounded-lg cursor-pointer font-medium text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
