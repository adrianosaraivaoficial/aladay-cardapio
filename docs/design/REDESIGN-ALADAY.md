# Redesign Aladay

Branch `feature/aladay-premium-redesign`, com base no commit `e323cbb` da demonstração isolada. O trabalho foi realizado em um checkout local separado. A branch de Garçom tem mudanças de trabalho próprias e exige integração em uma revisão separada.

## Mudanças por área

| Área | Entrega |
| --- | --- |
| Landing | Hero responsivo com CTAs para cadastro e demo, captura identificada da interface demonstrativa e modal nativo para mídia com fallback. As seções comerciais, a calculadora, os termos e os preços existentes foram reaproveitados. |
| Design system | Tokens semânticos para marca, superfície, texto, borda, foco, estados e raios. Controles compartilhados aplicados à landing, ao painel e aos dois cardápios. |
| Demonstração | Busca por produto e descrição, complementos opcionais com preço em centavos, carrinho com linhas distintas por configuração, indicadores e catálogo ilustrativo no painel. Checkout e status continuam simulados. |
| Painel | Navegação agrupada e recolhível no desktop, drawer nativo no mobile e indicação acessível da seção ativa. Os relatórios mantêm as fórmulas existentes e os cards se adaptam a uma área de conteúdo mais estreita. |
| Cardápio real | Busca compartilhada com botão de limpeza, retorno de foco e alvos de categoria maiores. O fluxo existente preserva personalização do tenant, preços, adicionais, taxa, entrega, retirada e pagamento. |
| KDS, Inteligência e Garçom | As entradas passaram a integrar a navegação comum. O KDS usa a visão existente. Inteligência e Mesas & Garçom continuam nas telas da base auditada. |

## Arquivos

- `src/index.css` e `src/App.tsx` para tokens e navegação responsiva do cabeçalho.
- `src/components/LandingPageView.tsx` e `public/assets/landing/aladay-demo-painel.webp` para o hero e a mídia.
- `src/components/ResponsiveSidebar.tsx` e `src/components/SearchInput.tsx` para a navegação e a busca reutilizáveis.
- `src/components/RestaurantAdminView.tsx`, `src/components/AuditedDashboardView.tsx` e `src/components/ConsumerMenuView.tsx` para aplicação à interface real.
- `src/demo/catalog.ts`, `src/demo/main.tsx` e `src/demo/orders.ts` para catálogo, complementos e totais fictícios.
- `tests/demo.test.ts`, `tests/e2e/demo.spec.ts` e `tests/e2e/intelligence.spec.ts` para regressões.
- `docs/design/AUDITORIA-UI-UX.md`, `docs/design/REDESIGN-ALADAY.md` e `docs/design/VALIDACAO-REDESIGN.md` para auditoria, escopo e validação.

## Pendências

- Consolidar o restante dos componentes solicitados, incluindo formulários, feedback e tabelas legadas, e planejar o modo escuro conforme a personalização de cada restaurante.
- Revisar internamente os formulários de produtos, Inteligência e Garçom. Avaliar a integração da PWA de Garçom em branch própria.
- Publicar o vídeo oficial quando a mídia estiver disponível. A interface inclui poster, reprodução manual e fallback por captura.
- Medir Core Web Vitals em homologação e completar a auditoria WCAG 2.2 AA, incluindo leitores de tela, contraste e jornadas com diálogos.
- Homologar provedores configurados, permissões com perfis representativos e fluxos completos em dispositivos reais.

Nenhuma mudança exige migração. O patch está limitado a interface, demonstração, testes e documentação. O processo foi local, sem deploy, push ou operações em dados de produção.
