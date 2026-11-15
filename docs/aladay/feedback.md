# Feedback e avaliações

Incremento 4: convites individuais, formulário público, métricas de satisfação e moderação humana. Não envia mensagens nem publica respostas geradas por IA. Nenhuma chamada externa ou custo de IA é necessário. Flag `feedback` é validada no servidor em todas as operações; começa desligada.

## Persistência e privacidade

Aplicar [feedback.sql](../../database/feedback.sql) somente em banco descartável/staging autorizado. As três tabelas novas usam FK tenant-scoped e exclusão em cascata. `feedback_requests` armazena apenas SHA-256 de token aleatório de 256 bits, um convite por pedido e expiração de 30 dias. Token em claro aparece somente na resposta de emissão, nunca em banco, logs ou audit. Configurar `APP_URL` com a origem pública correta; sem configuração o link retornado é relativo. Não armazenar/copiar tokens em tickets, analytics ou ferramentas de suporte.

Pedido deve pertencer ao tenant, estar entregue e ter sido criado nos últimos 30 dias. Pix exige transação liquidada com valor, data e identificador bancário presentes. Outros meios de pagamento precisam de entrega e ausência de cancelamento/reembolso; isso não contabiliza receita nem altera o pedido. Convite existente só pode ser reemitido mediante duas confirmações explícitas, invalidando o token anterior. Depois do envio o token é removido e uma nova avaliação pelo mesmo convite é impossível. Transações serializam reemissão/envio e garantem uso único concorrente.

Consentimento público é específico e false quando ausente. Proprietário não pode elevar consentimento; aprovação sem consentimento é rejeitada. Publicação retorna somente nota, comentário e data: sem nome, telefone, pedido ou identificadores internos. Comentários são texto livre e precisam de apresentação escapada no frontend; não devem ser inseridos como HTML. A UI deve orientar o cliente a evitar dados pessoais no comentário público.

`FEEDBACK_RETENTION_DAYS` define retenção de avaliações e audit, padrão 90 dias, intervalo 1–365. Exclusão pelo proprietário apaga comentário, convite e eventos ligados; mantém somente audit genérico de exclusão sem vínculo ao cliente/pedido/feedback. A limpeza oportunista remove dados vencidos no próximo acesso. Programar rotina periódica executando as mesmas exclusões em ordem: feedback vencido; audit vencido; requests vencidos sem feedback. Expiração no banco não garante remoção pontual sem scheduler. Backups da infraestrutura exigem política própria, e a configuração não reescreve prazos de registros existentes.

## API

- `POST /api/v1/tenants/:slug/orders/:id/feedback-invite`: OWNER/SUPER_ADMIN, `{}` na emissão; `{reissue:true,confirmReissue:true}` para rotação. Retorna `{inviteId,url,expiresAt}`. Operação apenas produz link para copiar; não autoriza envio a terceiros.
- `POST /api/v1/public/feedback`: `{token,rating,comment?,publicConsent?}`; nota inteira 1–5, comentário até 2.000 caracteres, consentimento booleano. Retorna 201 e `{success:true}`. Token inválido/consumido/expirado retorna 410 (formato inválido 400). Allowlist pública deve conter somente este POST e o GET público específico; aplicar rate limit existente.
- `GET /api/v1/tenants/:slug/feedback`: OWNER/SUPER_ADMIN; filtros `moderation=pending|approved|rejected`, `limit=1..100`, `offset=0..10000`; retorna `data` e `metrics` com quantidade, média e distribuição 1–5. Métricas abrangem todas as avaliações ainda retidas, independentemente do filtro.
- `PATCH /api/v1/tenants/:slug/feedback/:id/moderation`: `{status:'approved'|'rejected',expectedVersion}`; conflito 409. Audit registra ator/ação, nunca conteúdo/token.
- `DELETE /api/v1/tenants/:slug/feedback/:id`: `{confirm:true}`; exclusão efetiva sem mudar pedido.
- `GET /api/v1/tenants/:slug/feedback/public`: lista até 100 avaliações consentidas, aprovadas e não expiradas. Não aceita filtros arbitrários.

## Verificação

[feedback.test.ts](../../tests/feedback.test.ts) cobre schema, limites e hash; [feedback.integration.test.ts](../../tests/feedback.integration.test.ts) prepara PostgreSQL real descartável, flag, papéis, origem tenant, elegibilidade, Pix pendente, rotação, submissão concorrente, consentimento, moderação/versionamento, exclusão e retenção. Guard do teste é isolado: a suíte principal verifica sessões JWT reais. Nenhum teste usa IA ou mensagens externas. Runner principal deve executar os cenários; preparação não equivale a aprovação. E2E do formulário público e painel de moderação ainda precisa de execução antes de liberação comercial.
