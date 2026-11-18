# Estabilidade do backend — 17/11/2026

## Inicialização e `startup_failed`

`startServer()` em [server.ts](../../server.ts) valida `DATABASE_URL`, `JWT_SECRET` e `ADMIN_PASSWORD`; abre o pool PostgreSQL; verifica tabelas essenciais; carrega caches e usuários; registra rotas, worker e arquivos estáticos; só então chama `listen`. DDL saiu da inicialização. Um erro emite JSON `startup_failed`, mensagem sanitizada e código de saída 1.

Reprodução controlada: sem `DATABASE_URL` o processo retornou código 1; com banco vazio, falhou sem criar tabelas. Depois de aplicar o esquema pelo executor separado em PostgreSQL 17 descartável, `/api/v1/ready` respondeu 200 e a suíte passou. Não há evidência de qual variável ou erro causou eventos históricos em produção.

## Controles presentes

- `/api/v1/health` é liveness; `/api/v1/ready` consulta o banco e retorna 503 quando indisponível. Docker usa readiness no HEALTHCHECK.
- Pool tem timeout de conexão; [scripts/migrate.mjs](../../scripts/migrate.mjs) executa migrações separadamente em transação com advisory lock. Worker de outbox usa lease e `SKIP LOCKED` para vários consumidores.
- `SIGTERM`/`SIGINT` param worker, fecham HTTP e pool, com limite de 15 segundos. Logs HTTP em [backend/observability.ts](../../backend/observability.ts) contêm ID, método, template, status e duração, sem corpo ou query string.
- Erros de handlers assíncronos são encaminhados pelo wrapper de [backend/http.ts](../../backend/http.ts). Falhas de API respondem 503 genérico e evento `request_failed` sem stack ou dados sensíveis.

## Riscos operacionais

1. O rollout precisa executar preflight e migração separada antes de iniciar a nova versão. Esquema incompleto impede readiness; ensaiar backup e restauração antes de qualquer migração persistente.
2. A função de sanitização substitui valores de variáveis de ambiente sensíveis com oito caracteres ou mais. A mensagem de erro ainda merece revisão de formatos de URL e valores curtos antes de considerá-la garantia de não exposição. Logs de sucesso e advertência misturam texto e JSON.
3. Caches de tenant, catálogo, pedidos e conversas ainda podem divergir entre réplicas. Pix e modelos de notificação agora leem do banco, mas a migração de estado compartilhado é parcial. O readiness verifica banco, não esses caches nem conectividade externa.
4. O encerramento forçado em 15 segundos precisa ser ensaiado com requisições e eventos em andamento. O worker tem persistência para retentativa, mas integradores devem deduplicar entregas.

Nenhum deploy ou teste em banco de produção foi realizado.
