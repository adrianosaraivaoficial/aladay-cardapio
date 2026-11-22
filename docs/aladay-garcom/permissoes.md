# Permissões

| Papel | Acesso neste recorte |
| --- | --- |
| Superadmin | Ativação por tenant pela API administrativa. |
| Proprietário do tenant | Cadastro e revogação de funcionários, leitura de mesas e abertura. |
| Gerente ou garçom | Leitura de mesas e abertura somente no restaurante vinculado. |
| Cozinha ou caixa do módulo | Leitura de mesas no restaurante vinculado. Ações específicas aguardam os incrementos de cozinha e caixa. |

Funcionários do módulo usam JWT de papel `GARCOM_STAFF` emitido pelo login existente. A API verifica sessão, tenant e vínculo atual; esse papel não concede acesso aos recursos privados legados. `KITCHEN_STAFF` existente permanece distinto e não herda permissões de Garçom.
