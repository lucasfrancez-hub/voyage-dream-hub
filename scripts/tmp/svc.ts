import { buscarLocalidadesCF } from "@/lib/comprefacil/localidades.server";
const locs: any = await buscarLocalidadesCF("Lisboa" as any);
console.log(JSON.stringify(locs).slice(0,800));
