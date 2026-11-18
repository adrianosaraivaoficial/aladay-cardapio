# Consolidação da auditoria e homologação — 17/11/2026

## Entrega desta branch

| Área | Resolvido e arquivos |
| --- | --- |
| Isolamento financeiro | DTO público e guarda de proprietário para Pix em [server.ts](../../server.ts); regressão em [tests/integration.test.ts](../../tests/integration.test.ts). |
| Autenticação | Cookie `HttpOnly`, `SameSite=Strict`, `Secure` em produção, CSRF, troca de Bearer legado e restauração de sessão em [server.ts](../../server.ts), [src/App.tsx](../../src/App.tsx), [src/main.tsx](../../src/main.tsx) e [src/utils/sessionFetch.ts](../../src/utils/sessionFetch.ts). |
| Migração | DDL removido do startup. Preflight, executor separado, confirmação do banco e ledger em [scripts/migrate.mjs](../../scripts/migrate.mjs), [package.json](../../package.json), [Dockerfile](../../Dockerfile), [docker-compose.yml](../../docker-compose.yml), [docker-compose.staging.yml](../../docker-compose.staging.yml) e [ci.yml](../../.github/workflows/ci.yml). |
| Estado compartilhado | Configuração Pix lida diretamente do PostgreSQL; edição de modelos de notificação atômica no banco em [server.ts](../../server.ts). Teste concorrente em [tests/integration.test.ts](../../tests/integration.test.ts). |
| Landing v2 | Design azul/ciano integrado em [LandingPageView.tsx](../../src/components/LandingPageView.tsx) e [landingV2.css](../../src/components/landingV2.css), com protótipo de referência em [aladay-frontend-v2](../aladay/aladay-frontend-v2/README.md). Permanecem os fluxos reais de login, cadastro, demonstração, painel, preços, calculadora, consentimento e páginas legais. O carrinho ilustrativo é local e o contato abre WhatsApp sem persistir dados. |
| Documentação | Diagnósticos em [01](./01-diagnostico-arquitetura.md), [02](./02-seguranca-multitenant.md), [03](./03-autenticacao-apis.md), [04](./04-estabilidade-backend.md), [05](./05-banco-postgresql.md) e roteiro em [DEPLOY_EASYPANEL.md](../../DEPLOY_EASYPANEL.md). |

## Validação local em banco descartável

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | Passou. |
| `npm test` | 38 testes passaram. A primeira execução no sandbox falhou ao abrir servidor HTTP local; a repetição com acesso local permitido passou. |
| `npm run test:integration` | 20 testes passaram em PostgreSQL 17 `aladay_test`. |
| `npm run build` | Passou com Vite 8.3.5. |
| `npm run test:e2e` | 8 testes Playwright passaram. |
| `docker build -t aladay-audit:20261117 .` | Passou. |
| Landing v2 | Após a integração, `npm run lint`, `npm test` (38/38) e `npm run build` passaram. Dois testes focados em [landingV2.spec.ts](../../tests/e2e/landingV2.spec.ts) passaram contra preview local: carrinho, simulação, login, cadastro e navegação móvel sem overflow. A suíte E2E completa e o build Docker não foram repetidos após esta alteração de interface. |
| Migração | Em banco descartável, preflight passou; sete scripts aplicados na primeira execução e nenhum na segunda. Startup com banco vazio falhou sem executar DDL. |

Nenhum teste usou banco de produção. Integrações externas reais não foram acionadas.

## Riscos remanescentes e plano

1. Caches de tenant, catálogo, pedidos, conversas, iFood e algumas assinaturas ainda são mutáveis por processo. Continuar a migração por fluxo, com testes de duas réplicas e concorrência, antes de escalar horizontalmente.
2. Matriz multi-tenant não é exaustiva para todos os métodos e webhooks. Ampliar testes A/B para exclusões, relatórios e mudanças de assinatura; avaliar RLS somente depois de testar contexto transacional e jobs.
3. `picomatch@4.0.7` chega via `vite@8.3.5`. O advisory [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) informa ReDoS com extglobs, versões afetadas `<=4.0.7` e nenhuma versão corrigida em 17/11/2026. `npm view picomatch version` retornou `4.0.7`. Não foi encontrado uso direto de glob controlado por usuários no servidor; a exposição prática parece concentrada em build e desenvolvimento, mas não foi provada ausência de caminho explorável. Não fazer downgrade major automático. Monitorar correção upstream e atualizar lockfile após validação de compatibilidade e build.
4. O cookie `Secure` e OTP/Asaas/Evolution reais precisam de homologação HTTPS; o teste local usa HTTP e serviços simulados. A adaptação global de `fetch` deve migrar gradualmente para cliente explícito.
5. O preflight cobre índices únicos prioritários, não certifica dados históricos, FKs `NOT VALID` nem desempenho em produção. Fazer inspeção e restore ensaiado antes de qualquer migração persistente.
6. Validar em homologação os textos de planos e de recursos Aladay AI, a marca, o WhatsApp de suporte e a aparência em navegadores e dispositivos reais. O formulário da landing não persiste leads; abre uma mensagem para o visitante revisar e enviar. Os vídeos oficiais ainda não estão disponíveis; a seção usa capturas reais, identificadas como demonstração visual.

## Rollback

- Código: voltar à imagem anterior e às variáveis anteriores sem apagar sessões nem dados. Bearer legado permanece aceito na janela de transição.
- Banco: o migrador usa uma transação; erro durante aplicação reverte DDL e ledger. Após sucesso, não presumir rollback de esquema; manter compatibilidade com imagem anterior e restaurar backup apenas conforme plano operacional aprovado após ensaio.
- Configurações Pix e modelos: são gravados no PostgreSQL. Fazer backup antes de alterar dados em homologação; não depender de cache em memória para recuperação.

## Checklist de homologação EasyPanel

- [ ] Criar staging com banco e credenciais próprios, sem volume nem dados pessoais de produção.
- [ ] Conferir `APP_URL` HTTPS e cabeçalhos do proxy; testar `Secure`, `HttpOnly`, `SameSite`, CSRF, login, reload, logout, OTP, abas simultâneas e painel administrativo.
- [ ] Executar backup e restauração em banco isolado; rodar `db:preflight`, revisar duplicidades e aplicar migração por job separado. Confirmar readiness e logs `startup_failed` sanitizados.
- [ ] Testar A/B com proprietário, cozinha e superadmin em catálogo, pedidos, Pix, assinaturas, CRM, analytics, Intelligence, upsell e feedback.
- [ ] Testar duas réplicas para estado compartilhado, checkout concorrente, outbox, shutdown e retomada.
- [ ] Exercitar Asaas sandbox, Pix e Evolution de homologação; validar webhooks, idempotência e retorno ao navegador.
- [ ] Conferir landing v2 em desktop e celular: navegação, login, cadastro, cardápio real, carrinho ilustrativo, preços, calculadora, contato via WhatsApp, consentimento e links legais. Revisar textos comerciais e disponibilidade de Aladay AI.
- [ ] Confirmar plano de rollback e responsáveis antes de qualquer deploy de produção.

## Pull Request

[Draft PR #2 — Auditoria: segurança multi-tenant, sessões e migrações controladas](https://github.com/adrianosaraivaoficial/https-github.com-adrianosaraivaoficial-aladay-cardapio/pull/2). Não fazer merge nem deploy antes da revisão e homologação.
