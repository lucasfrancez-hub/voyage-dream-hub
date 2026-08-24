import { createServerFn } from "@tanstack/react-start";

/** Temporário: descobre o endpoint de autocomplete de cidades do CompreFácil. */
export const probeCidadesCompreFacil = createServerFn({ method: "POST" }).handler(async () => {
  const { chamarCompreFacil, COMPREFACIL_BASES } = await import("./auth.server");
  const paths: Array<[string, string | undefined]> = [
    ["/api/cidade/list/?Nome=rio", undefined],
    ["/api/cidade/autocomplete?termo=rio", undefined],
    ["/api/localidade/autocomplete?termo=rio", undefined],
    ["/api/cidade/list/", undefined],
    ["/api/pacote/cidades", undefined],
    ["/api/autocomplete/cidade?termo=rio", undefined],
    ["/api/localidade/list/?Nome=rio", undefined],
    ["/api/cidade/buscar?Nome=rio", undefined],
    ["/api/localizacao/autocomplete?texto=rio", COMPREFACIL_BASES.hotel],
    ["/api/aeroporto/list/?Nome=rio", COMPREFACIL_BASES.aereo],
  ];
  const out: Array<{ path: string; base?: string; status: number; amostra: string }> = [];
  for (const [p, base] of paths) {
    try {
      const r = await chamarCompreFacil(p, base ? { base } : {});
      out.push({
        path: p,
        base,
        status: r.status,
        amostra: JSON.stringify(r.dados).slice(0, 300),
      });
    } catch (e) {
      out.push({ path: p, base, status: -1, amostra: String(e).slice(0, 200) });
    }
  }
  return out;
});
