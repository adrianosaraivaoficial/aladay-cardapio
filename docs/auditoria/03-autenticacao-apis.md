# Autenticação e proteção das APIs — 17/11/2026

## Fluxo observado

- Login em [server.ts](../../server.ts): senha scrypt com salt e comparação constante, limite por IP e conta em PostgreSQL, JWT HS256 de 12 horas. `auth_sessions` guarda `jti`, usuário, hash da credencial, expiração e revogação; cada requisição com Bearer compara a sessão e o usuário persistidos. Logout revoga a sessão. Teste de revogação e expiração passou em [tests/integration.test.ts](../../tests/integration.test.ts).
- OTP WhatsApp usa telefone já cadastrado, código aleatório de seis dígitos, HMAC armazenado, validade de dez minutos, limites por IP/conta e consumo único transacional. Teste com serviço Evolution local passou. Não houve teste com Evolution real.
- O perímetro em [backend/security.ts](../../backend/security.ts) enumera rotas públicas. As demais exigem sessão, e rotas de tenant dependem de verificação de escopo. Superadmin tem acesso global; `KITCHEN_STAFF` tem alterações limitadas. A correção de leitura Pix e serialização está registrada em [02-seguranca-multitenant.md](./02-seguranca-multitenant.md).
- Não há cookies de autenticação no fluxo atual. O frontend armazena JWT em `localStorage` em [src/App.tsx](../../src/App.tsx) e envia `Authorization: Bearer`. Isso evita CSRF de cookie no fluxo atual, mas deixa o token acessível a JavaScript da página. CSP em produção e escape padrão do React reduzem superfície de XSS; não constituem prova de ausência de XSS. Não foi encontrada configuração CORS permissiva no Express, mas isso não substitui autenticação.
- `express.json` limita o corpo a 1 MB, há validações por rota e SQL parametrizado nos fluxos principais inspecionados. Sem auditoria dinâmica de todas as entradas, não se declara ausência de SQL injection ou XSS.

## Riscos pendentes

| Risco | Evidência / ação segura |
| --- | --- |
| Roubo de token por XSS | `localStorage` em `src/App.tsx`; revisar pontos de HTML dinâmico e dependências, planejar cookies `HttpOnly`, `Secure` e `SameSite`. |
| Revogação de sessão após troca de credencial | Comparação de `credential_hash` existe; adicionar testes de atualização de senha e de sessão em múltiplas réplicas. |
| Limites locais por processo | O limite rápido de login usa `Map`; há limite persistido em PostgreSQL. Testar pressão em múltiplas instâncias e política de proxy confiável. |
| Permissões incompletas por rota | As regras gerais não substituem um inventário de capacidades por função. Continuar matriz de testes para cada método sensível. |
| Segredos e configuração | `persistEnvConfig` em `server.ts` tenta escrever `.env`; Docker de produção é read-only. Atualizações via painel podem divergir do ambiente após reinício. Desenhar armazenamento/rotação explícitos antes de mudar esse fluxo. |

## Transição proposta para cookie, sem mudança nesta branch

1. Adicionar emissão opcional de cookie para clientes novos, preservando Bearer existente por janela definida; registrar métricas sem tokens.
2. Implementar token CSRF para métodos de escrita autenticados por cookie e validar `Origin`/`Referer` com domínio configurado. Decidir `SameSite=Lax` ou `Strict` após testar fluxos de pagamento e retorno.
3. Atualizar frontend e testes de login, refresh, logout, OTP, redirecionamentos, dois tenants, permissões e múltiplas abas; só então remover persistência antiga do JWT.
4. Revogar sessões antigas de forma controlada após a transição e publicar instruções para clientes. Não alterar autenticação sem suíte de ponta a ponta completa.
