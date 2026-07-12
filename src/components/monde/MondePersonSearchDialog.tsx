import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2, UserPlus, Cloud } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchMondePeople, type MondePerson } from "@/lib/monde.functions";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (person: MondePerson) => void;
};

export function MondePersonSearchDialog({ open, onOpenChange, onPick }: Props) {
  const search = useServerFn(searchMondePeople);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MondePerson[]>([]);
  const [searched, setSearched] = useState(false);

  const mut = useMutation({
    mutationFn: async (query: string) => search({ data: { query } }),
    onSuccess: (rows) => {
      setResults(rows);
      setSearched(true);
      if (rows.length === 0) toast.info("Nenhuma pessoa encontrada no Monde.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  function submit() {
    const query = q.trim();
    if (query.length < 2) { toast.error("Digite ao menos 2 caracteres"); return; }
    mut.mutate(query);
  }

  function handleClose(v: boolean) {
    onOpenChange(v);
    if (!v) { setQ(""); setResults([]); setSearched(false); }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-4 w-4" /> Importar cliente do Monde
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            autoFocus
            placeholder="Nome, CPF/CNPJ ou e-mail"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
          <Button onClick={submit} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1">Buscar</span>
          </Button>
        </div>

        <div className="mt-2 max-h-[420px] overflow-y-auto rounded-md border border-border">
          {results.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              {searched
                ? "Nenhum resultado. Tente outro termo."
                : "Busque por nome completo, CPF/CNPJ ou e-mail."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((p) => (
                <li key={p.id} className="p-3 flex items-center justify-between gap-3 hover:bg-muted/40">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[
                        p.cpf ? `CPF ${p.cpf}` : p.cnpj ? `CNPJ ${p.cnpj}` : null,
                        p.birthDate ? `Nasc. ${p.birthDate}` : null,
                        p.email,
                        p.mobilePhone ?? p.phone,
                      ].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => { onPick(p); handleClose(false); }}
                  >
                    <UserPlus className="h-3.5 w-3.5 mr-1" /> Usar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleClose(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
