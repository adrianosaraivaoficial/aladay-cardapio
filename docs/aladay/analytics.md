# Analytics persistente

O recurso `analytics` exige liberação e ativação por tenant; permanece desligado inicialmente. Eventos e relatórios conferem a flag antes de processar dados. Relatórios usam o guard administrativo existente; reconstrução exige superadmin.

## Contratos

- `POST /api/v1/tenants/:slug/analytics/events` público: `{eventId,sessionId,kind,channel,productId?}`. IDs de evento e sessão são UUIDs aleatórios. `kind`: `menu_view`, `product_view`, `product_click`, `checkout_start`; `channel`: `web`, `whatsapp`, `qr`, `unknown`. Eventos de produto exigem um produto pertencente ao tenant. Não aceita PII, valor de compra, horário do cliente, status financeiro nem campos extras. A sessão deve ser aleatória por navegador, sem codificar telefone/email.
- `POST .../analytics/rebuild` superadmin: `{from,to,timezone?}`. Datas ISO civis, inclusivas; máximo de 93 dias, mais o período anterior equivalente. Padrão de 30 dias em `America/Sao_Paulo`. Reconstrói todos os canais. Retorna `{jobId,status:'completed',version,computedAt,from,to,timezone}`. O intervalo retornado inclui a comparação anterior.
- `GET .../analytics/summary?from=...&to=...&timezone=...&channel=...`: `{metrics,previous,comparison,...metadata}`. Cada comparação tem `delta` e `percent`; baseline zero produz percentual `null`.
- `GET .../analytics/timeseries`: `{rows:[{date,channel,...metrics}],...metadata}`.
- `GET .../analytics/products`: `{rows:[{productId,name,categoryId,unitsOrdered,unitsConfirmed,confirmedItemValueCents,views,clicks}],...metadata}`, até 1.000 produtos.
- `GET .../analytics/export`: `{filename,csv,...metadata}`. CSV agregado diário, sem dados pessoais; o cliente salva o texto como arquivo.

Metadados: `{timezone,period:{from,to},channel,computedAt,version,pending,dataLagSeconds,isStale}`. `computedAt` é o timestamp mais antigo da cobertura retornada; atraso mede segundos desde esse timestamp. `isStale` é verdadeiro com cobertura incompleta, sem cálculo ou atraso superior a cinco minutos. `pending` significa que ainda falta reconstruir dias do período atual/anterior; não significa zero atividade. Nenhum GET recalcula silenciosamente. A interface deve mostrar timestamp e pendência. Não existe worker/cron automático neste incremento: novas compras, eventos e estornos exigem reconstrução administrativa para atualizar agregados.

Métricas: `ordersCount,cancelledOrdersCount,totalOrderValueCents,paidOrdersCount,confirmedRevenueCents,menuViews,productViews,productClicks,checkoutStarts`. `ordersCount` inclui pedidos cancelados; valor de pedidos exclui cancelados/estornados. `paidOrdersCount` é quantidade de liquidações Pix comprovadas no período. Não é um funil de conversão de vendas: sessões de telemetria não são vinculadas a pedidos.

O summary também retorna `metrics.averageTicketCents` (receita comprovada dividida por liquidações, ou `null` sem pagamentos) e o equivalente no período anterior. `conversionRate` permanece `null` com `conversionUnavailableReason` explícito porque não há vínculo verificável sessão/pedido. Nenhum percentual de compra é inferido dos cliques públicos.

## Receita e atribuição

A fonte de receita é exclusivamente `pix_transactions` unida a `orders` por ID e tenant, com `status='PAID'`, `paid_at`, `end_to_end_id`, valor igual ao total do pedido e pedido não cancelado/estornado. `payment_status='paid_online'` isolado, Pix estático pendente, pagamento manual e cobrança de assinatura SaaS não constituem receita confirmada.

Receita é atribuída à data de liquidação; pedidos e unidades pedidas usam a data de criação. Por isso, um Pix tardio pode aparecer em um dia diferente do pedido. Produto usa `totalCents` do snapshot do item (inclui adicionais); taxa de entrega fica somente na receita do pedido. Categorias e nomes usam catálogo atual quando disponível; nomes de itens preservam produtos removidos. Não se infere receita por multiplicação do preço atual do produto.

O schema de pedidos não registra canal de aquisição verificável. Assim, todas as métricas de pedidos/receita ficam em `unknown`; filtros `web`, `whatsapp` e `qr` mostram somente telemetria. Os canais são declarações não autenticadas do navegador, não prova de origem financeira. Não se inventa atribuição nem conversão.

Reconstrução substitui integralmente os agregados do intervalo, com snapshot transacional `REPEATABLE READ`, sem acumular contadores sobre resultados antigos. Eventos duplicados são ignorados pela chave tenant/eventId; reutilizar a chave com outro payload recebe 409. Estorno/cancelamento posterior remove o valor na próxima reconstrução. O backend financeiro atual não possui modelo completo de estorno parcial; o relatório só reflete estados persistidos na fonte financeira. Eventos fora de ordem não regressam estados de pagamento: nenhuma telemetria altera pedidos ou Pix.

## Limites e operação

DDL idempotente em `database/analytics.sql`, aplicado pelo orquestrador local na transação de inicialização. Eventos usam horário de recebimento do servidor, payload até 1.000 caracteres e allowlist. O limite global de requisições públicas continua aplicável. Reconstrução valida IANA no runtime e PostgreSQL, limita a fonte a 100.000 pedidos criados, 100.000 liquidações (inclusive pedidos antigos) e 200.000 eventos no intervalo e usa timeout transacional existente. Índices delimitam tenant/data. Uma disputa simultânea com atualização do tenant pode exigir repetir a reconstrução após erro de serialização.

Não há serviço pago, envio externo, alteração de pedidos ou migração em produção. Não há retenção automática: eventos anônimos persistem e seguem exclusão do tenant em cascata. Relatórios não retornam session IDs, end-to-end IDs, telefone, endereço ou nome do cliente.

Verificação unitária: `node --import tsx tests/analytics.test.ts`. Integração PostgreSQL: `TEST_DATABASE_URL=... node --import tsx --test tests/analytics.integration.test.ts`, usando banco de teste isolado. Integração cria tenants próprios e os remove ao terminar; não trunca tabelas compartilhadas.
