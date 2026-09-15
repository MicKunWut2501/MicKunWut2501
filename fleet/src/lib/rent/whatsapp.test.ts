import { describe, expect, it } from "vitest";
import { buildRentMessage, waMeLink } from "./whatsapp";

describe("buildRentMessage", () => {
  it("states plate, week, amount and deadline for a partial payment", () => {
    const m = buildRentMessage({
      driverName: "Manuel Sebastião",
      plate: "LD-02-02-BB",
      weekStart: "2026-08-03",
      expectedAoa: 105000,
      paidAoa: 70000,
      outstandingAoa: 35000,
      status: "PARTIAL",
      deadline: "2026-08-12",
    });
    expect(m).toContain("Bom dia, Manuel.");
    expect(m).toContain("LD-02-02-BB");
    expect(m).toContain("3–9 ago");
    expect(m).toContain("35 000 Kz");
    expect(m).toContain("até 12/08/2026");
    expect(m).not.toContain("não registámos qualquer pagamento");
  });
  it("uses the missed wording when nothing was paid", () => {
    const m = buildRentMessage({
      driverName: "Pedro",
      plate: "LD-03-03-CC",
      weekStart: "2026-08-03",
      expectedAoa: 105000,
      paidAoa: 0,
      outstandingAoa: 105000,
      status: "MISSED",
      deadline: "2026-08-12",
    });
    expect(m).toContain("não registámos qualquer pagamento");
    expect(m).toContain("105 000 Kz");
  });
  it("builds a wa.me link", () => {
    expect(waMeLink("+244 923 000 001", "Olá João")).toBe("https://wa.me/244923000001?text=Ol%C3%A1%20Jo%C3%A3o");
    expect(waMeLink(null, "x")).toBe("https://wa.me/?text=x");
  });
});
