# Auditoria de UI e UX do Aladay

A base auditada é o commit `e323cbb` da branch de demonstração. O checkout anterior do Garçom contém trabalho local e não integra esta base. A configuração e as versões declaradas apontam para React 19, Vite 8, Tailwind 4, TypeScript 7, Express 4 e PostgreSQL via `pg`. O CI está em `.github/workflows/ci.yml` e o deploy atual usa Docker e EasyPanel.

| Área | Implementação observada | Verificação ou dependência |
| --- | --- | --- |
| Landing e cadastro | Preços, calculadora, FAQ, consentimento, captura do produto e cadastro existente | A oferta e os links de cadastro devem permanecer referenciados pelo código atual |
| Demo | Entrada HTML própria, CSP restritiva, cardápio, carrinho, checkout e painel simulados | Armazenamento do navegador e sincronização entre abas; busca ausente na base |
| Sessões e acesso | Login, logout, recuperação por OTP, papéis de administrador, proprietário e cozinha; verificações de acesso por tenant e pedido | PostgreSQL, sessão do servidor e WhatsApp para OTP |
| Catálogo e pedidos | Catálogo público, adicionais, carrinho, entrega e retirada, checkout transacional e idempotente, rastreamento e KDS | PostgreSQL; catálogo privado e operações administrativas dependem de sessão |
| Pagamentos | Pix no checkout, confirmação do servidor e assinatura gerenciada separadamente pelo Asaas | Provedor e webhooks autenticados para confirmação |
| Gestão | Produtos, categorias, relatórios, CRM, configurações, assinatura, mesas e Garçom | O módulo de salão desta base é a tela existente; a PWA em outra branch requer revisão separada |
| Inteligência e integrações | Importação, upsell, analytics, feedback, IA e automação | Gemini, Evolution API, n8n e iFood dependem da configuração de cada ambiente |
| UI e qualidade | Tokens compartilhados, Lucide, componentes React, CSS responsivo, testes unitários, PostgreSQL e Playwright | Navegação administrativa horizontal dificulta descoberta; contraste, foco, mídia e largura precisam de validação no navegador |

## Riscos e impactos

| Risco | Impacto | Controle |
| --- | --- | --- |
| Alterar visibilidade da navegação | Alto | Preservar condições por papel e os controles de autorização do servidor |
| Alterar checkout ou transições em pedidos | Alto | Preservar cálculo, persistência, APIs, idempotência e máquina de estados |
| Misturar demonstração com produção | Alto | Manter entrada separada e verificar ausência de requisições operacionais |
| Aplicar tokens globais a interfaces de tenants | Médio | Preservar cores e personalização dinâmica do cardápio |
| Prometer disponibilidade externa em landing | Médio | Basear texto, imagens, preços e CTAs no produto existente |
| Regressão em telas pequenas | Médio | Exercitar navegação, cardápio, carrinho e tabelas nas larguras solicitadas |
