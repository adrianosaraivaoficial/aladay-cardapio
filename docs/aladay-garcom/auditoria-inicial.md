# Aladay Garçom · Auditoria inicial

## Escopo e revisão

Repositório `adrianosaraivaoficial/aladay-cardapio`. A consulta ao remoto confirmou `main` em `e323cbbe58e9e2cf2279a15ae99809b4d8319e98`. O incremento 0 parte desse commit na branch `feature/aladay-garcom`. O diagnóstico usa o código, os testes e a documentação do checkout, com revisão de frontend e qualidade em paralelo. Nenhuma configuração, credencial ou banco da VPS foi alterado.

## Arquitetura observada

| Área | Implementação e referência |
| --- | --- |
| Interface | React 19, TypeScript, Vite e Tailwind. A SPA usa estado de navegação em `src/App.tsx`. O Express serve o build e o fallback. A demo tem entrada independente em `demo.html` e `demo-routes.ts`. |
| API e dados | Express 4 em `server.ts` e módulos em `backend/`. PostgreSQL via `pg`, com SQL parametrizado e sem ORM. `backend/database.ts` oferece transações, timeout local e resposta somente após commit. |
| Migrations | `getInitSqlScript` em `server.ts` carrega uma lista explícita de scripts em `database/`. A inicialização executa o conjunto em transação sob advisory lock. Um arquivo SQL novo precisa entrar na lista e ser validado em instalação limpa e atualização. |
| Identidade e sessão | Login e OTP em `server.ts` e `src/components/AuthPortalView.tsx`. Bearer JWT com expiração, emissor, audiência e sessão revogável em PostgreSQL. O servidor relê a conta e o vínculo com a sessão. O cliente persiste a sessão em `src/App.tsx`. |
| Escopo | O middleware global restringe rotas. `requireTenantAccess` e `requireOrderAccess` vinculam recursos à conta autenticada. O schema possui chaves e referências por tenant em áreas críticas. O deploy documenta que a aplicação não usa RLS. |
| Eventos | `src/App.tsx` consulta pedidos autenticados por polling de 3,5 segundos, evita sobreposição e aborta ao trocar de contexto. Não foi encontrado WebSocket ou SSE operacional. O outbox em `backend/outbox.ts` é para entrega de eventos de backend, com lease e tentativas. |
| Integrações | O checkout grava pedidos e eventos no PostgreSQL. O outbox pode entregar eventos ao n8n. Evolution API tem operações e configurações próprias em `server.ts` e `backend/integrations.ts`. `backend/payments.ts` trata Pix bancário e liquidação autenticada. Asaas tem endpoints e módulos próprios de assinatura, cobrança e reconciliação. Nenhum caminho Mercado Pago é requisito de execução neste incremento. |
| Operação | `Dockerfile` usa Node 22, usuário sem privilégios e prontidão em `/api/v1/ready`. `DEPLOY_EASYPANEL.md`, os arquivos Compose e scripts de backup/restore definem staging e recuperação. `.github/workflows/ci.yml` usa PostgreSQL 17 e roda checagens, suítes e build Docker. |

## Esquema e pontos de reúso

