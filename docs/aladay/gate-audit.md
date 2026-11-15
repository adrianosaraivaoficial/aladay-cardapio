# Auditoria do primeiro gate

Verificação de código realizada em 14/11/2026. O gate não autoriza ativação comercial, migração em produção nem contratação de serviços. As flags Intelligence permanecem desativadas por padrão.

## Evidências anteriores à implementação

| Área | Estado observado | Impacto e encaminhamento |
| --- | --- | --- |
| Onboarding | POST de tenant protegido por superadmin e transacional; criação de proprietário protegida; proprietário existente precisa da senha atual | Não equivale a onboarding público. Manter provisionamento administrativo; testar tenant + owner + primeira sessão completos antes de oferecer autosserviço |
| Equipe | Middleware global bloqueia escrita de KITCHEN_STAFF salvo status de pedido; escopo tenant validado | Campo permissions não é mecanismo de capacidades. Rotas novas exigem OWNER/SUPER_ADMIN explicitamente |
| Catálogo | Autosync substitutivo, exclusão de produto/categoria sem confirmação e erros de HTTP ignorados | Bloqueador relacionado ao importador: revisão e confirmação devem preceder publicação; resposta só após commit; conflitos precisam ser visíveis |
| CRM | Cache global aladay_prod_customers_v2 sem atribuição confiável de tenant; consentimento inferido de pedidos; notas só em React | Bloqueador maior para liberação comercial. Não converter nem apagar automaticamente o cache. Exigir atribuição explícita, preview, retenção e confirmação |
| Mesas | Número no pedido e quantidade de mesas persistidos; conta chamada/servido em useState | Estados compartilhados precisam de persistência e controle concorrente |
| Pagamentos | Pix estático pendente; settlement autenticado valida valor e identificador; Asaas consulta estado do provedor | Preservar distinção. Recuperação da criação de assinatura necessita teste específico de valor/customer divergente |
| Testes | Integração em PostgreSQL descartável e CI existentes; ausência inicial de E2E | Não declarar gate comercial concluído sem execução real e E2E dos fluxos críticos |

## Implementação CRM e mesas

[crm.sql](../../database/crm.sql) adiciona clientes por tenant, prévias de migração, histórico versionado com snapshot de recuperação e estados de mesas. Todas as entidades possuem FK para tenant e remoção em cascata. SQL é aditivo e deve ser aplicado somente em banco descartável/staging autorizado; não houve migração de produção nesta implementação.

[crm.ts](../../backend/crm.ts) exige o guard tenant e OWNER/SUPER_ADMIN. Clientes são identificados pelo telefone normalizado dentro do tenant, limitados a 2.000 entradas/2 MB por importação. Dados desconhecidos, consentimento não booleano, telefone inválido/duplicado e origem divergente são rejeitados. Consentimento ausente é false. Histórico de pedidos não concede consentimento.

GET customers retorna clientes persistidos e resumo do histórico, sem snapshots. PUT customers exige customer e expectedVersion (0 para novo). Migration-preview exige sourceTenantSlug igual ao tenant selecionado, clientes e retentionDays entre 1 e 90. A prévia expira após 30 minutos, pertence ao usuário e registra o hash do CRM atual. Migrate exige previewHash, confirmed=true, sourceTenantSlug e o mesmo retentionDays. Mudança concorrente invalida a prévia; repetição da confirmação retorna o resultado já registrado. Importação faz merge por telefone e nunca remove clientes ausentes.

Snapshot inclui CRM anterior e dados normalizados recebidos. expires_at registra o prazo explicitamente escolhido. A limpeza acontece ao acessar CRM/prévia; não representa remoção imediata ao vencer. Operação comercial deve agendar limpeza periódica e definir prazo também para backups de infraestrutura. Snapshots não são expostos pela API. Cache do navegador deve permanecer intacto, inclusive após sucesso; a UI é responsável por não regravá-lo durante o assistente.

GET/PATCH tables/:number/state persistem billRequested e servedOrderIds com expectedVersion; IDs servidos precisam pertencer à mesma mesa e tenant. Não alteram pagamento nem status do pedido. Conflito retorna 409. Essas rotas são reservadas ao proprietário nesta fase; papel de garçom exige contrato próprio antes de liberação.

## Verificação necessária

Executar testes unitários de CRM com `node --import tsx --test tests/crm.test.ts`. A suíte existente de integração exige TEST_DATABASE_URL com sufixo _test. Adicionar ao cenário PostgreSQL: owner/staff/outro tenant; preview antes de escrever; consentimento ausente false; concorrência invalida preview; duplo migrate gera uma versão; rollback não altera clientes; retenção divergente rejeitada; snapshot deixa de existir após expiração e limpeza; versão de mesa concorrente retorna 409; IDs de outra mesa/tenant são rejeitados.

E2E antes de liberação: preview com diferenças de telefone/notas/consentimento; usuário cancela sem escrever; confirmação mostra resultado real; cache legado permanece byte a byte intacto; falha de rede mantém rascunho e exibe erro; reload preserva conta chamada/servido. Pendências maiores de onboarding, CRM histórico e regressão de pagamentos devem permanecer registradas, sem bloquear desenvolvimento local com flags desligadas.

Verificação desta entrega: `npm run lint` e testes unitários CRM passaram. [crm.integration.test.ts](../../tests/crm.integration.test.ts) implementa os cenários de PostgreSQL para isolamento, confirmação, idempotência, consentimento, conflitos e expiração. A tentativa inicial de executá-lo com permissão de socket local foi rejeitada pelo usuário; esse resultado não é aprovação do teste. A execução integrada deve registrar o resultado real posteriormente.

[intelligence.integration.test.ts](../../tests/intelligence.integration.test.ts) prepara testes reais de flags, autorização, orçamento concorrente com teto e liquidação idempotente, isolamento de jobs, diff obsoleto, publicação simultânea, confirmação de duplicidades e rollback provocado por trigger no audit. Usa somente banco `_test`, tenants e trigger exclusivos com limpeza localizada. [menuImportAi.test.ts](../../tests/menuImportAi.test.ts) cobre JSON de IA inválido/suspeito, remoção de descrições/imagens e falha de provedor injetado sem transmissão externa, mantendo reserva e rascunho. A execução integrada é responsabilidade do runner principal autorizado; preparação e lint não equivalem a execução desses cenários.

Revisão estática de analytics: queries usam parâmetros e escopo tenant; eventos não aceitam nome, telefone, IP ou texto livre; receita exige prova persistida de liquidação Pix. Montagem precisa de guard OWNER/SUPER_ADMIN para leitura e superadmin para rebuild; eventos públicos exigem allowlist exata e rate limit persistente. Limitações: pedidos/receita permanecem no canal unknown, agregações exigem rebuild explícito, categorias de produto refletem cadastro atual; limite de volume por created_at não limita settlements de pedidos antigos. Revisão estática da IA: flag, autorização externa explícita, configuração, checksum e reserva precedem transmissão; escrita revalida versão/flag; reserva conservadora persiste em erro. Teto configurado precisa cobrir custo máximo real do modelo e arquivo, com conciliação administrativa; o código não verifica tabela de preços do provedor.
