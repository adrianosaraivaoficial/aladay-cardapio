# Modelo de dados

| Tabela | Conteúdo |
| --- | --- |
| `garcom_settings` | Flag por `tenant_id`. Ausência equivale a desligado. |
| `garcom_staff` | Vínculo da conta existente no sistema de sessões com o tenant e papel interno. |
| `garcom_tabs` | Identificador UUID, mesa numerada, estado, versão, autor e horário. Índice parcial restringe a uma comanda aberta por mesa e tenant. |
| `garcom_tab_open_requests` | Chave por tenant e autor, vinculada à comanda que resultou da abertura. |
| `garcom_audit` | Ativação, provisionamento, revogação e abertura com autor e data. |

A referência de requisição e auditoria de comanda inclui o tenant. Comanda, chave idempotente e evento de auditoria são gravados juntos. A mudança é aditiva e o schema de `orders` permanece igual. Nesta etapa só se cria o estado `open`; os eventos e a evidência financeira necessários ao fechamento serão introduzidos junto com esse fluxo.