- `tenants` identifica o restaurante por ID e slug e guarda `tables_count`. `categories` e `products` representam o catálogo; o produto armazena preço inteiro em centavos, disponibilidade e grupos de adicionais em JSONB. Consulte `database/easypanel-init.sql` e `backend/catalog.ts`.
- `subscriber_users`, `auth_sessions` e `auth_otp` já representam funcionários e sessões nos papéis suportados. Os papéis de JWT presentes são `SUPER_ADMIN`, `TENANT_OWNER` e `KITCHEN_STAFF`. O seletor visual de papel no painel e o tipo `UserRole` não concedem permissões de backend.
- `orders` é a origem do KDS, com `order_type`, `table_number`, itens em JSONB, valores em centavos, estados operacionais e financeiros distintos, chave de idempotência por tenant e hash da requisição. O checkout público em `server.ts` valida catálogo, adicionais e totais no servidor. `PATCH /api/v1/orders/:id/status` valida transições, exige liquidação para confirmar Pix e grava evento na mesma transação.
- `pix_transactions`, `webhook_events` e `outbox_events` dão suporte ao histórico já existente. `asaas_subscriptions` e `billing_operations` têm o ciclo de cobrança SaaS. O fechamento de salão deve usar a evidência financeira adequada ao pedido e preservar esses contratos.
- `tenant_table_states`, em `database/crm.sql`, usa chave composta por tenant e número de mesa. `backend/crm.ts` oferece GET/PATCH por mesa com versão esperada e validação dos pedidos servidos. O registro persiste solicitação de conta e marcações de entrega; não identifica uma ocupação ou comanda de forma estável.
- `src/components/TableWaiterManagementView.tsx`, `RestaurantAdminView.tsx`, `ConsumerMenuView.tsx`, `ThermalTicketModal.tsx` e `src/index.css` oferecem mapa, KDS, seletor de adicionais, impressão e tokens visuais. `src/utils/publicMenuUrl.ts` gera `/cardapio/:slug?mesa=NN`; esse contrato precisa seguir válido.

## Lacunas e riscos confirmados por inspeção

| Risco | Implicação para o módulo |
| --- | --- |
| Lançamento legado de garçom | `TableWaiterManagementView` monta ID, preço e nome de garçom no cliente e chama `onAddOrder`. O callback em `App.tsx` atualiza estado local. Reutilizar esse caminho faria a interface declarar sucesso sem persistência transacional nem envio confiável à cozinha. |
| Fechamento legado | O painel atual tenta marcar pedidos como entregues individualmente e depois limpa estado auxiliar. A seleção visual de pagamento não comprova liquidação. O novo fechamento precisa conferir a comanda e sua evidência financeira na mesma transação. |
| Ocupação e QR | O mapa infere ocupação a partir de pedidos ativos do número da mesa e ignora entregues e cancelados. Uma comanda precisa sobreviver à entrega de uma rodada e distinguir ocupações sucessivas. A vinculação de pedidos QR à comanda ativa exige regra explícita; número da mesa sozinho não prova a qual ocupação um pedido pertence. |
| Papéis novos | A allowlist de JWT e o middleware global têm regras específicas para cozinha e administração. É preciso projetar escopos mínimos para garçom, gerente e caixa, com vínculos verificados no servidor. Nenhum papel visual deve ampliar acesso legado. |
| Flag por restaurante | `backend/intelligence.ts` e `database/intelligence.sql` têm padrão por tenant e default-off, mas o conjunto de recursos é fechado e a API e a UI são próprias. Propor configuração separada `garcom_enabled`, negar por padrão nas rotas novas e conferir também transições concorrentes durante a desativação. |
| Concorrência | Estado de mesa legado já usa versão esperada. Comanda precisa combinar integridade referencial por tenant, unicidade de comanda ativa, transação e versão para mutações. A chave idempotente deve distinguir repetição do mesmo comando de reutilização com outro payload. O checkout serializa a numeração do pedido com trava de tenant; a escrita de salão precisa compartilhar essa coordenação e respeitar a ordem de aquisição de travas. |
| Polling e offline | A visão atual faz uma leitura por mesa, a listagem do KDS tem limite de 100 pedidos e o conjunto legado não oferece reconciliação específica de comandas. Propor leitura agregada autenticada, atualização dentro do escopo do tenant e busca autoritativa após 409 ou reconexão. PWA sem fila de pedidos e sem cache de sessão ou API. |
| Dados legados | A API administrativa possui exclusão explícita de dados de tenant. Qualquer nova referência precisa definir retenção e comportamento de exclusão sem apagar histórico silenciosamente ou quebrar o fluxo existente. |
| Migração e pagamentos | Não há autorização para executar mudança na VPS. O plano deve incluir backup e ensaio de restauração verificados em staging. Confirmar com o produto quais comprovantes permitem baixa manual e quem pode registrá-la. Mercado Pago fica como ponto de extensão até aprovação e configuração específicas. |

