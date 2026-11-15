# Entrega Aladay Intelligence — 14/11/2026

Implementação local dos incrementos 0–5 do documento de requisitos. A stack React/TypeScript/Express/PostgreSQL foi preservada. Nenhum serviço pago foi ativado, nenhuma mensagem foi enviada a terceiros e nenhuma migração foi executada em produção. As quatro features começam sem liberação e desativadas; não há seed de clientes nem ativação automática.

## Incremento 0 — Pré-requisitos e controles

- Auditoria de onboarding administrativo, CRM/mesas, permissões, catálogo, pagamentos e testes em [gate-audit.md](./gate-audit.md).
- [intelligence.ts](../../backend/intelligence.ts) e [intelligence.sql](../../database/intelligence.sql): flags persistentes, proprietário pode somente desativar, superadmin libera/configura orçamento. As chaves `menu_import`, `analytics`, `upsell`, `feedback` pertencem ao namespace Intelligence. API administrativa `GET/PUT/PATCH /api/v1/tenants/:slug/intelligence`; disponibilidade pública separada em `GET .../intelligence/availability`, sem orçamento ou dados administrativos.
- Reservas de IA serializadas pelo registro de configuração do tenant, por mês UTC, chave idempotente e teto em centavos. `reserveAiBudget` rejeita concorrência acima do orçamento; `settleAiBudget` permite conciliar custo real sem dupla devolução. A conciliação está disponível como função de backend, sem tela ou integração de faturamento automático.
- [crm.ts](../../backend/crm.ts), [crm.sql](../../database/crm.sql), [CrmMigrationView](../../src/components/CrmMigrationView.tsx): atribuição explícita do restaurante de origem, seleção de contatos, diferenças de telefone/notas/consentimento, prévia vinculada ao usuário e ao estado atual, confirmação, importação idempotente e snapshot com retenção escolhida (1–90 dias). Cache legado permanece byte a byte intacto; consentimento ausente é falso e pedidos não concedem consentimento.
- `GET/PUT .../customers`, `POST .../customers/migration-preview`, `POST .../customers/migrate`; notas versionadas no CRM. `GET/PATCH .../tables/:number/state` persistem conta solicitada e pedidos servidos, com versão e validação da mesa/tenant.
- [App.tsx](../../src/App.tsx) substitui autosync por **Salvar catálogo**: prévia de adições/remoções, confirmação e hash do snapshot. [catalog.ts](../../backend/catalog.ts) exige confirmação/hash nas publicações em lote e rejeita estado obsoleto. Importação publicada dispara atualização do estado do catálogo. Exclusões no rascunho pedem confirmação. Atualização de status do pedido aguarda sucesso HTTP antes de alterar estado local.

## Incremento 1 — Importação de cardápio

[menuImport.ts](../../backend/menuImport.ts), [menuImportAi.ts](../../backend/menuImportAi.ts), [menu-import.sql](../../database/menu-import.sql) e [MenuImportView](../../src/components/MenuImportView.tsx).

- CSV/XLSX local; PDF/imagens com rascunho manual ou extração Gemini explicitamente solicitada, configurada e autorizada no servidor. Upload máximo 650 KB, assinatura/tamanho/conteúdo, limites de ZIP/planilha e rejeição de fórmulas/conteúdo ativo.
- `POST /menu-imports`, `GET /menu-imports/:id`, `PATCH /menu-imports/:id/candidates`, `POST /menu-imports/:id/publish`, `POST /menu-imports/:id/extract`, sob prefixo administrativo do tenant.
- Preços ambíguos ficam pendentes; revisão humana, diferenças, conflitos, duplicidades, versões, autor e auditoria. Publicação em transação reutiliza exclusivamente categorias/produtos existentes. Repetição não duplica publicação e falha parcial preserva o catálogo.
- IDs retornados por IA são remapeados para UUIDs novos. Descrições, adicionais e imagens inferidos são removidos; ingredientes/alegações exigem revisão e preenchimento humano. IA não publica diretamente.
- Tentativas externas têm prazo/limite de saída, reserva de custo antes do envio e idempotência por versão. Falha preserva o rascunho e mantém a reserva conservadora até conciliação. Nenhuma chamada real ao provedor foi realizada nesta entrega.

