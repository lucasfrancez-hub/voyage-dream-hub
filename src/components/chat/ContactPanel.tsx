import { Bot, Calendar, MapPin, Phone, Tag, User, UserPlus, Users } from "lucide-react";

export interface ContactInfo {
  name: string;
  phone?: string;
  platform?: string;
  origin?: string;
  destination?: string;
  travelDates?: string;
  pax?: string;
  purpose?: string;
  budget?: string;
  tags?: string[];
  aiStatus?: "active" | "paused";
  assignedTo?: string;
}

interface ContactPanelProps {
  contact: ContactInfo;
  onTransferToHuman: () => void;
  onToggleAI: () => void;
}

export function ContactPanel({ contact, onTransferToHuman, onToggleAI }: ContactPanelProps) {
  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-border/40 bg-background/40">
      {/* Contact header */}
      <div className="border-b border-border/40 p-4 text-center">
        <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-gradient-to-br from-brand-orange/40 to-brand-orange/10 ring-2 ring-brand-orange/30" />
        <div className="text-sm font-semibold text-foreground">{contact.name}</div>
        {contact.phone && (
          <div className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            {contact.phone}
          </div>
        )}
        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          WHATSAPP
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-b border-border/40 p-3">
        <button
          onClick={onToggleAI}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-xs text-foreground transition-colors hover:border-brand-orange/60"
        >
          <Bot className="h-3.5 w-3.5" />
          {contact.aiStatus === "paused" ? "Retomar IA" : "Pausar IA"}
        </button>
        <button
          onClick={onTransferToHuman}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-orange px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-brand-orange-light"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Transferir
        </button>
      </div>

      {/* Collected info */}
      <div className="flex-1 overflow-y-auto p-4">
        <SectionHeader>Informações coletadas</SectionHeader>
        <div className="mt-2 space-y-2">
          <InfoRow icon={User} label="Nome" value={contact.name} />
          <InfoRow icon={MapPin} label="Origem" value={contact.origin} />
          <InfoRow icon={MapPin} label="Destino" value={contact.destination} />
          <InfoRow icon={Calendar} label="Datas" value={contact.travelDates} />
          <InfoRow icon={Users} label="Passageiros" value={contact.pax} />
          <InfoRow icon={Tag} label="Motivo" value={contact.purpose} />
          <InfoRow icon={Tag} label="Orçamento" value={contact.budget} />
        </div>

        <SectionHeader className="mt-6">Tags</SectionHeader>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(contact.tags ?? []).length === 0 ? (
            <span className="text-xs text-muted-foreground">Nenhuma tag</span>
          ) : (
            contact.tags!.map((t) => (
              <span key={t} className="rounded-full bg-brand-orange/15 px-2 py-0.5 text-[10px] text-brand-orange">
                {t}
              </span>
            ))
          )}
        </div>

        <SectionHeader className="mt-6">Atendente</SectionHeader>
        <div className="mt-2 text-xs text-muted-foreground">
          {contact.assignedTo ? (
            <span className="text-foreground">{contact.assignedTo}</span>
          ) : (
            <span className="italic">Não atribuído</span>
          )}
        </div>
      </div>
    </aside>
  );
}

function SectionHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${className ?? ""}`}>
      {children}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/30 bg-background/30 px-2.5 py-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate text-xs text-foreground">
          {value || <span className="italic text-muted-foreground/60">—</span>}
        </div>
      </div>
    </div>
  );
}
