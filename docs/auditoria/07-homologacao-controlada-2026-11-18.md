# Homologação controlada no domínio principal — 18/11/2026

## Escopo e conclusão

`https://aladay.com.br` será usado temporariamente para homologação controlada. Não é necessário provisionar subdomínio staging agora. **Não houve deploy, migração, backup ou restauração na VPS de produção nesta auditoria. A homologação funcional em produção ainda não está aprovada.** HTTP 200 e réplica 1/1 demonstram disponibilidade inicial, não o funcionamento dos fluxos de negócio.

## Revisões e imagem

| Item | Evidência | Conclusão |
| --- | --- | --- |
| Checkout local | `0483c86fbd28e260d9f06d0d2d32e40a85887bf7`, branch `audit/seguranca-estabilidade-20261117` | Há alterações rastreadas e arquivos novos sem commit; os testes e a imagem local representam esse estado de trabalho, não apenas o commit. |
| `origin/main` local | `ad99e81` | O build limpo desse commit produziu `index-DyA-ghya.js` e `index-A1CXywq9.css`. Os mesmos nomes foram observados em `https://aladay.com.br/`. O texto principal da landing também coincide. Isso identifica o frontend servido com alta confiança. |
| Build do checkout atual | `index-UkAoviM7.js`, `index-DmW8XkAf.css`; imagem Docker local `sha256:e6aa9e5f0c62d9af31ae2a10203b73ef56c99bc733f20ff10e7e2e5aa0d06253` | O frontend atual difere do servido. Essa imagem foi construída apenas no Docker local e não foi implantada. |
| Imagem `agencia_cardapio-app` na VPS | Serviço usa `easypanel/agencia/cardapio-app:latest`; tarefa em execução `bj9122gtuzckg66n32xcllf5s`, ativa há 3 dias; digest `easypanel/agencia/cardapio-app@sha256:6c77d05bae11d5ecd0439c96c163a6c2e5903f6b9f9ced255b2219762785d86a` | Imagem efetivamente executada está identificada por digest. O `UpdateStatus` informa `State=completed`, `Message=update completed`, iniciado e concluído em 15/11/2026. Três tentativas anteriores falharam durante `starting` com `task: non-zero exit (1)`; a causa raiz ainda exige logs dos containers. O digest não contém, por si só, o commit Git do backend; labels/metadados do registry ainda não foram obtidos. |

## Testes executados

| Verificação | Resultado | Limite |
| --- | --- | --- |
| `npm run lint` | Aprovado | TypeScript do checkout com alterações locais. |
| `npm test` | 38/38 aprovados | Testes unitários e mocks; uma execução inicial falhou porque o sandbox bloqueou `listen(127.0.0.1)`, e a repetição fora dele passou. |
| `npm run build` e `docker build` | Aprovados | Build da árvore de trabalho atual, sem tag de release nem commit associado. |
| `npm run test:integration` | 22/22 aprovados | PostgreSQL 17 descartável `aladay_test`; n8n e Evolution API simulados localmente. |
| `npm run test:e2e` | 11/11 aprovados | Chromium local e banco descartável; inclui login, cardápio, CRM, analytics, feedback, landing e tela móvel. Não exercita o domínio de produção. |
| Migrações | Preflight sem duplicidades; 7 arquivos aplicados no banco descartável; segunda aplicação sem mudanças | Sem consulta ao esquema ou aos dados da produção. O preflight atual verifica apenas cinco categorias de duplicidade. |
| Backup/restauração | `pg_dump` custom, catálogo e `pg_restore --exit-on-error` aprovados entre dois bancos descartáveis; 7 registros em `schema_migrations` após restauração | Não prova que existe backup recente, restaurável e externo da produção. |
| Endpoints públicos | `/api/v1/health` e `/api/v1/ready` retornaram 200 | Não aprovam fluxos autenticados nem integrações. |

## Compatibilidade e riscos

