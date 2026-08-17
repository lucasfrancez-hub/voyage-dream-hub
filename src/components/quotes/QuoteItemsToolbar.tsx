/**
 * Barra de ações no topo de cada aba do orçamento:
 * adicionar item manualmente ou importar de um PDF/imagem com a IA.
 */
import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QuoteItemFormDialog, type QuoteItemKind } from "./QuoteItemFormDialog";
import { QuoteImportItemsDialog } from "./QuoteImportItemsDialog";

type Props = {
  quoteId: string;
  optionNumber: number;
  kind: QuoteItemKind;
  onSaved: () => void;
};

const rotulos: Record<QuoteItemKind, string> = {
  hotel: "hospedagem",
  flight: "voo",
  service: "serviço",
};

export function QuoteItemsToolbar({ quoteId, optionNumber, kind, onSaved }: Props) {
  const [manual, setManual] = useState(false);
  const [importar, setImportar] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setImportar(true)}>
          <Sparkles className="h-4 w-4 text-brand-orange" /> Importar com IA
        </Button>
        <Button size="sm" className="gap-2" onClick={() => setManual(true)}>
          <Plus className="h-4 w-4" /> Adicionar {rotulos[kind]}
        </Button>
      </div>

      <QuoteItemFormDialog
        open={manual}
        onOpenChange={setManual}
        quoteId={quoteId}
        optionNumber={optionNumber}
        kind={kind}
        index={null}
        onSaved={onSaved}
      />
      <QuoteImportItemsDialog
        open={importar}
        onOpenChange={setImportar}
        quoteId={quoteId}
        optionNumber={optionNumber}
        foco={kind}
        onSaved={onSaved}
      />
    </>
  );
}
