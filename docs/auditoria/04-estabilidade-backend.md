# Estabilidade do backend — 17/11/2026

## Inicialização e `startup_failed`

`startServer()` em [server.ts](../../server.ts) valida `DATABASE_URL`, `JWT_SECRET` e `ADMIN_PASSWORD`; abre o pool PostgreSQL; aplica SQL em transação com advisory lock; carrega caches e usuários; registra rotas, worker e arquivos estáticos; só então chama `listen`. Um erro de inicialização emite JSON com `event: startup_failed`, mensagem sanitizada e código de saída 1. O commit `ad99e81` adicionou a causa sanitizada ao log; o commit anterior não a incluía.

Reprodução controlada nesta branch: executar com `DATABASE_URL` vazio e segredos vazios retornou código 1 e `{"event":"startup_failed","message":"DATABASE_URL é obrigatória."}`. Nos testes de integração, servidor iniciou sobre PostgreSQL 17 descartável, `/api/v1/ready` respondeu com sucesso e a suíte passou. Portanto a falha é reproduzível quando falta configuração; **não** foi reproduzida com as variáveis de teste válidas. Não há evidência nesta auditoria de qual variável ou erro causou eventos históricos em produção.

## Controles presentes

- `/api/v1/health` é liveness; `/api/v1/ready` consulta o banco e retorna 503 quando indisponível. Docker usa readiness no HEALTHCHECK.
- Pool tem timeout de conexão; migrações são transacionais e serializadas por advisory lock. Worker de outbox usa lease e `SKIP LOCKED` para vários consumidores.
- `SIGTERM`/`SIGINT` param worker, fecham HTTP e pool, com limite de 15 segundos. Logs HTTP em [backend/observability.ts](../../backend/observability.ts) contêm ID, método, template, status e duração, sem corpo ou query string.
- Erros de handlers assíncronos são encaminhados pelo wrapper de [backend/http.ts](../../backend/http.ts). Falhas de API respondem 503 genérico e evento `request_failed` sem stack ou dados sensíveis.

## Riscos operacionais

1. A migração automática no startup pode falhar com dados históricos duplicados em índices únicos ou incompatibilidades de esquema, impedindo todas as réplicas novas de ficarem prontas. Fazer preflight e ensaio de restore antes de rollout; separar migração de inicialização em etapa posterior.
2. A função de sanitização substitui valores de variáveis de ambiente sensíveis com oito caracteres ou mais. A mensagem de erro ainda merece revisão de formatos de URL e valores curtos antes de considerá-la garantia de não exposição. Logs de sucesso e advertência misturam texto e JSON.
3. Caches mutáveis em memória podem divergir entre réplicas ou após falha. O readiness verifica banco, não a consistência desses caches nem conectividade externa. Verificar recuperação após reinício e testar duas réplicas em staging.
4. O encerramento forçado em 15 segundos precisa ser ensaiado com requisições e eventos em andamento. O worker tem persistência para retentativa, mas integradores devem deduplicar entregas.

Nenhum ajuste de bootstrap foi feito: a falha observada é de configuração deliberadamente rejeitada, e os testes com configuração válida passaram.
