const { cidadesOficiaisCF, semAcento } = await import("@/lib/comprefacil/localidades.server");
const c = await cidadesOficiaisCF();
for (const alvo of ["rio de janeiro","gramado","foz do iguacu","buenos aires"]) {
  const f = c.find((x) => semAcento(x.nome) === alvo);
  console.log(alvo, f?.id, f?.iata);
}
