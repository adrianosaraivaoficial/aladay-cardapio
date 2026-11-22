# Arquitetura

O PWA em `/app/garcom/` reutiliza o login da Aladay. Sua entrada lazy preserva as rotas do cardápio, administração e demo. A aplicação mantém a sessão em sessionStorage e lê mesas pela API autenticada do mesmo Express. O service worker é limitado ao caminho do Garçom e guarda uma página estática para indisponibilidade de rede.

O PostgreSQL é autoritativo para flag, vínculos, ocupação, idempotência e auditoria. A API revalida o tenant e o vínculo por operação. A tela atualiza ao reconectar e após conflito. Não existe fila offline nesta versão.

O primeiro recorte da interface abre e mostra comandas. Entrada de itens, envio à cozinha e fechamento ainda não estão disponíveis nesta branch. Nenhum pedido financeiro ou evento de cozinha é emitido ao abrir a mesa.
