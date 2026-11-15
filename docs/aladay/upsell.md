# Sugestões determinísticas

O recurso `upsell` permanece desligado por padrão e exige liberação/ativação do tenant. Cada endpoint verifica a flag antes de interpretar o payload. Não há IA, serviço externo, chamada paga, alteração automática de carrinho ou desconto implícito.

## Regras do proprietário

- `GET /api/v1/tenants/:slug/upsell/rules` retorna `{rules:[...]}`.
- `POST .../rules` recebe a regra e retorna `{rule}` com ID e versão.
- `PATCH .../rules/:id` (alias `PUT`) recebe `{version,...camposAlterados}`. Versão obsoleta gera 409.
- `DELETE .../rules/:id?version=N` arquiva a regra, incrementa a versão e mantém auditoria e métricas.
- `GET .../metrics?days=30` agrega impressões e adições dos últimos 1–93 dias.

O guard exige tenant correto e papel `TENANT_OWNER` ou `SUPER_ADMIN`. Há até 100 regras ativas/arquiváveis por tenant. CRUD registra autor, versão e snapshot da configuração na auditoria.

Regra: `{id,version,name,enabled,priority,triggerProductIds,triggerCategoryIds,suggestedProductIds,minSubtotalCents,maxSubtotalCents,weekdays,startTime,endTime,timezone,maxImpressionsPerSession}`. Na criação, omita `id/version`; `name` e `suggestedProductIds` são obrigatórios. `enabled` começa falso; prioridade vai de -1000 a 1000; até 30 IDs por lista. Todos os produtos/categorias precisam pertencer ao tenant. `minSubtotalCents` padrão zero; `maxSubtotalCents` pode ser `null`.

Gatilhos de produtos e categorias são opcionais: qualquer item da lista de produtos satisfaz o gatilho de produto, qualquer item da lista de categorias satisfaz o gatilho de categoria. Quando ambas existem, ambas precisam ser satisfeitas. O subtotal usa preços base atuais verificados no banco, multiplicados por quantidades; não inclui taxa de entrega ou adicionais ainda não informados.

`weekdays` usa domingo=0; padrão todos. `startTime/endTime` usam HH:MM no fuso IANA configurado, padrão `America/Sao_Paulo`. Início igual ao fim significa dia inteiro. Janela noturna pertence ao dia em que começou; segunda 22:00–02:00 inclui terça 01:00. Fim é exclusivo. Ordenação determinística: prioridade descendente, UUID da regra, ID de produto. Não há aleatoriedade para classificar produtos.

## Sugestões ao consumidor

`GET /api/v1/tenants/:slug/upsell/suggestions?sessionId=UUID&requestId=UUID&checkoutId=UUID&cart=JSON` é público. `cart` contém apenas `[{productId,quantity}]`; até 100 itens distintos, quantidades de 1 a 99. IDs de produto e disponibilidade são validados no tenant e preços vêm exclusivamente do banco. Nenhum preço vindo do navegador é aceito. A resposta é `{suggestions:[{offerId,ruleId,product:{id,name,description,priceCents,imageUrl,categoryId}}],checkoutId,expiresAt}`.

O checkout ID é um identificador aleatório da tentativa de compra do navegador, sem telefone/email. `requestId` deve ser novo quando o carrinho mudar; repetições do mesmo request reutilizam ofertas. Reutilizar o ID com outra sessão, checkout ou carrinho gera 409. No replay, preço e disponibilidade são relidos do banco; regra desativada, arquivada ou alterada deixa de exibir ofertas antigas.

O consumidor pode receber até três sugestões, sem repetir produtos já no carrinho. `maxImpressionsPerSession` (1–10, padrão 1) reserva o limite na emissão de ofertas, antes da confirmação visual, evitando que requisições concorrentes ultrapassem o limite. O contador vale por regra durante a vida daquele UUID de sessão, inclusive ofertas emitidas que não chegaram a ser vistas. A emissão é serializada pelo bloqueio do tenant e limitada a 10.000 requests por tenant a cada 24 horas. Ofertas expiram em 15 minutos. O limite de requisições públicas do servidor também se aplica.

A interface mostra a oferta e só adiciona o produto após ação explícita. O checkout existente continua recalculando preços pelo catálogo; a oferta não concede autoridade para cobrar um preço antigo nem para alterar o carrinho automaticamente.

## Métricas e limites de atribuição

`POST .../upsell/events` recebe apenas `{eventId:UUID,offerId:UUID,sessionId:UUID,kind:'impression'|'add_to_cart'}`. Exige oferta emitida para o mesmo tenant/sessão e ainda válida. Eventos são únicos por tenant/eventId e por tenant/oferta/tipo; retries não inflam os contadores. Alterar payload sob a mesma chave gera 409. Nenhum `orderId`, status de pagamento ou valor arbitrário é aceito.

O checkout pode enviar `upsellAttribution:{sessionId,checkoutId,offerIds:[UUID]}` (até três ofertas). O backend chama `attributeUpsellOrder` após inserir o pedido validado. A função valida tenant, sessão, checkout ID, oferta não expirada, produto presente nos itens validados e evento `add_to_cart` já persistido. A mesma oferta só pode ser atribuída a um pedido; repetição é idempotente. Metadados inválidos são ignorados. O chamador usa savepoint para que falhas de infraestrutura na atribuição opcional não bloqueiem a venda.

`GET .../upsell/metrics` retorna `{days,impressions,addToCart,purchaseConversions,createdOrdersAttributed,paidOrdersAttributed,attributionNote,computedAt}`. Impressões e adições são telemetria do navegador, não prova de compra. `createdOrdersAttributed` inclui pedidos correlacionados ainda pendentes; `purchaseConversions` conta pares oferta/pedido somente quando há Pix comprovado, com os mesmos critérios financeiros do analytics. `paidOrdersAttributed` evita contar várias ofertas como vários pedidos. Cancelamento/estorno remove a conversão na próxima leitura, sem reconstrução. O período usa a data de atribuição, e não a data de liquidação. O evento público de compra nunca é aceito. A correlação comprova participação da oferta no checkout, não causalidade comercial.

DDL idempotente em `database/upsell.sql`, aplicado pelo orquestrador local. Regras arquivadas preservam o histórico. Dados seguem exclusão do tenant em cascata; não há retenção automática. Nenhuma migração em produção ou ativação para clientes faz parte do módulo.

Verificação: `node --import tsx tests/upsell.test.ts`; integração: `TEST_DATABASE_URL=... node --import tsx --test tests/upsell.integration.test.ts` em banco descartável com sufixo `_test`. Testes criam apenas tenants próprios e limpam seus dados.
