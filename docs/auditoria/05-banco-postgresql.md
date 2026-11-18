# PostgreSQL e migrações — 17/11/2026

## Esquema e fluxos

[database/easypanel-init.sql](../../database/easypanel-init.sql) define tenants, catálogo, pedidos, Pix, outbox, usuários, sessões, OTP, rate limits, assinatura e webhooks. Os outros SQL em [database/](../../database/) criam Intelligence, CRM, importação, analytics, upsell e feedback. [scripts/migrate.mjs](../../scripts/migrate.mjs) faz preflight de duplicidades em transação de leitura e exige `MIGRATION_DATABASE_URL` mais `--apply --confirm-database=<nome exato>` para aplicar DDL em transação com advisory lock e ledger de checksums. O executor aplicou sete scripts na primeira execução e nenhum na segunda, em banco descartável. Novas migrações devem ser adicionadas como arquivos, não editadas após aplicação.

Checkout e gravação de evento de outbox são transacionais em [server.ts](../../server.ts); testes de 12 checkouts concorrentes e rollback em falha de outbox passaram. [backend/database.ts](../../backend/database.ts) fixa `statement_timeout` local de 15 segundos em transações. Pix usa unicidade por pedido e por EndToEndId; webhooks têm chave de idempotência. Índices compostos existentes incluem pedidos `(tenant_slug, created_at)`, eventos analíticos `(tenant_slug, received_at)` e outras consultas por tenant/período. Não foram medidos planos `EXPLAIN ANALYZE` nem latências de produção; nenhum índice adicional foi criado.

## Integridade e riscos

| Área | Observação e ação |
| --- | --- |
| Chaves de escopo | `categories`, `products`, `orders` e `pix_transactions` têm FKs compostas `NOT VALID`, que protegem novas linhas mas não certificam histórico. Validar depois de reconciliar inconsistências. |
| Referências ainda parciais | `subscriber_users.tenant_slug`, `asaas_subscriptions.tenant_slug`, outbox e algumas referências em módulos usam texto/ID sem FK composta. Avaliar constraints incrementais após checar superadmin `*`, retenção e exclusões. |
| Migração controlada | Índices únicos de idempotência, Pix e escopo podem falhar diante de duplicatas históricas. O preflight também verifica slug de tenant e email. Fazer backup e restauração ensaiada antes do rollout; nunca eliminar duplicidades financeiras automaticamente. |
| Exclusão de tenant | Há rota administrativa que remove dados dependentes por transação. Não foi executada em produção; o teste de integração a exercita apenas no banco descartável. Exigir confirmação operacional e plano de retenção antes de uso real. |
| RLS | Ausente. Piloto em staging deve incluir contexto transacional, papel sem bypass, superadmin, jobs, webhooks e funções de manutenção. Ativar apenas após matriz A/B completa. |
| Desempenho | Consultas de relatório e joins por tenant merecem benchmark com volume representativo. Índices devem seguir filtro, ordenação e plano real; não foram criados por especulação. |

## Evidências e limites

Os 20 testes de integração e oito Playwright passaram em PostgreSQL 17 descartável. Configurações Pix agora leem do banco e modelos de notificação usam atualização `jsonb` atômica; o teste concorrente preservou duas edições em chaves distintas. Não houve inspeção de dados, estatísticas ou índices de produção; portanto não se afirma integridade histórica, ausência de consultas lentas nem prontidão de migração de produção.
