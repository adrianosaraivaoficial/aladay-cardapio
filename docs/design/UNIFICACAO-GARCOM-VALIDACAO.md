# Aladay · Unificação do Garçom e validação

## Branch e comportamento

A branch `feature/aladay-premium-redesign` incorpora a ponta versionada de `feature/aladay-garcom` (`a26ddf9`). O proprietário pode abrir o PWA na seção **Mesas & Garçom (Salão)**. O aplicativo tem sessão própria, exige uma conta autorizada e opera somente para o restaurante da sessão quando a respectiva flag está habilitada.

O PWA abre comandas, calcula itens e adicionais usando o catálogo do restaurante e envia rodadas ao KDS. O service worker está restrito a `/app/garcom/` e mantém em cache somente uma página pública de indisponibilidade. Após a reconexão, o aplicativo volta a consultar o servidor. A tela legada continua disponível para as operações existentes. A implementação local de fechamento de caixa da outra cópia ainda estava sem commit e ficou fora desta entrega.

A migração `database/garcom.sql` é aditiva e integra o bootstrap existente. A flag fica desativada por padrão. O teste rodou em PostgreSQL descartável e o merge ficou local.

## Interface e acessibilidade

- **Componentes compartilhados.** Campos, botões, painéis, bordas de controle, foco e mensagens de status passaram a usar os mesmos estilos em login, Inteligência e Garçom. A tela legada de mesas também reutiliza as mensagens.
- **Inteligência.** Atalhos navegam e transferem o foco para importação, analytics, complementos ou avaliações, sem alterar a URL. As tabelas de analytics oferecem rolagem por teclado e cabeçalhos de coluna. Filtros ficam estáveis durante uma consulta.
- **Login e Garçom.** Rótulos associados, autocompletar para e-mail, senha, telefone e código, estado do método de acesso anunciado e navegação por teclado entre mesa e comanda. Campos e botões usam alvos maiores.
- **Alcance da avaliação.** Axe com regras A e AA das versões WCAG 2.0 a 2.2 nas amostras dos fluxos. Os testes de navegador exercitam navegação, foco e reflow a 320 px no Garçom. A cobertura não demonstra conformidade integral. Faltam avaliação de toda a interface com tecnologias assistivas, contraste em temas de tenants e testes em aparelhos e navegadores reais.

Referência normativa [WCAG 2.2 do W3C](https://www.w3.org/TR/WCAG22/).

## Provedores externos

| Provedor | Evidência disponível | Homologação pendente |
| --- | --- | --- |
| Asaas e Pix | Suíte local com dados e respostas simuladas para conciliação, recorrência, duplicidade e valores. A jornada de Pix no navegador exercita recuperação e confirmação pelo servidor de teste. | Conta sandbox e webhook configurado na imagem em homologação. |
| Evolution API e WhatsApp | Testes locais de OTP, filas e entrega simulada. A rodada do Garçom sem telefone chegou ao KDS sem gerar notificação. | Instância de teste e número autorizado para confirmar entrega externa. |
| n8n | Consulta de metadados somente leitura. Recepção, Buffer e Verificar origem estavam ativos. Nenhuma execução disponível na Recepção ou em QA origem Evolution. Buffer e Verificar origem tinham três execuções canceladas cada. A amostra disponível do Orquestrador tinha três execuções bem-sucedidas e cinco canceladas. Envio e Áudio tinham quatro canceladas cada. O histórico não confirma uma rodada integrada com a branch atual. | Execução completa em homologação, com identificador de correlação e evento de teste. |
| Gemini | Teste local do tratamento de falha do provedor de extração e preservação do rascunho. | Extração de um arquivo fictício com orçamento e autorização de teste. |
| iFood | Tela e integração existente preservadas pelo merge. | Validação em sandbox com pedido de teste e atualização de status. |

A landing pública respondeu HTTP 200 por HTTPS. A solicitação de dados de campo via PageSpeed Insights retornou HTTP 429. Nenhuma execução externa foi disparada, nenhuma cobrança foi criada e o plugin Supabase não foi utilizado.

## Reproduzir antes de publicar

Use a branch em um clone com `ad99e81` disponível. O bundle inclui a demo, o redesign anterior e o merge do Garçom.

```sh
git bundle verify /caminho/aladay-premium-garcom.bundle
git fetch /caminho/aladay-premium-garcom.bundle refs/heads/feature/aladay-premium-redesign:refs/heads/feature/aladay-premium-redesign
git switch feature/aladay-premium-redesign
npm ci
npm run lint
npm run build
npm test
npm run test:integration
npm run test:e2e
```

Use `TEST_DATABASE_URL` para um banco PostgreSQL descartável com sufixo `_test`. Para verificar WCAG na suíte Playwright, defina `ALADAY_AXE_PATH` para o arquivo local `axe.min.js` do axe-core 4.14.1. Para medir novamente, sirva o build com `npm run preview`, instale Chromium com `npx playwright install chromium` e execute `node scripts/measure-web-vitals.mjs` com `ALADAY_WEB_VITALS_PATH` apontando para `dist/web-vitals.iife.js` do web-vitals 6.2.3. O preview padrão usa `http://127.0.0.1:4173`. Aponte `ALADAY_AUDIT_URL` para outra porta, se necessário.

Em homologação, verifique backup e bootstrap aditivo, habilite a flag apenas no tenant de teste e confira abertura, envio ao KDS, cache offline, revogação da sessão e os provedores acima. Escolha um único fluxo de comandas por operação-piloto e valide a transição com o operador. Em caso de incidente, desative a flag do tenant e restaure a imagem anterior se necessário. Preserve os dados para análise.

## Resultados executados

| Verificação | Resultado |
| --- | --- |
| TypeScript e build Vite | Passaram |
| Testes unitários | 41 passaram |
| Integração com PostgreSQL descartável | 26 passaram, incluindo escopo de tenant, permissões, preços, idempotência e envio ao KDS |
| Playwright no Chromium | 16 passaram com axe habilitado |
| Axe nas amostras | Zero violações detectadas no rascunho de importação, no painel de analytics com resultados, no login do Garçom, na mesa livre e na comanda com formulário de item |
| PWA no build | Manifesto e service worker registrados no escopo esperado. Após recarregar offline, o navegador exibiu a página de indisponibilidade. Somente esse HTML aparecia no cache do PWA. |

## Core Web Vitals em laboratório

Três navegações com cache frio por rota, Chromium a 390 × 844 CSS px, CPU com limitação de 4×, latência de 40 ms, download de 10 Mb/s e recursos externos bloqueados. O INP inclui ações executadas no FAQ, na busca da demo e no campo de e-mail do Garçom. Os tempos são medianas das três amostras.

| Rota | LCP | INP | CLS |
| --- | ---: | ---: | ---: |
| Landing | 1,952 s | 136 ms | 0 |
| Cardápio demo | 1,200 s | 72 ms | 0 |
| Login Garçom | 0,808 s | 40 ms | 0 |

As três medianas atingiram os limites de referência para boa experiência. Uma execução exploratória da landing em paralelo com a suíte chegou a LCP de 4,660 s e INP de 216 ms. Na repetição sem a suíte concorrente, o pior dos três valores da landing foi 2,392 s de LCP e 192 ms de INP. O resultado não representa o percentil 75 de usuários reais nem mede a jornada autenticada no painel. O build gerou um chunk próprio de Garçom de 6,05 kB gzip, além dos módulos compartilhados. [Referência de Web Vitals](https://web.dev/articles/vitals).
