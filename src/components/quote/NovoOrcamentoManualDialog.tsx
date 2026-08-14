/** Criação de orçamento manual (sem plugin/importação). */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { criarOrcamentoManual } from "@/lib/quotes/quotes.functions";

type OpcaoForm = {
  label: string;
  total: string;
  hotelName: string;
  services: string;
  notes: string;
};

const opcaoVazia = (i: number): OpcaoForm => ({
  label: `Opção ${i}`,
  total: "",
  hotelName: "",
  services: "",
  notes: "",
});

export function NovoOrcamentoManualDialog({
  open,
  onOpenChange,
  onCriado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCriado: (quoteId: string) => void;
}) {
  const criar = useServerFn(criarOrcamentoManual);
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [adults, setAdults] = useState("2");
  const [children, setChildren] = useState("0");
  const [consultant, setConsultant] = useState("");
  const [opcoes, setOpcoes] = useState<OpcaoForm[]>([opcaoVazia(1)]);

  const valido = title.trim().length >= 2 && opcoes.every((o) => Number(o.total.replace(",", ".")) > 0);

  const mut = useMutation({
    mutationFn: () =>
      criar({
        data: {
          title: title.trim(),
          clientName: clientName.trim() || null,
          clientPhone: clientPhone.trim() || null,
          clientEmail: clientEmail.trim() || null,
          origin: origin.trim() || null,
          destination: destination.trim() || null,
          startDate: startDate || null,
          endDate: endDate || null,
          adults: Number(adults) || 1,
          children: Number(children) || 0,
          consultant: consultant.trim() || null,
          options: opcoes.map((o) => ({
            label: o.label.trim() || null,
            total: Number(o.total.replace(",", ".")),
            hotelName: o.hotelName.trim() || null,
            services: o.services
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 20),
            notes: o.notes.trim() || null,
          })),
        },
      }),
    onSuccess: (r) => {
      toast.success("Orçamento manual criado");
      onOpenChange(false);
      setTitle("");
      setOpcoes([opcaoVazia(1)]);
      onCriado((r as { quoteId: string }).quoteId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo orçamento manual</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Título do orçamento *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Maceió 7 noites — Família Silva" />
          </div>
          <div>
            <Label>Cliente</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
          </div>
          <div>
            <Label>Consultor</Label>
            <Input value={consultant} onChange={(e) => setConsultant(e.target.value)} />
          </div>
          <div>
            <Label>Origem</Label>
            <Input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Maringá (MGF)" />
          </div>
          <div>
            <Label>Destino</Label>
            <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Maceió (MCZ)" />
          </div>
          <div>
            <Label>Ida</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>Volta</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <Label>Adultos</Label>
            <Input type="number" min={1} value={adults} onChange={(e) => setAdults(e.target.value)} />
          </div>
          <div>
            <Label>Crianças</Label>
            <Input type="number" min={0} value={children} onChange={(e) => setChildren(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {opcoes.map((o, i) => (
            <div key={i} className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={o.label}
                  onChange={(e) =>
                    setOpcoes((p) => p.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                  }
                  className="h-8 max-w-[220px] font-semibold"
                />
                <Input
                  value={o.total}
                  inputMode="decimal"
                  placeholder="Valor total (R$) *"
                  onChange={(e) =>
                    setOpcoes((p) => p.map((x, j) => (j === i ? { ...x, total: e.target.value } : x)))
                  }
                  className="h-8 max-w-[180px]"
                />
                {opcoes.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto"
                    onClick={() => setOpcoes((p) => p.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input
                  value={o.hotelName}
                  placeholder="Hotel (opcional)"
                  onChange={(e) =>
                    setOpcoes((p) => p.map((x, j) => (j === i ? { ...x, hotelName: e.target.value } : x)))
                  }
                />
                <Input
                  value={o.notes}
                  placeholder="Observação (opcional)"
                  onChange={(e) =>
                    setOpcoes((p) => p.map((x, j) => (j === i ? { ...x, notes: e.target.value } : x)))
                  }
                />
                <Textarea
                  value={o.services}
                  placeholder={"Itens inclusos (um por linha)\nEx.: Aéreo ida e volta\nTraslado aeroporto/hotel"}
                  rows={3}
                  className="sm:col-span-2"
                  onChange={(e) =>
                    setOpcoes((p) => p.map((x, j) => (j === i ? { ...x, services: e.target.value } : x)))
                  }
                />
              </div>
            </div>
          ))}
          {opcoes.length < 6 ? (
            <Button variant="outline" size="sm" onClick={() => setOpcoes((p) => [...p, opcaoVazia(p.length + 1)])}>
              <Plus className="h-4 w-4" /> Adicionar opção
            </Button>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!valido || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Criar orçamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