Configuração e limites completos: [menu-import.md](./menu-import.md). O importador CSV/XLSX anterior continua disponível. SheetJS foi atualizado de 0.18.5 para a distribuição oficial 0.20.3, com integridade fixada no lock npm, removendo os avisos de prototype pollution/ReDoS da versão anterior ([distribuição oficial](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)).

## Incremento 2 — Analytics

[analytics.ts](../../backend/analytics.ts), [analytics.sql](../../database/analytics.sql), [AnalyticsView](../../src/components/AnalyticsView.tsx) e [intelligenceAnalytics](../../src/utils/intelligenceAnalytics.ts).

- Eventos anônimos com UUID, allowlist sem dados pessoais e deduplicação; consumidor envia somente com consentimento e feature ativa. Consentimento das métricas internas não inicia GA4.
- `POST /analytics/events`; relatórios `GET /analytics/summary`, `/timeseries`, `/products`, `/export`; `POST /analytics/rebuild` reservado ao superadmin.
- Agregações persistentes idempotentes, período e comparação anterior, fuso IANA, filtros de canal, produtos, ticket médio, exportação e metadados de versão/cálculo/atraso.
- Receita exige Pix efetivamente conciliado: transação PAID, data/identificador de liquidação e valor compatível. Pix estático, status isolado do pedido, pagamentos manuais e assinaturas SaaS não contam. Cancelamento/estorno é refletido na reconstrução.

Limites: reconstrução administrativa explícita; não há worker automático. Conversão geral permanece indisponível porque não há vínculo verificável sessão/pedido; pedidos/receita usam canal `unknown`. Estorno parcial depende de um modelo financeiro futuro. [Detalhes](./analytics.md).

## Incremento 3 — Upsell

[upsell.ts](../../backend/upsell.ts), [upsell.sql](../../database/upsell.sql), [UpsellRulesView](../../src/components/UpsellRulesView.tsx) e [CartUpsellSuggestions](../../src/components/CartUpsellSuggestions.tsx).

- Regras determinísticas com produtos/categorias, subtotal calculado no banco, prioridades, dias/horários/fuso e limite de repetição. CRUD versionado e auditoria; prévia no carrinho mediante ação explícita.
- `GET/POST /upsell/rules`, `PUT/PATCH/DELETE /upsell/rules/:id`, `GET /upsell/suggestions`, `POST /upsell/events`, `GET /upsell/metrics`.
- Ofertas até três por consulta, expiradas em 15 minutos, deduplicação de eventos e preços/disponibilidade relidos no banco. Cliente precisa personalizar/adicionar; não há alteração automática ou IA.
- Atribuição do checkout valida oferta/sessão/produto/pedido e evento de adição; metadados inválidos são ignorados. Savepoint impede falha opcional de atribuição de bloquear a venda. Conversões financeiras só contam pedidos com liquidação Pix comprovada.

Impressões e adições são telemetria consentida; correlação não prova causalidade da oferta. [Detalhes](./upsell.md).

## Incremento 4 — Feedback

[feedback.ts](../../backend/feedback.ts), [feedback.sql](../../database/feedback.sql), [FeedbackAdminView](../../src/components/FeedbackAdminView.tsx), [PublicFeedbackView](../../src/components/PublicFeedbackView.tsx) e [PublicReviewsView](../../src/components/PublicReviewsView.tsx).

- Convite manual para pedido entregue elegível, Pix conciliado quando aplicável; somente hash de token aleatório, expiração, uso único e reemissão confirmada que invalida o link anterior. A interface permite copiar o link; não envia mensagens.
- `POST /orders/:id/feedback-invite`, `GET /feedback`, `PATCH /feedback/:id/moderation`, `DELETE /feedback/:id`, `GET /feedback/public`, sob o prefixo tenant; submissão anônima somente `POST /api/v1/public/feedback` com token.
- Nota de 1–5, comentário opcional, consentimento de publicação desativado inicialmente. Publicação exige consentimento e moderação humana. Avaliações não alteram o pedido. Filtros, indicadores de satisfação, exclusão efetiva e retenção.
- Link público `/?feedback=TOKEN`; o aplicativo retira o token da barra de endereços depois de capturá-lo em memória. Endpoint público expõe somente nota/comentário/data aprovados e consentidos.