## Plano incremental de arquivos

Os nomes novos abaixo são propostos. O incremento 0 entrega somente esta auditoria e seu baseline.

| Incremento | Alterações previstas | Critério de verificação |
| --- | --- | --- |
| 1 · Sessão, permissão, dados | `backend/garcom.ts`, possível módulo dedicado de permissões, `database/garcom.sql`, montagem e bootstrap em `server.ts`, tipos do módulo e testes de integração. Delimitar flag, vínculos, comandas, snapshots e auditoria. | Flag desligada preserva APIs existentes; acesso sem sessão, sem vínculo ou de outro tenant é negado; abertura simultânea resulta em uma comanda ativa. |
| 2 · Mesas e comandas | Entrada lazy em `src/App.tsx` e área isolada em `src/garcom/`. Manifesto, ícones e service worker restrito ao escopo da rota. Usar componentes visuais e catálogos compatíveis. | Adicionais obrigatórios, disponibilidade e totais validados no servidor; toque, teclado, erro, offline e reconexão testados. |
| 3 · Pedidos e cozinha | Extrair o núcleo transacional compatível do checkout para que o salão reutilize a origem `orders`; manter o contrato do checkout público e a publicação durável de eventos. Adaptar leitura autenticada e KDS somente onde necessário. | Envio duplo, repetição após perda de resposta e concorrência geram um único pedido; KDS recebe e avança o pedido sem alterar o pagamento. |
| 4 · Caixa | Serviços de conferência e fechamento em `backend/`, UI de caixa em `src/garcom/` e auditoria da confirmação financeira. Definir vínculo de comanda, pedido e evidência financeira antes da migração. | Sem confirmação válida a comanda continua aberta; fechamento é atômico, idempotente e imutável no fluxo comum. |
| 5 · Segurança e piloto | Testes e documentos de arquitetura, dados, API, permissões, testes, deploy/rollback e operação em `docs/aladay-garcom/`. | Staging com flag de um restaurante, backup restaurado em teste, métricas de erro, latência e duplicação, rollback ensaiado. |

## Baseline e proteção de regressão

- `.github/workflows/ci.yml` roda `npm ci`, `npm run lint` (TypeScript), `npm test`, `npm run test:integration`, `npm run build`, Playwright Chromium e build da imagem.
- `tests/integration.test.ts` protege autenticação e revogação, escopo entre tenants, checkout concorrente, idempotência e rollback com outbox, Pix, assinaturas e concessão de acesso. `tests/crm.integration.test.ts` protege leitura e escrita versionada do estado de mesa. `tests/e2e/intelligence.spec.ts` protege o KDS operacional e a separação dos estados financeiro e de produção. `tests/e2e/demo.spec.ts` protege landing, demo isolada e interface Pix.
- Acrescentar cenário completo para funcionário autenticado, flag, reatribuição ou revogação, IDOR em cada recurso, preços e adicionais, fechamento, reconexão e cache. Repetir regressão de delivery, retirada, QR por mesa, outbox/WhatsApp e pagamentos. A cobertura atual de mesa não demonstra persistência de comanda, e o teste local de integrações não prova entrega real de WhatsApp.

Resultado local no commit-base. Node 24.22.3, PostgreSQL 18.7 descartável e Chromium Playwright. A versão do Dockerfile é Node 22 e a do PostgreSQL no CI é 17.

| Comando | Resultado |
| --- | --- |
| `npm run lint` | Aprovado, incluindo typecheck via `tsc --noEmit`. |
| `npm test` | 41 aprovados. |
| `npm run test:integration` | 18 aprovados com `TEST_DATABASE_URL` local e banco de sufixo `_test`. |
| `npm run test:e2e` | 12 aprovados em Chromium. |
| `npm run build` | Aprovado. |
| Build da imagem Docker | Não executado localmente. Docker indisponível neste ambiente. |

A implementação e a validação das migrations do novo módulo ficam para o incremento 1. O piloto deve continuar bloqueado até staging, backup restaurado em teste e cobertura das integrações requeridas.
