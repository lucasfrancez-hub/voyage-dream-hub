const { pedidoPendente, aguardarCodigo } = await import("@/lib/integrations/oner/otp.server");
const p = await pedidoPendente();
console.log("pendente:", p?.id, p?.status, p?.requested_at);
if (p) console.log("codigo:", (await aguardarCodigo(p.id, 30000)) ? "LIDO" : "nao lido");
