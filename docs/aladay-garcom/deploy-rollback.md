# Deploy e rollback

Branch de desenvolvimento `feature/aladay-garcom`. Sem variáveis de ambiente novas, alteração de credenciais ou migração manual. `database/garcom.sql` é aditiva e carregada pela lista de bootstrap do servidor. A flag começa desligada em todos os restaurantes sem configuração explícita.

Antes de qualquer piloto, testar a restauração de backup em ambiente isolado e validar o deploy do Dockerfile no CI. A URL instalada exige HTTPS fora de localhost. Habilitar somente um tenant de teste e conferir isolamento, reconexão e ocupação. Antes do piloto, confira uma rodada de teste no KDS e a ausência de mensagens quando não houver telefone. O piloto financeiro depende da etapa de caixa.

Se houver incidente após uma ativação, desabilitar a flag pela administração e restaurar a imagem anterior se necessário. Preservar as tabelas e registros do módulo para inspeção. Não executar DROP nem restaurar produção como parte do rollback normal desta branch.
