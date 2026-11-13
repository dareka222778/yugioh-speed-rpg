# 0.9.0 — comandos consistentes e guia do duelista

- Perfil com base azul, retrato preservado e cor pessoal como acento. Nome, biografia, DP, XP, nível e estilo também aparecem como texto acessível no Discord.
- Coleção com resumo visual e navegação reconhecida antes da renderização, evitando expirar a interação.
- Moldura de carta compartilhada entre consulta, editor, NPC e zonas. Nomes completos, tipo/atributo em português, contagem contextual e texto integral no embed; a imagem apresenta um resumo e orienta para o texto abaixo.
- /ajuda e /regras privados, com assuntos e atalhos para perfil, coleção, decks e NPCs. Menus vinculados ao dono; regras e recompensas atuais, sem a antiga mensagem de quatro efeitos.
- Galeria mantém personagens e os decks reais. A arena 1v1 permanece byte a byte idêntica (SHA-256 01d2253332cae7cf18106979e461af7524eda88794021134d2424755b0fb351c).

Validação: 375 testes; PNGs de perfil, coleção e inspeção revisados visualmente; controle de tamanho de mensagens e fallback textual. O CI gera previews sem CDN. Isso não substitui avaliação estética em um celular ou aceite humano no Discord. A expansão 2v2 continua separada.
