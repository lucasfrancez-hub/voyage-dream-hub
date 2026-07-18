import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Percent } from "lucide-react";
import { getCommissionDefaults, setCommissionDefaults } from "@/lib/commission-defaults";
import { toast } from "sonner";

export function CommissionDefaultsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [hotel, setHotel] = useState("12");
  const [service, setService] = useState("12");
  const [flight, setFlight] = useState("0");
  const [pkg, setPkg] = useState("12");

  useEffect(() => {
    if (!open) return;
    const d = getCommissionDefaults();
    setHotel(String(d.hotel));
    setService(String(d.service));
    setFlight(String(d.flight));
    setPkg(String(d.package));
  }, [open]);

  function salvar() {
    setCommissionDefaults({
      hotel: Number(hotel.replace(",", ".")) || 0,
      service: Number(service.replace(",", ".")) || 0,
      flight: Number(flight.replace(",", ".")) || 0,
      package: Number(pkg.replace(",", ".")) || 0,
    });
    toast.success("Padrões de comissão atualizados");
    onOpenChange(false);
  }

  const Field = ({
    label, value, onChange, hint,
  }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          className="pr-9 font-mono"
        />
        <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Padrões de comissão</DialogTitle>
          <DialogDescription>
            Definem o % aplicado automaticamente ao importar produtos. Você continua podendo ajustar caso a caso.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <Field label="Hotel" value={hotel} onChange={setHotel} />
          <Field label="Serviço" value={service} onChange={setService} />
          <Field label="Aéreo" value={flight} onChange={setFlight} hint="Geralmente 0% (RAV entra em outro campo)" />
          <Field label="Pacote pronto" value={pkg} onChange={setPkg} hint="Padrão embutido no valor" />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} className="bg-brand-orange hover:bg-brand-orange/90 text-white">Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
