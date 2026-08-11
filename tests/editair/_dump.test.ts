import { it } from "vitest";
import { auditarSegmentacao } from "@/lib/editair/segmentacao";
import { FALA } from "@/../tests/editair/segmentacao.test";
it("dump", () => { console.log(JSON.stringify(auditarSegmentacao(FALA).novo, null, 1)); });
