import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "@/lib/env";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/maintenance/categories";

export type ReceiptLineItem = { description: string; qty: number; unit_price_aoa: number };

/** What the review form is pre-filled with. Every field may be empty; the user always confirms. */
export type ReceiptDraft = {
  vendor: string | null;
  date: string | null; // YYYY-MM-DD
  total_aoa: number | null;
  currency: string; // "AOA" unless the receipt is clearly in another currency
  category: ExpenseCategory | null;
  odometer_km: number | null;
  line_items: ReceiptLineItem[];
  confidence: number; // 0..1
  provider: "anthropic" | "none";
  notes: string | null;
  usage?: { model: string; input_tokens: number; output_tokens: number };
};

export type ReceiptFile = { bytes: Buffer; mimeType: string; fileName?: string };

export interface ReceiptExtractor {
  readonly name: "anthropic" | "none";
  extract(file: ReceiptFile): Promise<ReceiptDraft>;
}

export function emptyDraft(provider: ReceiptDraft["provider"] = "none"): ReceiptDraft {
  return {
    vendor: null, date: null, total_aoa: null, currency: "AOA", category: null, odometer_km: null,
    line_items: [], confidence: 0, provider, notes: null,
  };
}

/** No-AI fallback: returns an empty draft so the form still works. */
export const noopExtractor: ReceiptExtractor = {
  name: "none",
  async extract() {
    return emptyDraft("none");
  },
};

const DraftSchema = z.object({
  vendor: z.string().nullable(),
  date: z.string().nullable().describe("YYYY-MM-DD or null"),
  total: z.number().nullable().describe("Grand total as printed"),
  currency: z.string().describe("ISO code, AOA for kwanza"),
  category: z.enum(EXPENSE_CATEGORIES),
  odometer_km: z.number().nullable().describe("Odometer reading if handwritten or printed on the receipt"),
  line_items: z.array(z.object({ description: z.string(), qty: z.number(), unit_price: z.number() })),
  confidence: z.number().min(0).max(1),
  notes: z.string().nullable().describe("Anything ambiguous the reviewer should check"),
});

const SYSTEM = `You extract structured data from receipts and invoices for a small car-rental fleet in Luanda, Angola.
Amounts are usually in Angolan kwanza (AOA, "Kz"); Portuguese number format uses "." for thousands and "," for decimals (e.g. 45.000,00 Kz = 45000).
Return exactly what is on the document; use null when a field is not visible. Never invent line items.
Category guide: fuel = gasolina/gasóleo; oil_service = óleo, filtros, revisão; tyres = pneus; brakes = travões, pastilhas, discos;
repair = any other mechanical/body work; insurance = seguro; licensing = licença, inspecção, imposto, taxa; wash = lavagem; fine = multa; other = anything else.`;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** Anthropic Messages API with vision + structured output. */
export class AnthropicReceiptExtractor implements ReceiptExtractor {
  readonly name = "anthropic" as const;
  private client: Anthropic;
  private model: string;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    this.client = new Anthropic({ apiKey: opts.apiKey ?? env.anthropicApiKey() });
    this.model = opts.model ?? env.anthropicModel();
  }

  async extract(file: ReceiptFile): Promise<ReceiptDraft> {
    const data = file.bytes.toString("base64");
    const block: Anthropic.ContentBlockParam = IMAGE_TYPES.has(file.mimeType)
      ? { type: "image", source: { type: "base64", media_type: file.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data } }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data } };

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [
        { role: "user", content: [block, { type: "text", text: "Extract this receipt." }] },
      ],
      output_config: { format: zodOutputFormat(DraftSchema) },
    });

    const usage = { model: response.model, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return { ...emptyDraft("anthropic"), notes: "Automatic extraction returned nothing; fill the form manually.", usage };
    }
    const p = response.parsed_output;
    return {
      vendor: p.vendor,
      date: p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : null,
      total_aoa: p.currency.toUpperCase() === "AOA" ? p.total : null,
      currency: p.currency.toUpperCase(),
      category: p.category,
      odometer_km: p.odometer_km,
      line_items: p.line_items.map((li) => ({ description: li.description, qty: li.qty, unit_price_aoa: li.unit_price })),
      confidence: p.confidence,
      provider: "anthropic",
      notes: p.currency.toUpperCase() !== "AOA" && p.total != null
        ? `Total read: ${p.total} ${p.currency}. Convert to AOA manually.${p.notes ? " " + p.notes : ""}`
        : p.notes,
      usage,
    };
  }
}

/** Provider chosen by RECEIPT_EXTRACTOR (falls back to anthropic when ANTHROPIC_API_KEY is set, else none). */
export function getReceiptExtractor(): ReceiptExtractor {
  if (env.receiptExtractor() === "anthropic" && env.anthropicApiKey()) return new AnthropicReceiptExtractor();
  return noopExtractor;
}

export async function extractReceipt(file: ReceiptFile): Promise<ReceiptDraft> {
  const extractor = getReceiptExtractor();
  try {
    return await extractor.extract(file);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ...emptyDraft("none"), notes: "Invalid ANTHROPIC_API_KEY; extraction disabled." };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ...emptyDraft("none"), notes: "API rate limit reached; try again in a moment." };
    }
    if (err instanceof Anthropic.APIError) {
      return { ...emptyDraft("none"), notes: `API error (${err.status}); fill the form manually.` };
    }
    throw err;
  }
}
