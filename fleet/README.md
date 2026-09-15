# Frota Luanda — gestão de frota Yango

Next.js 16 + Supabase. Cobrança semanal de rendas, modelo vs realidade, log de manutenção a partir de recibos, scorecard de motoristas e um agente semanal de operações. Interface em português europeu; valores em AOA.

Leia `../CONTEXT.md` para o esquema, convenções e regras de negócio.

## Arranque

1. **Supabase**: crie um projecto, depois em *SQL Editor* execute, por ordem, `supabase/migrations/0001…0008`. Opcional: `supabase/seed.sql` (3 viaturas, 3 motoristas, pagamentos de exemplo).
   Com a CLI: `supabase link && supabase db push`.
2. **Utilizador**: crie o seu utilizador em *Authentication → Users*. Depois promova-o:
   ```sql
   update public.profiles set role = 'owner' where id = '<auth user id>';
   ```
3. **Variáveis**: copie `.env.example` para `.env.local` e preencha.
4. `npm install && npm run dev` → http://localhost:3000

## Deploy (Vercel)

* *Root Directory* = `fleet`.
* Defina as variáveis de `.env.example` (incluindo `CRON_SECRET` e `SUPABASE_SERVICE_ROLE_KEY`).
* `vercel.json` agenda os crons (UTC): segunda 07:00 alertas de renda, 07:30 resumo semanal = 08:00/08:30 em Luanda.

## Scripts

| comando | o que faz |
| --- | --- |
| `npm run check` | typecheck + lint + testes unitários |
| `npm run test` | Vitest (`src/**/*.test.ts`) |
| `npm run test:sql` | aplica migrações + testes SQL num Postgres local (`DATABASE_URL`) |

## Estrutura

```
supabase/migrations   esquema, funções, RLS
src/lib/format.ts     formatAOA e datas (única fonte)
src/lib/time.ts       calendário Luanda (UTC+1), semanas seg–dom
src/lib/rent          rascunhos WhatsApp
src/lib/model         modelo vs realidade (puro, testado)
src/lib/maintenance   categorias, motor de lembretes
src/lib/scorecard     pontuação de motoristas
src/lib/receipts      extractReceipt() → Anthropic vision | sem IA
src/lib/agents        resumo semanal (Claude ou modelo local)
src/lib/data          consultas Supabase (servidor)
src/app/(app)/*       páginas: painel, cobranca, frota, motoristas, recibos, agente, definicoes
src/app/api           cron, export XLSX, extracção de recibos
```
