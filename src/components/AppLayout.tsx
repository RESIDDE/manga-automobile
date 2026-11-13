import { Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BrandMark } from "@/components/BrandMark";
import { CollabDock } from "@/components/CollabDock";
import { CollabRealtimeSync } from "@/hooks/useCollab";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "17rem", "--sidebar-width-icon": "4rem" } as React.CSSProperties}
    >
      <div className="h-screen h-dvh flex w-full bg-background transition-colors duration-300">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 bg-background relative overflow-hidden transition-all duration-300">
          <header className="safe-top sticky top-0 z-30 box-content h-16 flex items-center border-b border-border/40 bg-background/60 backdrop-blur-xl px-4 sm:px-6 gap-2.5 print:hidden md:hidden">
            <SidebarTrigger className="-ml-1 rounded-full hover:bg-primary/10 transition-colors shrink-0" />
            <Link to="/dashboard" className="flex items-center gap-2.5 min-w-0 hover:opacity-90 transition-opacity">
              <BrandMark size={32} className="shrink-0" />
              <span className="text-sm font-heading font-black tracking-tight text-foreground truncate uppercase">
                Manga Automobiles
              </span>
            </Link>
          </header>
          <main className="flex-1 p-4 md:p-8 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] overflow-auto animate-fade-up">
            <div className="mx-auto max-w-7xl h-full">
              {children}
            </div>
          </main>
          <CollabRealtimeSync />
          <CollabDock />
        </div>
      </div>
    </SidebarProvider>
  );
}