- **PostgreSQL:** a aplicação e as migrações funcionaram com PostgreSQL 17 de teste. Falta confirmar versão, esquema, checksums em `schema_migrations`, duplicidades e espaço/tempo de bloqueio do banco da VPS. O `easypanel-init.sql` cria índices únicos; dados legados duplicados impedem a migração. DDL dentro de uma transação pode manter locks até o commit; ensaiar com cópia isolada dos dados e janela de manutenção.
- **Redis:** não há cliente Redis nem variável `REDIS_*` na aplicação deste repositório. A presença do serviço 1/1 não comprova a saúde do Redis para n8n/Evolution API. Confirmar quem o utiliza, persistência, versão e conectividade pela rede privada do Swarm, sem alterar suas credenciais.
- **n8n:** o outbox envia POST com Bearer `N8N_WORKER_TOKEN` e `Idempotency-Key`; retry e lease foram testados com servidor simulado. Falta confirmar URL, token, workflow ativo, resposta 2xx, deduplicação, filas e tentativas mortas na VPS. Evitar disparos reais até definir um evento sintético controlado.
- **Evolution API:** envio OTP foi testado contra servidor simulado. Falta confirmar versão/rotas, instância, chave, estado da sessão WhatsApp e entrega real. Não reconectar ou desconectar instâncias existentes durante homologação.
- **CSP:** o navegador da produção bloqueou scripts de Cloudflare Insights e GA4 por `script-src 'self'`. Isso pode interromper métricas e deve ser reconciliado com a política de privacidade e a configuração desejada. Respostas 403 repetidas foram vistas no console, mas sua origem e impacto não foram identificados.
- **Proveniência:** não implantar o checkout com arquivos sem commit. Definir commit/tag de release e imagem imutável identificada por digest. O Dockerfile atual não embute o SHA Git; registrar a relação commit → digest no registro de release.
- **Rollback de dados:** as migrações foram testadas num banco vazio, não com um snapshot real de produção. Reverter só a imagem pode não bastar se houver mudança de esquema ou dados. Restauração de banco é último recurso e pode perder gravações posteriores; exigir decisão operacional explícita.

## Plano operacional preparado para após autorização

1. **Inventário antes da janela:** registrar digest da imagem atualmente referenciada pelo Swarm e da imagem efetivamente executada, tag/commit de origem, versão PostgreSQL e estado dos 11 serviços. No EasyPanel, exportar uma cópia protegida da configuração do serviço (nomes e valores de variáveis, domínio, porta, mounts, redes e healthcheck) sem publicar segredos no relatório. Conferir as variáveis necessárias em [.env.example](../../.env.example) e as específicas já presentes; não substituir o conjunto de variáveis pelo exemplo.
2. **Release rastreável:** fechar e revisar as alterações locais, criar commit, executar CI e construir/publicar imagem com tag de commit. Registrar o digest imutável e compará-lo à imagem implantada. Congelar mudanças de schema, credenciais, webhooks e rotas durante o rollout.
3. **Backup e ensaio:** confirmar backup recente do PostgreSQL da VPS; criar dump custom consistente antes da mudança, verificar checksum e catálogo, guardar cópia externa criptografada e restaurar em PostgreSQL isolado. Incluir snapshots/exportações dos volumes e configurações do Redis, n8n e Evolution API conforme sua persistência real. Registrar duração e ponto de recuperação. Nunca restaurar por cima do banco ativo como teste.
4. **Migração somente após nova autorização explícita:** usar credencial e `MIGRATION_DATABASE_URL` corretos em job isolado. Executar primeiro `npm run db:preflight` (transação somente leitura) e comparar `schema_migrations`/checksums ao release; consultar duplicidades e conflitos de dados. Ensaiar as sete migrações na cópia restaurada. Se aprovadas, aplicar na janela com `--confirm-database=<nome exato>`, com backup validado e plano de parada. Não executar DDL no startup do app.
5. **Atualização EasyPanel:** alterar apenas a referência da imagem do serviço `agencia_cardapio-app` para o digest aprovado. Preservar variáveis, segredos, redes, volumes, domínios, portas e serviços de PostgreSQL, Redis, n8n e Evolution API. Como há uma réplica, planejar breve indisponibilidade durante a troca e monitorar o evento de rollout; não usar `docker service update` fora do EasyPanel se isso puder divergir do estado gerenciado pelo painel.
6. **Verificações pós-deploy:** conferir digest executado, réplicas, health/readiness, logs e métricas 5xx. Com conta e restaurante sintéticos, testar login/logout, isolamento de tenant, catálogo, carrinho/pedido sem cobrança real, dashboard e navegação desktop/móvel. Verificar processamento do outbox e integração n8n/Evolution com evento controlado e deduplicável; reconciliar qualquer evento com os sistemas externos. Observar também CSP, cookies/CSRF, fila `dead` e banco. HTTP 200 sozinho não conclui a homologação.
7. **Rollback:** manter referência/digest anterior e configuração exportada. Se os critérios funcionais ou operacionais falharem, voltar à imagem anterior pelo EasyPanel, conferir readiness e repetir os testes críticos. Antes de qualquer restauração de banco, interromper gravações, avaliar compatibilidade de schema e perdas desde o backup, obter decisão explícita e usar o procedimento ensaiado. Registrar horário, causa e resultado.

