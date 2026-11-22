# API

Base autenticada `/api/v1/tenants/:slug/garcom`. Use o Bearer JWT do login existente. As respostas de sucesso contêm `data`. Os recursos deste módulo usam `Cache-Control: no-store`.

| Método e caminho | Contrato |
| --- | --- |
| PUT `/settings` | Superadmin. Corpo `{enabled: boolean}` para ativar ou desativar por restaurante. |
| POST `/staff` | Proprietário de tenant habilitado. Corpo `{name,email,password,role}`. Cria conta com senha de 12 a 128 caracteres e vínculo. Papéis `manager`, `waiter`, `kitchen`, `cashier`. |
| DELETE `/staff/:id` | Proprietário do mesmo tenant. Retira o vínculo e revoga sessões do funcionário, inclusive com a flag desligada. |
| GET `/tables` | Devolve papel e mesas numeradas, com a comanda aberta ou nula. |
| POST `/tabs` | Proprietário, gerente ou garçom. Corpo `{tableNumber,idempotencyKey}`. A chave tem 16 a 80 caracteres alfanuméricos, hífen ou sublinhado. |

A primeira abertura responde 201. A mesma chave do mesmo autor e mesma mesa devolve a comanda anterior com 200. Chave reutilizada em outra mesa ou mesa ocupada por outra abertura responde 409. A comanda devolve `id`, `tableNumber`, `status`, `version` e `openedAt`. Ausência de sessão responde 401, escopo ou papel inválido responde 403 e flag desligada responde 404.
