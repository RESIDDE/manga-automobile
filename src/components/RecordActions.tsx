import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RecordAction = {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  /** An in-app route. Rendered as a router Link, so it never reloads the page. */
  to?: string;
  /** Tailwind classes for the icon, e.g. "text-emerald-500". */
  tone?: string;
  destructive?: boolean;
  /** False keeps the action out entirely — how the permission matrix gates it. */
  show?: boolean;
};

/**
 * The action row at the foot of a record card.
 *
 * One arrangement for every list in the app: the one or two things done daily
 * get a solid button each, and everything else folds into a single overflow
 * menu. The lists used to put every action in a row of equal-weight icons —
 * five or six of them, half-opacity until hover — which told nobody which one
 * they wanted and pushed the card wider than a phone.
 *
 * Destructive actions live in the menu on purpose: deleting a record should
 * take a deliberate second click, not sit one stray tap from Preview.
 */
export function RecordActions({
  primary = [],
  menu = [],
  menuLabel = "More actions",
  className = "",
  inline = false,
}: {
  primary?: RecordAction[];
  menu?: RecordAction[];
  menuLabel?: string;
  className?: string;
  /**
   * For a row inside a table rather than the foot of a card: no divider, no
   * top margin, and buttons sized to their label instead of filling the width.
   */
  inline?: boolean;
}) {
  const visible = (actions: RecordAction[]) => actions.filter((a) => a.show !== false);
  const primaryActions = visible(primary);
  const menuActions = visible(menu);

  if (!primaryActions.length && !menuActions.length) return null;

  return (
    <div
      className={`flex items-center gap-2 ${
        inline ? "justify-end" : "pt-3 mt-auto border-t border-white/5"
      } ${className}`}
    >
      {primaryActions.map((action) => {
        const Icon = action.icon;
        const content = (
          <>
            <Icon className={`h-3.5 w-3.5 mr-1.5 ${action.tone ?? ""}`} />
            {action.label}
          </>
        );
        const classes = `${
          inline ? "" : "flex-1"
        } h-9 rounded-xl border-white/10 hover:bg-white/5 text-xs font-semibold`;

        return action.to ? (
          <Button key={action.label} asChild variant="outline" size="sm" className={classes}>
            <Link to={action.to}>{content}</Link>
          </Button>
        ) : (
          <Button
            key={action.label}
            variant="outline"
            size="sm"
            onClick={action.onClick}
            className={classes}
          >
            {content}
          </Button>
        );
      })}

      {menuActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label={menuLabel}
              className="h-9 w-9 shrink-0 rounded-xl border-white/10 hover:bg-white/5"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="rounded-xl glass-panel p-2 shadow-2xl border-white/10"
          >
            {menuActions.map((action) => {
              const Icon = action.icon;
              const classes = `rounded-lg cursor-pointer ${
                action.destructive ? "text-destructive focus:text-destructive" : ""
              }`;
              const content = (
                <>
                  <Icon className={`mr-2 h-4 w-4 ${action.tone ?? ""}`} />
                  {action.label}
                </>
              );

              return action.to ? (
                <DropdownMenuItem key={action.label} asChild className={classes}>
                  <Link to={action.to}>{content}</Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem key={action.label} onClick={action.onClick} className={classes}>
                  {content}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
