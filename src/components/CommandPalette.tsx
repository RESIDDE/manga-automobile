import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { ALL_PAGES, getAccessiblePages, type AppRole, type PageKey } from "@/lib/permissions";
import { PlusCircle, LogOut, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Opens on ⌘S / Ctrl+S and jumps to any page the current role can reach. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { permissions } = usePermissions();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const pages = useMemo(() => {
    const accessible = getAccessiblePages(role as AppRole | null, permissions);
    return ALL_PAGES.filter((p) => accessible.includes(p.key as PageKey));
  }, [role, permissions]);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search pages and actions..." />
      <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>
        <CommandGroup heading="Go to">
          {pages.map((p) => (
            <CommandItem key={p.key} value={p.label} onSelect={() => go(p.path)}>
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="Add vehicle" onSelect={() => go("/vehicles/new")}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add vehicle
          </CommandItem>
          {role === "super_admin" && (
            <CommandItem value="Settings" onSelect={() => go("/settings")}>
              <Settings className="mr-2 h-4 w-4" /> Settings
            </CommandItem>
          )}
          <CommandItem
            value="Sign out"
            onSelect={async () => {
              onOpenChange(false);
              await supabase.auth.signOut();
              navigate("/auth");
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