**Portão atual:** testes locais aprovados, digest da imagem de produção confirmado e último rollout marcado como concluído; commit Git do backend, detalhes das tarefas `Failed`, estado real das migrações, backup restaurável da VPS e compatibilidade ponta a ponta das integrações permanecem pendentes. Nenhuma atualização de produção está autorizada ou executada.

### Histórico detalhado do rollout observado

| Tarefa | Horário UTC | Resultado | Container | Evidência |
| --- | --- | --- | --- | --- |
| `onycmc8f8wwkkd173vlk93m8e` | 2026-11-15 07:05:59 | `failed`, exit code 1 | `31569102c97025042b0c2bf1971cfa38346b4c3e235aae3cc32f1327c40eb46b` | `task: non-zero exit (1)` durante `starting` |
| `tdc0u8c8152fllkrpolqbixur` | 2026-11-15 07:06:06 | `failed`, exit code 1 | `f1a00c762c3d9a5ced17e044fdd58a70bff8ebe88b811129cb58c4492fb9dd43` | `task: non-zero exit (1)` durante `starting` |
| `8zzqvbfwarmrb0u3cug99olxb` | 2026-11-15 07:06:14 | `failed`, exit code 1 | `4d052c1c940d166b12381da846a61c0c59b255d0aa564dd8455f4eaec41d4f58` | `task: non-zero exit (1)` durante `starting` |
| `bj9122gtuzckg66n32xcllf5s` | 2026-11-15 07:06:21 | `running`, exit code 0 | `5307d2e5eaba2d019a55a5f118871c4d61fad914a715121e3fc931409335e1a1` | `started`; tarefa ativa |
| `e3mc8z7xfctmf27hhehp2z3ze` | 2026-11-15 07:06:30 | `shutdown`, exit code 0 | `593c635e3f72a4a35b303baee90f41c8b778ba416e7a24d8896ae83315761948` | encerramento normal da tarefa anterior |

## Comandos usados para fechar a proveniência da imagem

Na VPS, foram executadas somente consultas de leitura:

```sh
docker service ps agencia_cardapio-app --no-trunc --format '{{.ID}} {{.CurrentState}} {{.Image}}'
task_id="$(docker service ps -q --filter desired-state=running agencia_cardapio-app | head -n 1)"
container_id="$(docker inspect "$task_id" --format '{{.Status.ContainerStatus.ContainerID}}')"
docker inspect "$container_id" --format '{{.Config.Image}}'
```

Com a referência retornada no último comando, consultar o digest local:

```sh
image_ref="$(docker inspect "$container_id" --format '{{.Config.Image}}')"
docker image inspect "$image_ref" --format '{{json .RepoDigests}}'
```

Registrar também `docker service ps --no-trunc` para preservar a tarefa e o estado do rollout.

Para investigar as três tarefas `Failed` antes do rollout, consultar o erro do serviço e os detalhes de cada tarefa, sem reiniciar nada:

```sh
docker service inspect agencia_cardapio-app --format '{{json .UpdateStatus}}'
docker service ps agencia_cardapio-app --no-trunc --format '{{.ID}} {{.Name}} {{.CurrentState}} {{.Error}}'
```

Se os containers encerrados ainda estiverem disponíveis no nó, consultar somente seus logs:

```sh
for container_id in \
  31569102c97025042b0c2bf1971cfa38346b4c3e235aae3cc32f1327c40eb46b \
  f1a00c762c3d9a5ced17e044fdd58a70bff8ebe88b811129cb58c4492fb9dd43 \
  4d052c1c940d166b12381da846a61c0c59b255d0aa564dd8455f4eaec41d4f58; do
  echo "--- $container_id"
  docker logs --tail 200 "$container_id" 2>&1
done
```

O campo `.Message` não pertence ao contexto de template de `docker service ps`; por isso, incluí-lo produz erro de template e não indica falha do serviço. Para consultar todas as tarefas sem digitar um marcador literalmente:

```sh
docker service ps agencia_cardapio-app --no-trunc --format '{{.ID}}' |
while read -r task_id; do
  docker inspect "$task_id" --format '{{.ID}} {{json .Status}}'
done
```
