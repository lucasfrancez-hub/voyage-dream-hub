import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type NavMenuItem = {
  to: string;
  label: string;
  icon?: LucideIcon;
  /** marca o item como ativo quando a rota começa com este prefixo (padrão: `to`) */
  match?: string;
};

export type NavMenuGroup = {
  label?: string;
  items: NavMenuItem[];
  /** destaca o título do grupo em laranja */
  accent?: boolean;
};

function isItemActive(pathname: string, item: NavMenuItem) {
  const base = item.match ?? item.to;
  return pathname === base || pathname.startsWith(`${base}/`);
}

function ItemLink({ item, active }: { item: NavMenuItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-all duration-200 ${
        active
          ? "border-l-2 border-brand-orange bg-brand-orange/15 font-semibold text-foreground rounded-l-none"
          : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
      }`}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" /> : null}
      <span className="truncate">{item.label}</span>
      {active ? <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" /> : null}
    </Link>
  );
}

function Group({ group, pathname }: { group: NavMenuGroup; pathname: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {group.label ? (
        <h3
          className={`px-3 text-[10px] font-extrabold uppercase tracking-[0.2em] ${
            group.accent ? "text-brand-orange" : "text-muted-foreground/70"
          }`}
        >
          {group.label}
        </h3>
      ) : null}
      <nav className="flex flex-col gap-0.5">
        {group.items.map((item) => (
          <ItemLink key={item.to} item={item} active={isItemActive(pathname, item)} />
        ))}
      </nav>
    </div>
  );
}

function ModuleRail({ groups, pathname }: { groups: NavMenuGroup[]; pathname: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const current = hovered === null ? undefined : groups[hovered];
  const hasPanel = Boolean(current && current.items.length > 1);


  return (
    <div className={hasPanel ? "grid grid-cols-[190px_260px]" : "grid grid-cols-[190px]"}>
      <div
        className={`flex flex-col gap-0.5 bg-foreground/[0.02] p-2 ${hasPanel ? "border-r border-border/70" : ""}`}
      >
        {groups.map((g, i) => {
          const label = g.label ?? "Geral";
          const single = g.items.length === 1;
          const item = g.items[0]!;

          if (single) {
            const active = isItemActive(pathname, item);
            return (
              <Link
                key={label + i}
                to={item.to}
                onMouseEnter={() => setHovered(null)}

                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-bold uppercase tracking-[0.12em] transition ${
                  active
                    ? "bg-brand-orange/15 text-brand-orange"
                    : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
                }`}
              >
                <span className="truncate">{label}</span>
              </Link>
            );
          }

          const isOn = i === hovered;
          return (
            <button
              key={label + i}
              type="button"
              onMouseEnter={() => setHovered(i)}
              onFocus={() => setHovered(i)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[12px] font-bold uppercase tracking-[0.12em] transition ${
                isOn
                  ? "bg-brand-orange/15 text-brand-orange"
                  : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
              }`}
            >
              <span className="truncate">{label}</span>
              <ChevronRight className={`ml-auto h-3.5 w-3.5 shrink-0 ${isOn ? "opacity-80" : "opacity-40"}`} />
            </button>
          );
        })}
      </div>
      {hasPanel ? (
        <div className="min-h-[220px] p-3">
          <nav className="flex flex-col gap-0.5">
            {current!.items.map((item) => (
              <ItemLink key={item.to} item={item} active={isItemActive(pathname, item)} />
            ))}
          </nav>
        </div>
      ) : null}
    </div>
  );
}



export function NavMegaMenu({
  icon: Icon,
  title,
  subtitle,
  groups,
  pathname,
  active,
  columns = 1,
  width,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  groups: NavMenuGroup[];
  pathname: string;
  active: boolean;
  columns?: 1 | 2;
  width?: string;
}) {
  const half = Math.ceil(groups.length / 2);
  const left = columns === 2 ? groups.slice(0, half) : groups;
  const right = columns === 2 ? groups.slice(half) : [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm outline-none transition ${
          active ? "bg-brand-orange/10 text-brand-orange" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Icon className="h-4 w-4" /> {title} <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className={`overflow-hidden rounded-xl p-0 shadow-2xl transition-[width] duration-150 ${
          width ?? (columns === 2 ? "w-auto" : "w-64")
        }`}
      >
        <div className="flex items-center gap-3 border-b border-border/70 bg-foreground/[0.02] px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-orange/25 bg-brand-orange/10">
            <Icon className="h-4.5 w-4.5 text-brand-orange" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-none tracking-tight text-foreground">{title}</p>
            {subtitle ? (
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/70">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        {columns === 2 ? (
          <ModuleRail groups={groups} pathname={pathname} />
        ) : (
          <div className="flex flex-col gap-5 p-3">
            {groups.map((g, i) => (
              <Group key={g.label ?? `s${i}`} group={g} pathname={pathname} />
            ))}
          </div>
        )}

      </DropdownMenuContent>
    </DropdownMenu>
  );
}
