# Importador de cardápios

O módulo é montado pelo servidor com o mesmo guard administrativo do catálogo. A flag `menu_import` é verificada dentro da transação, antes de analisar o conteúdo recebido. Todas as consultas de jobs usam tenant e ID; toda publicação bloqueia a linha do tenant, reutilizando o mesmo bloqueio do catálogo v3.

## API de revisão

- `POST /api/v1/tenants/:slug/menu-imports`: recebe `{categories,products}` ou `{filename,mimeType,contentBase64}`. Retorna `{job,catalogHash,diff,diffHash}`. A resposta `job` contém `id,status,version,filename,mimeType,candidates,warnings`.
- `GET .../menu-imports/:id`: retorna o rascunho e recalcula o diff contra o catálogo atual.
- `PATCH .../:id/candidates`: recebe `{version,candidates:{categories,products}}`. A versão é obrigatória; cada revisão aumenta a versão e registra autor e snapshot no audit.
- `POST .../:id/extract`: recebe `{filename,mimeType,contentBase64,version,authorizeExternalProcessing:true}` para extração opcional por IA. Exige o mesmo arquivo/checksum do job, versão vigente, autorização explícita de envio externo, configuração do provedor e orçamento reservado. Retorna `{success:true,id,reload:true}`; recarregue o job para revisar o resultado.
- `POST .../:id/publish`: recebe `{version,catalogHash,diffHash,confirm:true,confirmDuplicates:true}`. A confirmação de duplicidades só é exigida quando o diff apresenta colisões de nome. Publicação retorna `{job,published:true}`; repetição de um job publicado retorna `{job,alreadyPublished:true}`.

Categorias: `{id?,name,order?}`. Produtos: `{id?,name,description?,categoryId,priceCents,imageUrl?,isAvailable?,isFeatured?,optionGroups?:[]}`. Todos os campos adicionais são rejeitados. IDs são gerados quando ausentes; para atualizar item existente, use seu ID explicitamente. Os IDs das categorias precisam estar presentes ao construir referências de produtos. Preços em centavos exigem inteiro não negativo até 10.000.000; qualquer valor ambíguo vira `null` e bloqueia a publicação.

O diff contém arrays `categoriesAdded,categoriesUpdated,productsAdded,productsUpdated,duplicates`; cada array de alteração mostra os candidatos completos. `Updated` identifica todos os IDs já existentes, mesmo quando o conteúdo é igual. Nenhuma categoria ou produto é apagado. O hash verifica todo o snapshot do catálogo, e o hash do diff inclui versão e hash do catálogo. Uma mudança concorrente exige nova revisão.

## Arquivos e extração

