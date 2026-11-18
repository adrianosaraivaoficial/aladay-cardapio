# Diagnóstico da arquitetura — 17/11/2026

> Este diagnóstico registra o estado encontrado no início da auditoria. Correções, testes atualizados e riscos remanescentes estão em [06-consolidacao-e-homologacao.md](./06-consolidacao-e-homologacao.md).

## Escopo e evidências

Leitura do código na branch `audit/seguranca-estabilidade-20261117`, a partir de `ad99e81`. Foram examinados [server.ts](../../server.ts), [src/App.tsx](../../src/App.tsx), os módulos em [backend/](../../backend/), o esquema em [database/](../../database/), [package.json](../../package.json), [Dockerfile](../../Dockerfile), [docker-compose.yml](../../docker-compose.yml), [CI](../../.github/workflows/ci.yml), [README](../../README.md), [SECURITY_HARDENING.md](../../SECURITY_HARDENING.md) e [DEPLOY_EASYPANEL.md](../../DEPLOY_EASYPANEL.md). A análise é do checkout local; não representa uma inspeção da infraestrutura ou dos dados de produção.

## Arquitetura observada

```text
Navegador React 19 / TypeScript / Tailwind 4 / Vite 8
                  │ HTTP JSON, Bearer JWT
                  ▼
Express 4 em server.ts ──► PostgreSQL 17
       │                       ├─ tenants, catálogo, pedidos, Pix
       │                       ├─ usuários, sessões, OTP, assinaturas
       │                       └─ CRM, Intelligence, analytics, upsell, feedback
       ├─ backend/: módulos de catálogo, segurança, cobrança, worker e recursos novos
       ├─ Evolution API / WhatsApp e n8n por HTTP
       ├─ Asaas / Pix e iFood por rotas e webhooks
       └─ Gemini para importação assistida quando habilitada
```

- `server.ts` reúne bootstrap, autenticação, provisionamento, pedidos, integrações antigas, parte das assinaturas e servidor estático. Os módulos em `backend/` montam rotas adicionais no mesmo `app`. A fronteira pública fica em [backend/security.ts](../../backend/security.ts); as rotas privadas passam por autenticação global e guardas específicos.
- PostgreSQL é a fonte persistente para catálogo, pedidos, sessões e módulos novos. Há cópias em memória de tenants, catálogo, pedidos, usuários e configurações de integração. Algumas rotas ainda leem ou alteram essas cópias antes de persistir, o que pede revisão antes de múltiplas réplicas.
- O checkout recalcula preços com dados do servidor, grava pedido e outbox na mesma transação. O worker em [backend/outbox.ts](../../backend/outbox.ts) entrega eventos com retentativa. Pix e Asaas têm fluxos distintos em [backend/payments.ts](../../backend/payments.ts) e `server.ts`.
- O frontend guarda sessão e parte do catálogo em `localStorage`. Há componentes de dados de demonstração e legado, inclusive [src/data/mockTenant.ts](../../src/data/mockTenant.ts). Sua presença não comprova que cada fluxo de produto está operacional. [src/components/OrderTrackingModal.tsx](../../src/components/OrderTrackingModal.tsx) contém um payload Pix fictício, mas nenhuma referência ao componente foi encontrada no código de `src/`; não foi removido nesta auditoria.
- Docker usa Node 22, build separado e usuário sem privilégios. Compose usa PostgreSQL 17; CI executa TypeScript, testes, build, Playwright e build Docker. A presença de workflow não comprova que os jobs passaram no GitHub.

## Principais riscos e prioridades

| Prioridade | Evidência | Efeito e cuidado na alteração |
| --- | --- | --- |
| Alta, corrigida nesta branch | `GET /tenants/:slug/pix-config` aceitava `KITCHEN_STAFF`; serialização de tenant autenticado retornava o objeto completo para essa função | Exposição de configuração Pix e outros campos internos ao perfil de cozinha. Corrigidos guarda e serialização, com regressão HTTP. |
| Alta, corrigida nesta branch | JWT em `localStorage` em [src/App.tsx](../../src/App.tsx) | Navegador usa cookie `HttpOnly` com CSRF; Bearer legado permanece temporariamente compatível. Homologar HTTPS e integrações reais. |
| Alta, corrigida nesta branch | Migração DDL automática no startup em `server.ts` e índices únicos em [database/easypanel-init.sql](../../database/easypanel-init.sql) | DDL agora exige executor separado e preflight. Histórico real ainda precisa de inspeção e backup antes de qualquer rollout. |
| Média, parcialmente corrigida | Cache mutável por processo em `server.ts` | Pix e modelos de notificação leem do PostgreSQL; outros caches ainda podem divergir entre réplicas. |
| Média, pendente | `server.ts` com milhares de linhas, SQL e handlers misturados | Mudanças de auth ou integrações têm raio amplo; modularizar por rota com testes de contrato antes de mover lógica. |
| Média, pendente | [SECURITY_HARDENING.md](../../SECURITY_HARDENING.md) descreve bloqueios de versões anteriores | Atualizar após confirmação funcional; ele contradiz partes do código atual, como sessões e outbox persistidos. |

## Dependências

Versões instaladas verificadas: Node 22.22.1, Express 4.22.3, React 19.3.1, Vite 8.3.5, `@vitejs/plugin-react` 6.1.2, `pg` 8.23.1, Playwright 1.65.1 e PostgreSQL 17 nos testes. `npm audit --json` online em 17/11/2026 reportou **cinco entradas altas relacionadas à mesma cadeia** `picomatch` → `fdir`/`tinyglobby` → Vite/React plugin; advisory [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), ReDoS em extglobs. A versão publicada consultada de `picomatch` era 4.0.7, ainda abrangida pelo advisory. A sugestão automática do npm é downgrade de major do Vite; não foi aplicada por exigir avaliação de compatibilidade. Reavaliar quando houver correção compatível, restringir exposição do servidor de desenvolvimento e acompanhar o advisory. Nenhuma outra vulnerabilidade foi confirmada pelo `npm audit` nessa consulta.

## Validação e limites

Na fase inicial, `npm run lint`, `npm test` (38 casos), `npm run test:integration` (18 casos, PostgreSQL 17 descartável), `npm run build`, `npm run test:e2e` (7 casos) e `docker build` passaram. Após as correções, 20 casos de integração e oito E2E passaram; veja [06-consolidacao-e-homologacao.md](./06-consolidacao-e-homologacao.md). Não houve testes contra Asaas, Evolution, iFood, n8n, EasyPanel ou banco de produção reais.