Retenção padrão 90 dias, configurável entre 1–365. [Detalhes](./feedback.md).

## Incremento 5 — Integração e validação

Integração em [server.ts](../../server.ts), allowlist explícita em [security.ts](../../backend/security.ts), suíte npm em [run-tests.mjs](../../scripts/run-tests.mjs), E2E em [intelligence.spec.ts](../../tests/e2e/intelligence.spec.ts), [configuração Playwright](../../playwright.config.ts) e CI atualizado. Migrations aditivas são carregadas após o SQL base na transação de inicialização com trava já existente. Apenas bancos locais descartáveis foram usados.

Resultados executados: TypeScript e build passaram; 38 testes unitários, 18 de integração PostgreSQL 17 e sete E2E com Chrome passaram. A rodada E2E verifica importação/revisão/publicação, arquivo suspeito e isolamento, cache CRM e consentimento, upsell explícito no carrinho, cancelamento/confirmação da publicação manual, analytics com liquidação real simulada no banco e avaliação com consentimento/moderação. Em 15/11/2026, lint, os 38 unitários e o build foram repetidos para preparar o deploy; a imagem Docker `aladay:20261115-intelligence` também compilou com sucesso.

O teste da imagem em modo produção utilizou somente PostgreSQL descartável, filesystem somente leitura, `/tmp` temporário, usuário sem privilégios, capabilities removidas e worker/IA desligados. Healthcheck ficou saudável e `/api/v1/health`, `/api/v1/ready`, disponibilidade pública de features e frontend responderam HTTP 200. O container temporário foi encerrado após a verificação. Deploy remoto aguarda identificação do projeto/serviço EasyPanel e autorização específica das migrations de produção, anteriormente vedadas pelo documento de requisitos.

Os testes HTTP principais usam sessões/JWT reais; testes de módulos complementares usam guards isolados para forçar concorrência, conflitos e rollback no PostgreSQL 17. Serviços de pagamento externos são simulados e a extração de IA usa provedor injetado que falha, sem chamada externa. Chrome local testa a interface com rede externa bloqueada.

## Operação, custos e pendências

- Configuração em [.env.example](../../.env.example). IA permanece `MENU_IMPORT_AI_ENABLED=false`, modelo vazio e teto zero. Exige chave/modelo homologado, orçamento liberado e consentimento do proprietário antes de qualquer envio. O teto por chamada precisa ser conservador e validado contra a precificação do modelo; não há descoberta automática de preço nem conciliação de fatura.
- `npm run maintenance:intelligence` mostra contagem de registros expirados sem alterá-los. `npm run maintenance:intelligence -- --execute` remove avaliações/convites/auditoria expirados e elimina prévias/snapshots vencidos do CRM. Agendar em ambiente autorizado e definir retenção de backups de infraestrutura; o código não configura cron externo.
- Alertas, backups externos e infraestrutura continuam sendo responsabilidade operacional. Eventos anônimos analytics/upsell ainda não têm retenção automática; definir política antes da liberação comercial.
- Onboarding público e papéis de equipe por capacidade não foram redesenhados. Provisionamento administrativo e guardas de papel/tenant permanecem. Recuperação Asaas de criação ambígua precisa homologação específica de customer/valor/plano antes do piloto pago; nenhuma credencial foi alterada.
- Recursos de IA reais, homologação comercial de pagamentos e autorização para piloto permanecem pendentes. O próximo incremento recomendado é homologação em staging, com revisão de orçamento, retenção, métricas e operação, antes de qualquer ativação para clientes.
- Em 15/11/2026 o diretório contém um repositório Git inicializado, ainda sem commits e sem remoto configurado; todos os arquivos de aplicação aparecem como não rastreados. Não foi criado commit/PR nem realizado deploy remoto nesta etapa.
