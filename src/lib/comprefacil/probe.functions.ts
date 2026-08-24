import { createServerFn } from "@tanstack/react-start";

/** TEMPORÁRIO: sonda endpoints da CompreFácil para mapear o motor dinâmico. */
export const probeCF = createServerFn({ method: "POST" })
  .inputValidator((d: { alvos: Array<{ base: string; path: string; method?: string; body?: unknown }> }) => d)
  .handler(async ({ data }) => {
    const { chamarCompreFacil, COMPREFACIL_BASES } = await import("./auth.server");
    const out: any[] = [];
    for (const a of data.alvos) {
      try {
        const base = (COMPREFACIL_BASES as any)[a.base] ?? a.base;
        const r = await chamarCompreFacil(a.path, { base, method: a.method ?? "GET", body: a.body });
        out.push({
          ...a,
          status: r.status,
          amostra: JSON.stringify(r.dados).slice(0, 900),
        });
      } catch (e) {
        out.push({ ...a, erro: e instanceof Error ? e.message : String(e) });
      }
    }
    return out;
  });
