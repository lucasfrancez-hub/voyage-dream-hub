import { describe, it, expect } from "vitest";
import {
  detectLoginButtonName,
  extractPartialUpdates,
  extractViewState,
  looksLikeLoginPage,
  looksLikeSessionExpired,
  maskSensitive,
  parseMoneyBR,
  parseResultadosHtml,
  resolveSearchFields,
  toBrDate,
} from "@/lib/frt/frt-parse";

const LOGIN_HTML = `
<html><form id="frmMaster" name="frmMaster">
<input name="login-usuario-input" value=""/>
<input type="password" name="login-senha-input"/>
<input type="submit" name="j_idt33" value="Entrar" class="ui-button"/>
<input type="hidden" name="javax.faces.ViewState" value="-123:456"/>
</form></html>`;

const VENDA_HTML = `
<html><form id="frmMotorPacote" name="frmMotorPacote">
<input name="frmMotorPacote:j_idt3287"/>
<input name="frmMotorPacote:j_idt3300"/>
<input name="frmMotorPacote:dtPartidaPacote_input"/>
<input name="frmMotorPacote:dtRetornoPacote_input"/>
<input name="frmMotorPacote:idNmPaisPacote_input"/>
<input name="frmMotorPacote:idCiaAereaPesquisa_input"/>
<button name="frmMotorPacote:btnMotorPacotePesquisa"></button>
<input type="hidden" name="javax.faces.ViewState" value="vs-venda"/>
</form></html>`;

const PARTIAL = `<?xml version="1.0"?>
<partial-response><changes>
<update id="pnlResultado"><![CDATA[
<div class="resultado" id="res1">
  <h3>Hotel Bahia Mar</h3><img src="/img/h1.jpg"/>
  <i class="fa-star"></i><i class="fa-star"></i><i class="fa-star"></i><i class="fa-star"></i>
  <span class="endereco">Ondina, Salvador</span>
  Check-in: 23/09/2026 Check-out: 30/09/2026 Café da manhã Apartamento Duplo
  <div class="voo">GOL G3 1234 MGF 09:05 SSA 12:40 1 parada CGH Econômica com bagagem</div>
  Total R$ 7.480,00 por pessoa R$ 3.740,00 taxas R$ 320,00
</div>
<div class="resultado" id="res2">
  <h3>Pousada Praia</h3>
  <div class="voo">AZUL AD 4567 MGF 06:00 SSA 09:15 direto Econômica</div>
  Total R$ 5.100,50
</div>
<span>2 resultados encontrados</span>
]]></update>
<update id="javax.faces.ViewState"><![CDATA[vs-novo]]></update>
</changes></partial-response>`;

describe("FRT parse", () => {
  it("extrai ViewState do HTML e do partial-response", () => {
    expect(extractViewState(LOGIN_HTML)).toBe("-123:456");
    expect(extractViewState(PARTIAL)).toBe("vs-novo");
  });

  it("detecta o botão de login dinamicamente", () => {
    expect(detectLoginButtonName(LOGIN_HTML)).toBe("j_idt33");
    const alterado = LOGIN_HTML.replace("j_idt33", "j_idt99");
    expect(detectLoginButtonName(alterado)).toBe("j_idt99");
  });

  it("identifica tela de login e sessão expirada", () => {
    expect(looksLikeLoginPage(LOGIN_HTML)).toBe(true);
    expect(looksLikeLoginPage(VENDA_HTML)).toBe(false);
    expect(looksLikeSessionExpired("<x>ViewExpiredException</x>")).toBe(true);
  });

  it("valida campos e detecta mudança de estrutura", () => {
    const ok = resolveSearchFields(VENDA_HTML);
    expect(ok.missing).toEqual([]);
    expect(ok.fields.origem).toBe("frmMotorPacote:j_idt3287");

    const mudou = VENDA_HTML.replace("j_idt3287", "j_idt4001").replace(
      "j_idt3300",
      "j_idt4002",
    );
    const res = resolveSearchFields(mudou);
    expect(res.fields.origem).toBe("frmMotorPacote:j_idt4001");
    expect(res.fields.destino).toBe("frmMotorPacote:j_idt4002");
    expect(res.missing).toEqual([]);

    const quebrado = VENDA_HTML.replace(
      'name="frmMotorPacote:dtPartidaPacote_input"',
      'name="outro"',
    );
    expect(resolveSearchFields(quebrado).missing).toContain(
      "frmMotorPacote:dtPartidaPacote_input",
    );
  });

  it("lê os blocos <update> e normaliza os resultados", () => {
    const updates = extractPartialUpdates(PARTIAL);
    expect(Object.keys(updates)).toContain("pnlResultado");

    const { results, availableResults } = parseResultadosHtml(updates["pnlResultado"]!);
    expect(availableResults).toBe(2);
    expect(results).toHaveLength(2);

    const primeiro = results[0]!;
    expect(primeiro.hotel?.nome).toBe("Hotel Bahia Mar");
    expect(primeiro.hotel?.estrelas).toBe(4);
    expect(primeiro.hotel?.checkin).toBe("23/09/2026");
    expect(primeiro.hotel?.regime?.toLowerCase()).toContain("café");
    expect(primeiro.voos[0]?.origem).toBe("MGF");
    expect(primeiro.voos[0]?.destino).toBe("SSA");
    expect(primeiro.voos[0]?.saida).toBe("09:05");
    expect(primeiro.voos[0]?.paradas).toBe(1);
    expect(primeiro.voos[0]?.bagagemIncluida).toBe(true);
    expect(primeiro.preco.total).toBe(7480);
    expect(primeiro.preco.porPessoa).toBe(3740);
    expect(primeiro.preco.taxas).toBe(320);
    expect(primeiro.preco.moeda).toBe("BRL");

    expect(results[1]!.voos[0]?.paradas).toBe(0);
  });

  it("converte moeda e data", () => {
    expect(parseMoneyBR("R$ 1.234,56")).toBe(1234.56);
    expect(toBrDate("2026-09-23")).toBe("23/09/2026");
  });

  it("mascara dados sensíveis nos logs", () => {
    const s = maskSensitive("Cookie: JSESSIONID=abc123; login-senha-input=segredo");
    expect(s).not.toContain("abc123");
    expect(s).not.toContain("segredo");
  });
});
