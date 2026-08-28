/**
 * Exibição elegante e responsiva de dados preenchidos em formulários públicos
 * (passaporte e visto americano) dentro do admin de Pedidos.
 */

export function humanizar(chave: string) {
  const base = chave.split("#")[0] ?? chave;
  return base
    .replace(/\[\]$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export function CampoItem({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
      <dt className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {rotulo}
      </dt>
      <dd className="mt-0.5 break-words text-sm font-medium leading-snug">{valor}</dd>
    </div>
  );
}

export function BlocoCampos({
  titulo,
  entradas,
  vazio = "Ainda não preenchido pelo cliente.",
}: {
  titulo: string;
  entradas: Array<[string, string]>;
  vazio?: string;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border/60 bg-background/40 p-4">
      <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-orange">
        <span className="h-3 w-1 rounded-full bg-brand-orange" />
        {titulo}
        {entradas.length > 0 && (
          <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {entradas.length}
          </span>
        )}
      </h4>
      {entradas.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{vazio}</p>
      ) : (
        <dl className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {entradas.map(([k, v], i) => (
            <CampoItem key={`${k}-${i}`} rotulo={k} valor={v} />
          ))}
        </dl>
      )}
    </section>
  );
}
