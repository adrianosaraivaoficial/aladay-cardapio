# Aladay — Novo frontend (versão 2)

Landing page responsiva que serviu de referência visual para a landing React integrada ao projeto. Esta pasta continua como protótipo estático para comparação; a página pública integrada fica em [`src/components/LandingPageView.tsx`](../../../src/components/LandingPageView.tsx) e seus estilos em [`src/components/landingV2.css`](../../../src/components/landingV2.css).

## Integração no projeto

- O visual azul/ciano, a navegação móvel, o hero com painel e celular, Aladay AI, o cardápio ilustrativo e o formulário de contato foram adaptados para React.
- Login, cadastro/teste, painel, cardápio real de demonstração, Termos e Privacidade usam os callbacks existentes da aplicação; a página estática não possui essas rotas.
- O React mantém preços oficiais apresentados no frontend anterior (anual R$ 99/mês em 12 parcelas; mensal R$ 129,90/mês; 15 dias de teste), calculadora, capturas reais do produto, métricas com consentimento e contato de suporte.
- A simulação de carrinho continua local. O formulário abre uma mensagem preenchida no WhatsApp de suporte; o visitante decide se a envia. Nenhum lead é persistido pelo protótipo.
- O painel, cardápio dos restaurantes, pagamentos, autenticação e APIs continuam nos componentes e rotas existentes.

## O que está incluído

- Visual azul/ciano alinhado à marca Aladay, com dashboard e celular ilustrativos;
- Seções de recursos, QR Code, pedidos via WhatsApp, demonstração de cardápio, Aladay AI, planos, FAQ e conversão;
- Cardápio interativo (filtro por categoria, adição/remoção, total do carrinho, simulação de finalização);
- Formulário de interesse com validação, campo anti-spam e POST opcional a endpoint a ser confirmado;
- Navegação mobile, FAQ nativo, HTML semântico, SEO básico e tratamento de movimento reduzido;
- Ilustrações vetoriais locais, sem CDN, bibliotecas JS ou chaves embutidas.

> **Atenção:** é uma **nova landing pública**, não um substituto do painel autenticado, do cardápio real dos restaurantes nem das rotas backend. Dados de cardápio/pedidos mostrados nas telas são fictícios e sinalizados como demonstração. Recursos Aladay AI foram marcados como **em desenvolvimento**. Preços/planos não foram inventados.

## Executar localmente

```bash
cd aladay-frontend-v2
python3 -m http.server 8080
```

Acesse `http://localhost:8080`. Também é possível abrir `index.html`, mas um servidor HTTP é mais fiel à execução web.

## Configurar rotas reais (sem expor segredos)

Edite somente `config.js` depois de confirmar as rotas do sistema existente:

```js
window.ALADAY_CONFIG = {
  loginUrl: 'https://aladay.com.br/ROTA-CONFIRMADA-DE-LOGIN',
  signupUrl: 'https://aladay.com.br/ROTA-CONFIRMADA-DE-CADASTRO',
  leadEndpoint: 'https://aladay.com.br/ROTA-CONFIRMADA-DE-LEADS',
  whatsappNumber: '55DDDNÚMERO'
};
```

Sem `loginUrl`, o link de login fica oculto para não induzir o visitante ao erro. Sem `signupUrl`, os botões de teste levam ao formulário. Sem `leadEndpoint`, o formulário **não finge enviar**: avisa que falta configurar a integração. Se `whatsappNumber` estiver vazio, o atalho do WhatsApp fica oculto.

### Contrato sugerido para o endpoint de leads (a validar com o backend)

`POST` HTTPS / JSON com campos `name`, `restaurant`, `phone`, `segment` e `source: "landing-v2"`. Resposta HTTP 2xx apenas após persistência real. No servidor, implementar validação, rate limit, prevenção de spam, consentimento e tratamento de CORS. Não incluir `EVOLUTION_API_KEY`, `DATABASE_URL`, `ASAAS_*`, `JWT_SECRET` ou qualquer credencial no frontend.

## Validação da integração

Execute `npm run lint`, `npm test`, `npm run build` e `ALADAY_LANDING_URL=http://127.0.0.1:4173/ npx playwright test tests/e2e/landingV2.spec.ts` contra um preview local do build. O teste de interface cobre entrada no login, carrinho ilustrativo e navegação móvel. Antes de publicar, confira novamente os textos comerciais e a aparência em dispositivos reais.

## Critérios antes de publicar a integração

- [x] Conectar cadastro e login aos fluxos internos já existentes.
- [x] Oferecer contato via WhatsApp sem fingir persistência de lead.
- [ ] Confirmar oferta de teste e os textos legais/comerciais da Aladay.
- [ ] Confirmar a marca geométrica do protótipo com a identidade oficial.
- [ ] Testar em Android, iOS, Chrome, Firefox e Safari.
- [ ] Revisar privacidade/LGPD e avisos de consentimento com responsável jurídico.
- [ ] Revisar a branch em Pull Request; não fazer merge ou deploy automaticamente.

## Estrutura

```
aladay-frontend-v2/
├── index.html         # página completa
├── styles.css         # design e responsividade
├── script.js          # interatividade e formulário
├── config.js          # URLs públicas, sem segredos
├── assets/
│   ├── favicon.svg
│   ├── burger.svg
│   ├── pizza.svg
│   └── acai.svg
└── README.md
```

## Design

Cores centrais: marinho `#071b3a`, azul `#1366ed`, ciano `#1cbee7`, branco e cinzas claros. Layout fluido para desktop/tablet/mobile. Ilustrações autorais em SVG; não dependem de imagens externas.
