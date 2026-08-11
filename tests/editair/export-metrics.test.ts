import { describe, expect, it } from "vitest";
import { EstimadorETA, metricasVazias, relatorioExport } from "@/lib/editair/export-metrics";
import { EditairEngine } from "@/lib/editair/engine";

const quadro = (valor: number, n = 4096) => {
  const px = new Uint8Array(n);
  px.fill(valor);
  return px;
};

describe("assinatura de quadro (dedup do export)", () => {
  it("quadros idênticos têm a mesma assinatura", () => {
    expect(EditairEngine.assinatura(quadro(120))).toBe(EditairEngine.assinatura(quadro(120)));
  });

  it("quadros diferentes têm assinaturas diferentes", () => {
    expect(EditairEngine.assinatura(quadro(120))).not.toBe(EditairEngine.assinatura(quadro(121)));
  });

  it("detecta alteração de um único pixel amostrado", () => {
    const a = quadro(10);
    const b = quadro(10);
    b[16] = 200;
    expect(EditairEngine.assinatura(a)).not.toBe(EditairEngine.assinatura(b));
  });
});

describe("estimador de tempo restante", () => {
  it("não mostra ETA nos primeiros quadros (evita número absurdo)", () => {
    const eta = new EstimadorETA();
    eta.iniciar(0);
    expect(eta.frame(1000, 100)).toBe(0);
    expect(eta.frame(999, 200)).toBe(0);
  });

  it("estabiliza usando a velocidade real observada", () => {
    const eta = new EstimadorETA();
    eta.iniciar(0);
    let t = 0;
    for (let i = 0; i < 40; i++) {
      t += 50; // 50 ms por quadro
      eta.frame(100, t);
    }
    const restante = eta.frame(100, t + 50);
    expect(restante).toBeGreaterThan(4);
    expect(restante).toBeLessThan(6); // ~100 quadros × 50 ms = 5 s
  });
});

describe("relatório de exportação", () => {
  it("calcula velocidade e FPS efetivo", () => {
    const m = metricasVazias({
      duracaoMs: 300_000,
      largura: 1080,
      altura: 1920,
      fps: 30,
      totalFrames: 9000,
      framesEnviados: 9000,
      totalMs: 300_000,
      encoder: "h264_videotoolbox",
      aceleracao: true,
    });
    const txt = relatorioExport(m);
    expect(txt).toContain("velocidade: 1.00x tempo real");
    expect(txt).toContain("FPS efetivo de exportação: 30.0");
    expect(txt).toContain("aceleração por hardware: SIM");
  });
});
