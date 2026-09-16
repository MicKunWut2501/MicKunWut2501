import { formatAOA, formatDate } from "@/lib/format";
import { addDays } from "@/lib/time";

export type RentMessageInput = {
  driverName: string;
  plate: string;
  weekStart: string;
  expectedAoa: number;
  paidAoa: number;
  outstandingAoa: number;
  status: "PARTIAL" | "MISSED" | "PENDING" | "PAID" | "EXEMPT";
  /** ISO date by which the driver must pay */
  deadline: string;
  fleetName?: string;
};

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? full;
}

/**
 * Draft WhatsApp reminder in European Portuguese: polite, firm, states plate, week, amount and deadline.
 * The owner edits it in a textarea before sending; nothing is sent automatically.
 */
export function buildRentMessage(i: RentMessageInput): string {
  const name = firstName(i.driverName);
  const week = `${formatDate(i.weekStart)} a ${formatDate(addDays(i.weekStart, 6))}`;
  const fleet = i.fleetName ?? "a gestão da frota";
  const lines: string[] = [];
  lines.push(`Bom dia, ${name}.`);
  if (i.status === "MISSED" || i.paidAoa === 0) {
    lines.push(
      `Relativamente à renda semanal da viatura ${i.plate} (semana de ${week}), não registámos qualquer pagamento. ` +
        `O valor em dívida é de ${formatAOA(i.outstandingAoa)}.`,
    );
  } else {
    lines.push(
      `Relativamente à renda semanal da viatura ${i.plate} (semana de ${week}), registámos o pagamento de ${formatAOA(i.paidAoa)} ` +
        `de um total de ${formatAOA(i.expectedAoa)}. Fica em falta o valor de ${formatAOA(i.outstandingAoa)}.`,
    );
  }
  lines.push(
    `Pedimos a regularização até ${formatDate(i.deadline)}, por transferência ou Multicaixa Express, enviando o comprovativo por esta via. ` +
      `A falta de regularização dentro do prazo poderá implicar a suspensão da viatura.`,
  );
  lines.push(`Se já efectuou o pagamento, por favor ignore esta mensagem e envie-nos o comprovativo.`);
  lines.push(`Obrigado, ${fleet}.`);
  return lines.join("\n\n");
}

/** wa.me deep link with the message prefilled. Phone must be E.164 (+244...). */
export function waMeLink(phoneE164: string | null | undefined, message: string): string {
  const digits = (phoneE164 ?? "").replace(/[^\d]/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(message)}`;
}
