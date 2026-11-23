# Verificação dos incrementos 1 a 3

Lint e TypeScript aprovados. O build Vite passou.

| Suíte | Resultado |
| --- | --- |
| Unitários | 41 aprovados. |
| Integração | 26 aprovados, incluindo os subtestes de Garçom. PostgreSQL descartável criado para esta execução. |
| Playwright | 13 aprovados, incluindo login no PWA, rota canônica, perda de conexão, atualização ao reconectar, clique duplicado, persistência após recarga, adicional obrigatório, confirmação da rodada, valor persistido e leitura do status do KDS. |

A integração HTTP abrange ativação por restaurante, permissões, isolamento, provisionamento, revogação, concorrência e idempotência de abertura, lançamento e envio, preços em centavos, snapshots, adicionais inválidos, produto de outro tenant, versão desatualizada e visibilidade do pedido no KDS. Uma verificação adicional do build servido pelo Express em modo de produção local confirmou manifesto, ícones, escopo do service worker e cache offline contendo apenas a página estática de indisponibilidade.

O build de imagem Docker e o piloto em HTTPS na VPS ainda não foram executados. Fechamento financeiro e homologação de provedores ainda não fazem parte deste recorte.
