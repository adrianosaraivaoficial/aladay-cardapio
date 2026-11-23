# Validação do redesign Aladay

## Aplicar a branch

Em um clone limpo com o commit `ad99e81` disponível, verifique e importe o bundle incremental. Ele inclui os commits da demonstração até `e323cbb` e os commits deste redesign.

```sh
git bundle verify /caminho/aladay-premium-redesign.bundle
git fetch /caminho/aladay-premium-redesign.bundle refs/heads/feature/aladay-premium-redesign:refs/heads/feature/aladay-premium-redesign
git switch feature/aladay-premium-redesign
npm ci
npm run lint
npm run build
npm test
npx playwright install chromium
npm run test:integration
npm run test:e2e
```

Para integração e Playwright, configure `TEST_DATABASE_URL` com PostgreSQL descartável cujo nome termine em `_test`. Os testes iniciam instâncias locais e usam credenciais fictícias e configurações de teste. Para abrir a aplicação completa localmente, use `npm run dev` com um banco e variáveis de desenvolvimento. Valide `/`, `/demo`, `/demo/cardapio`, `/demo/painel` e o painel da conta de teste.

## Homologação e publicação

Use ambiente de homologação conforme `DEPLOY_EASYPANEL.md`. Verifique a prontidão em `/api/v1/ready`, revise a landing, confirme as rotas e os cabeçalhos da demo, percorra checkout com dados descartáveis e faça login/logout com perfis representativos. Confira permissões, transições no KDS e tarifas com provedores em sandbox ou mocks. A publicação depende de revisão da branch e aprovação da homologação.

Em caso de regressão, restaure a imagem anterior no EasyPanel e revise a prontidão, o cardápio, a operação do KDS e os cabeçalhos da demo. Invalide cache de HTML, se houver. Esta entrega dispensa migração de schema e troca de credenciais.

## Resultados locais

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | TypeScript sem erros |
| `npm run build` | Build Vite concluído |
| `npm test` | 41 testes unitários passaram |
| `npm run test:integration` | 18 testes passaram com PostgreSQL descartável |
| `npm run test:e2e` | 15 testes passaram no Chromium |

A suíte de integração cobriu sessão, revogação no logout, permissões, isolamento de tenants, transações de catálogo e checkout, valores, idempotência e liquidação Pix. WhatsApp e provedores foram exercitados conforme fixtures e mocks existentes. A suíte de navegador incluiu checkout simulado, ausência de requisições operacionais da demo, complementos, recuperação do modal Pix, transição no KDS e retorno de foco do drawer administrativo a 390 px.

A landing e as duas páginas da demonstração passaram na checagem de largura do documento a 320, 375, 390, 768, 1024, 1280 e 1440 px. Na primeira execução, a landing apresentou transbordamento a 768 px. O ajuste de breakpoint passou na reexecução completa. Há capturas locais da landing a 1440 px e do cardápio demonstrativo a 390 px, comparando `e323cbb` com a branch final.

O build local gerou a entrada da landing com 49,42 kB gzip e a entrada da demo com 5,99 kB gzip, além dos chunks compartilhados. A cobertura automatizada não equivale a uma certidão WCAG, a uma medição de Core Web Vitals nem à homologação de todos os formulários legados e integrações em dispositivos reais.
