# Autenticação e proteção das APIs — atualização de 17/11/2026

## Fluxo implementado

- Login com scrypt, limite por IP e conta no PostgreSQL, sessão de 12 horas persistida em `auth_sessions`, revogação no logout e invalidação após mudança de hash de senha permanecem em [server.ts](../../server.ts). OTP WhatsApp continua vinculado ao telefone cadastrado, com HMAC, validade, limite e consumo único. Os testes usam Evolution local, não o serviço real.
- O navegador solicita modo cookie em login, verificação OTP e renovação de sessão. O backend emite `aladay_session` com `HttpOnly`, `SameSite=Strict`, `Path=/`, prazo de 12 horas e `Secure` em produção. O JSON do modo cookie não contém JWT e inclui token CSRF derivado por HMAC do identificador da sessão.
- Escritas privadas por cookie exigem `Origin` igual a `APP_URL` e `X-CSRF-Token` válido. GET de troca de Bearer legado por cookie aceita `Sec-Fetch-Site: same-origin`, pois navegadores omitem `Origin` nesse método. O cookie exige sessão ativa no banco. APIs com Bearer continuam funcionando durante a transição.
- [src/App.tsx](../../src/App.tsx) remove `aladay_auth_session` do `localStorage`, troca o token legado por cookie uma vez e restaura a sessão após reload. [src/utils/sessionFetch.ts](../../src/utils/sessionFetch.ts) adapta as chamadas existentes e mantém o CSRF apenas na memória da aba. Essa adaptação global é temporária e deverá ser substituída gradualmente por cliente HTTP explícito.

## Evidência de testes

- [tests/integration.test.ts](../../tests/integration.test.ts) cobre Bearer legado, troca por cookie, revogação, acesso cruzado, falha sem CSRF, CSRF errado e origem externa. OTP continua testado com provedor local.
- [tests/e2e/intelligence.spec.ts](../../tests/e2e/intelligence.spec.ts) verifica cookie `HttpOnly`/`SameSite`, ausência de JWT no `localStorage`, reload, logout e rejeição de CSRF inválido. Os oito testes Playwright passaram em banco descartável.
- Sem HTTPS na suíte local, o atributo `Secure` foi verificado por inspeção do código, não por navegador em ambiente de produção. Login real via Evolution e retorno de gateway exigem homologação em staging.

## Riscos restantes

| Área | Ação |
| --- | --- |
| XSS | Cookie `HttpOnly` protege o JWT contra leitura direta, mas XSS ainda pode executar ações na aba. Revisar HTML dinâmico, CSP e dependências. |
| Cliente HTTP | A adaptação de `window.fetch` cobre as chamadas atuais. Migrar para cliente explícito por módulo e verificar bibliotecas que não usem `fetch` global. |
| Sessões antigas | Clientes Bearer permanecem aceitos até expirar em até 12 horas; não houve revogação em massa. Monitorar uso e planejar retirada com janela anunciada. |
| Ambiente | `APP_URL` precisa refletir exatamente a origem HTTPS. Validar proxy confiável, `Secure`, OTP, várias abas e login administrativo no EasyPanel de homologação. |
| Permissões | Testes A/B cobrem módulos principais, mas ainda falta matriz exaustiva de todos os métodos, exclusões e webhooks. |

Não houve alteração de credenciais existentes nem migração de sessões de produção.
