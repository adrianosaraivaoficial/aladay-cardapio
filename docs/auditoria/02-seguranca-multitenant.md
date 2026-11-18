# Segurança multi-tenant — 17/11/2026

> Atualização de 18/11/2026: a matriz de leitura e de IDs cruzados foi ampliada em banco de teste descartável. Os resultados de 17/11 abaixo permanecem como histórico da primeira rodada.

## Modelo atual

O JWT traz `tenant_slug`, `tenant_id` e função. [server.ts](../../server.ts) valida assinatura e sessão persistida, compara o tenant do token nas rotas com slug, e aplica guardas específicos para pedidos, configuração e módulos. SQL dos módulos de CRM, Intelligence, analytics, upsell e feedback usa `tenant_slug` nos filtros relevantes inspecionados. [database/easypanel-init.sql](../../database/easypanel-init.sql) tem chaves compostas de escopo `NOT VALID` para categorias, produtos, pedidos e Pix novos. Ainda não há RLS.

## Testes executados

O banco `aladay_test` foi criado em contêiner PostgreSQL 17 descartável local, sem volume e sem conexão com produção. [tests/integration.test.ts](../../tests/integration.test.ts) cria `test-a` e `test-b`, proprietários independentes, funcionário de cozinha e superadmin; usa HTTP real. Os 20 testes de integração e oito Playwright passaram. As suítes contêm acesso cruzado, colisão de IDs de catálogo, RBAC, transações, pagamentos, CRM, analytics, Intelligence, upsell e feedback.

| Operação exercitada | Identidade e resultado observado |
| --- | --- |
| CRM, Intelligence, analytics, upsell e feedback de `test-b` | Token do proprietário de `test-a`: 403. |
| Pedidos de `test-b` | Token do proprietário de `test-a`: 403. |
| Leitura e mudança de status de pedido de A | Proprietário de B: 404; leitura pelo proprietário de A: 200. |
| Configuração Pix de A/B | Proprietário oposto: 403 nos dois sentidos; proprietário correto: 200. |
| Configuração Pix de A | Cozinha de A: 403 após correção. |
| Dados completos do tenant em rotas públicas | Cozinha de A recebe DTO público, sem `pixConfig`, `pixKey`, instância Evolution ou modelos de notificação. |
| CRM, Intelligence, analytics, upsell e feedback de A | Cozinha de A: 403 para as operações testadas. |
| Escrita de configurações de A | Cozinha de A: 403. |
| Colisão de ID de produto B ao importar para A | 409; produto de B permanece com valor original. |
| Atualização Pix de A | Cozinha de A e proprietário de B: 403; proprietário de A: 200 e valor persistido. B mantém sua chave. |
| Edição concorrente de modelos de A | Duas chaves distintas sobreviveram em PostgreSQL; proprietário de B não pôde escrever em A. |

## Falha corrigida

Antes da alteração, `canAccessTenant` autorizava `KITCHEN_STAFF` a ler o objeto interno de tenant em `GET /api/v1/tenants/:slug` e `/catalog`. `GET /api/v1/tenants/:slug/pix-config` aceitava a mesma função. Isso expunha configuração Pix e campos internos a um perfil operacional do próprio restaurante. [server.ts](../../server.ts) agora retorna o DTO público para cozinha e exige proprietário ou superadmin na leitura da configuração Pix. A regressão está em [tests/integration.test.ts](../../tests/integration.test.ts).

## Ampliação de 18/11/2026

A inspeção das leituras privadas encontrou `GET /api/v1/asaas/subscription/:slug`, seu `/check-status` e `GET /api/v1/tenants/:slug/notification-templates` acessíveis a `KITCHEN_STAFF` do próprio tenant. A resposta de assinatura inclui dados do titular e faturas; os modelos são configuração administrativa. [server.ts](../../server.ts) agora exige `TENANT_OWNER` ou `SUPER_ADMIN` nessas três leituras, após conferir o escopo do tenant.

[tests/integration.test.ts](../../tests/integration.test.ts) verifica 403 para cozinha de A e proprietário de B nas leituras de Pix, modelos, exportação analytics e assinatura de A; também verifica o sentido B → A. Proprietário de A e superadmin continuam lendo os modelos de A. Além disso, PUT, DELETE e PATCH de um produto de B enviados pelo proprietário de A pela rota de A retornam 404; nome, preço e disponibilidade de B permanecem intactos.

`npm run lint`, os 38 testes unitários e os 22 testes de integração passaram. A integração usou PostgreSQL 17 em contêiner local descartável `aladay_test`, com as sete migrações aplicadas antes de iniciar a API. A primeira tentativa da suíte foi bloqueada pelo esquema incompleto; após a migração, todos os casos passaram. Os testes não consultaram produção.

## Limites e próximos controles

- Os testes não cobrem todas as combinações de método, recurso e função. Em especial, devem ser ampliados para cancelamento e reativação de assinatura com dados A/B independentes, demais exclusões e webhooks. A auditoria estática encontrou escopo nos caminhos principais, mas isso não substitui testes exaustivos.
- IDs globais de produto e categoria impedem colisões silenciosas, mas o modelo misto de `tenant_id` e `tenant_slug` exige consistência em cada gravação. Auditar dados históricos antes de validar as constraints `NOT VALID`.
- RLS pode ser uma segunda barreira: criar papel de aplicação sem `BYPASSRLS`, contexto de tenant definido por transação com `SET LOCAL`, políticas `USING` e `WITH CHECK`, e testes de jobs/admin/webhooks sem contexto de usuário. Aplicar primeiro em staging; a conexão compartilhada e fluxos de superadmin precisam de desenho explícito. Não ativar políticas em produção de modo global sem essa transição.
- Pix e modelos de notificação agora são lidos do PostgreSQL, com atualização de modelos atômica. Outros caches podem criar leituras divergentes entre réplicas. Testar duas instâncias sobre o mesmo banco antes de escalar horizontalmente.
