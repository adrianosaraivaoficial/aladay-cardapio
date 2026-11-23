# Arquitetura

O PWA em `/app/garcom/` reutiliza o login da Aladay. Sua entrada lazy preserva as rotas do cardápio, administração e demo. A aplicação mantém a sessão em sessionStorage e lê mesas pela API autenticada do mesmo Express. O service worker é limitado ao caminho do Garçom e guarda uma página estática para indisponibilidade de rede.

O PostgreSQL é autoritativo para flag, vínculos, ocupação, idempotência e auditoria. A API revalida o tenant e o vínculo por operação. A tela atualiza ao reconectar e após conflito. Não existe fila offline nesta versão.

A comanda usa a mesma validação de preço e adicional do checkout, em `backend/order-items.ts`. O pedido consome snapshots de itens, usa a mesma coordenação de numeração do tenant e é salvo em `orders` como `dine_in`. O KDS lê essa tabela pelo fluxo existente. O Garçom consulta o estado de cada pedido ao atualizar o salão ou reconectar.

A associação dos itens ao pedido, a versão da comanda, o resultado idempotente e a auditoria são gravados juntos. O Garçom não solicita contato do cliente. As rodadas sem telefone não são encaminhadas à automação de WhatsApp. O fechamento financeiro ainda não está implementado.
