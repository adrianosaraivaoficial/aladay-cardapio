# Verificação dos incrementos 1 e 2

Lint e TypeScript aprovados. O build Vite passou.

| Suíte | Resultado |
| --- | --- |
| Unitários | 41 aprovados. |
| Integração | 24 aprovados, incluindo os subtestes de Garçom. PostgreSQL descartável criado para esta execução. |
| Playwright | 13 aprovados, incluindo login no PWA, rota canônica, perda de conexão, atualização ao reconectar, clique duplicado e persistência após recarga. |

A integração HTTP abrange ativação por restaurante, permissões, isolamento, provisionamento, revogação, concorrência e idempotência de abertura. Uma verificação adicional do build servido pelo Express em modo de produção local confirmou manifesto, ícones, escopo do service worker e cache offline contendo apenas a página estática de indisponibilidade.

O build de imagem Docker e o piloto em HTTPS na VPS ainda não foram executados. Itens, envio de pedidos à cozinha e fechamento financeiro ainda não fazem parte deste recorte.