Máximo de 650 KB, compatível com o limite JSON de 1 MB do servidor. Tipos: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`, `text/csv`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. A assinatura e o conteúdo são verificados; arquivos com ações PDF ativas, scripts ou instruções suspeitas são rejeitados. A análise de assinatura não garante detectar instruções maliciosas codificadas em imagens. No caminho de IA, o prompt trata o arquivo como dado não confiável e a saída passa por validação estrita; isso não substitui revisão humana.

PDF e imagens inicialmente geram um rascunho vazio para revisão manual. O arquivo original não é armazenado no servidor; a interface pode mantê-lo localmente durante a revisão. O endpoint de extração é uma ação posterior e explícita: criar o job não chama um provedor. CSV/XLSX continuam exclusivamente locais.

## Extração opcional por IA e controle de custos

`backend/menuImportAi.ts` implementa um adaptador Gemini configurável. Permanece desligado por padrão. A ativação operacional exige `MENU_IMPORT_AI_ENABLED=true`, `GEMINI_API_KEY`, `MENU_IMPORT_AI_MODEL` e `MENU_IMPORT_AI_MAX_COST_CENTS` inteiro entre 1 e 100.000, além de `menu_import` liberado/ativado e orçamento mensal suficiente no tenant. Nenhuma credencial é enviada ao navegador. Não houve chamada homologada a provedor real nesta entrega; os testes usam provedor substituto e não demonstram custo ou acurácia de produção.

Antes da transmissão externa, o servidor valida arquivo, MIME permitido, consentimento `authorizeExternalProcessing:true`, checksum, tenant, status draft e versão. Uma transação reserva o limite conservador configurado por tentativa; a chave `menu:<jobId>:v<version>` impede repetir uma chamada naquela versão. Concorrência usa bloqueios do tenant e orçamento. Reserva já existente recebe 409, em vez de gerar cobrança duplicada. A configuração usa uma tentativa, timeout de 30 segundos e saída de até 8.192 tokens.

`MENU_IMPORT_AI_MAX_COST_CENTS` representa a reserva administrativa conservadora por tentativa. Deve cobrir o modelo e os limites configurados antes de qualquer ativação; não é uma medição homologada nem um teto imposto à fatura do provedor. O orçamento do tenant bloqueia novas tentativas quando não comporta a reserva. O valor reservado permanece contabilizado mesmo em falha, timeout ou resposta inválida, até conciliação administrativa com o custo comprovado; não há liberação otimista nem cálculo automático de custo a partir de tokens. Nenhum preço de provedor ou cobrança de produção foi verificado nesta entrega.

A resposta precisa ser JSON compatível com o mesmo schema dos candidatos. A extração solicita apenas categorias, nomes e preços explicitamente legíveis; preço ausente/ambíguo é `null`. Descrições, ingredientes, adicionais e imagens são removidos da saída persistida para evitar introduzir alegações alimentares. A revisão humana continua obrigatória, incluindo nomes e todos os preços. O resultado incrementa a versão; uma edição concorrente durante a chamada impede sobrescrita e exige recarregar.

Falha do provedor ou schema preserva o rascunho manual e a reserva para conciliação. Falta de configuração/autorização retorna erro orientando revisão manual, sem chamada externa. Implementação configurável não equivale a autorização para ativar serviço pago, expor a clientes ou migrar produção.

CSV/XLSX usam a primeira aba e cabeçalhos exatos `category,name,description,priceCents` ou `category,name,description,price`. Os últimos dois são alternativos. `priceCents` é inteiro explícito; `price` aceita decimal simples com ponto ou vírgula e até duas casas. Separadores de milhar e preços alternativos ficam pendentes. Cabeçalhos desconhecidos, fórmulas, macros, links externos, mais de 5.000 linhas/31 colunas e ZIPs acima de 20 MB descompactados são rejeitados. Não há extração de imagens, adicionais, variações ou combos; devem ser cadastrados pelo editor existente. Atualizar produto que já possui adicionais é bloqueado para impedir perda de informações.

## Persistência e segurança

`database/menu-import.sql` cria jobs e auditoria, de forma idempotente. O orquestrador deve executá-lo na mesma transação de inicialização das demais tabelas. Nenhuma migração em produção faz parte desta implementação.

O checksum do conteúdo garante que o mesmo arquivo/JSON retorna o mesmo job dentro do tenant. O arquivo binário não persiste; apenas candidatos, metadados, checksum e avisos. Revisões e publicação registram o usuário autenticado. O audit de publicação contém o diff. Jobs e audit seguem o ciclo de vida do tenant (exclusão em cascata). O catálogo e o estado `published` são gravados na mesma transação; erros de escrita fazem rollback. A atualização do cache ocorre somente após commit.

Execute `node --import tsx --test tests/menuImport.test.ts` para verificar schema, preços, assinaturas, limites, conteúdo ativo, extração CSV/XLSX, checksum e diff. Consulte também os testes de extração com provedor substituto e integração PostgreSQL. Esses testes não substituem homologação de provedor real, conciliação de custo ou teste visual da revisão. Não há ativação automática para clientes ou serviços pagos.
