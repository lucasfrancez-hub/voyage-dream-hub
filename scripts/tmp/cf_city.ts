import { cidadesOficiaisCF } from "../../src/lib/comprefacil/localidades.server";
const c = await cidadesOficiaisCF();
console.log(c.filter(x=>/porto seguro|maceio|maceió|rio de janeiro|florian/i.test(x.nome)).slice(0,10));
