# Manual operacional do recorte atual

1. O administrador habilita o Garçom no restaurante de teste pela API.
2. O proprietário cria as contas pela API e entrega as credenciais pelo procedimento interno do restaurante.
3. Acesse `/app/garcom/`, use a conta autorizada, selecione uma mesa livre e abra a comanda.
4. O mapa marca a mesa como ocupada após confirmação do servidor. Se outro operador a abriu primeiro, atualize o mapa.
5. Sem rede, aguarde a reconexão. A tela atualiza e não coloca pedidos ou aberturas em fila.
6. Em navegador compatível, use o menu do navegador para instalar o PWA. Para sair, use **Sair** com conexão disponível para revogação no servidor.

Com a comanda aberta, escolha um produto do catálogo, preencha a quantidade e os adicionais obrigatórios e, se necessário, informe observações. O total confirmado vem do servidor. Use **Enviar à cozinha** para publicar a rodada após revisar os itens. Atualize o salão para ver o status no KDS.

Se perder a resposta, use **Confirmar solicitação pendente** para repetir a operação. A conta permanece aberta. Este recorte não registra pagamentos nem encerra a comanda.
