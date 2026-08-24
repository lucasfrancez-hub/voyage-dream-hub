const m = await import("../../src/lib/comprefacil/sync.server");
const fn = (m as any).sincronizarCatalogoCF ?? (m as any).sincronizar ?? Object.values(m).find((v:any)=>typeof v==="function");
console.log(Object.keys(m));
console.log(await fn("servicos"));
