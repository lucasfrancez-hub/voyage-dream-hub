import { obterToken } from "../../src/lib/integrations/oner/session.server";
const t = await obterToken({ esperarCodigoMs: 180000, forcarNovo: true });
console.log("token?", Boolean(t));
