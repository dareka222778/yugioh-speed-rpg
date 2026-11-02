# Missão 14 — primeira certificação da triagem, sem trocar semântica arquivada

Escopo limitado: **Flash Assailant (96890582)**, identificado no inventário da Missão 13. A fonte oficial Konami, CID 4918, declara redução de 400 ATK/DEF por carta na mão do controlador. O histórico OCG o registra em 20/06/2002, com ATK/DEF originais 2000/2000, Tipo Fiend e Atributo DARK.

Foi possível expressar esse efeito na operação tipada já congelada em v7: modifier sobre a própria fonte, com contagem dinâmica de cartas da mão do controlador. Ele depende de o monstro estar com a face para cima e é suprimido por negação dos efeitos do monstro; não cria estado duplicado no save.

Uma regressão de autorização foi detectada antes do envio: a política anterior negava por uma lista manual de lotes, de modo que uma carta nova poderia ficar liberada por omissão. A regra foi substituída por uma **lista positiva imutável das 130 cartas já distribuíveis**; todo futuro certificado nasce bloqueado por padrão. Três testes cobrem o conjunto histórico, desconhecidos e a nova carta.

Testes de regressão por carta: identidade e fingerprint, contagem de mão de zero a seis, compra/descarte, flip, Skill Drain, invocação e replay determinístico, rejeição pela revisão antiga e preservação dos 740 certificados prévios. O catálogo anterior não é sobrescrito; a revisão nova só acrescenta a carta, sempre bloqueada para distribuição.

As sete Magias identificadas na triagem (Exile of the Wicked, Acid Rain, Eternal Drought, Breath of Light, Warrior Elimination, Eradicating Aerosol e Eternal Rest) **não são liberadas aqui**. Destruição filtrada por Tipo ou Equipamento requer uma operação tipada ainda inexistente no resolver congelado. A próxima etapa é criar uma versão de resolver isolada, mantendo os executáveis/saves anteriores intactos, e testar então a família inteira.

Nenhum merge, deploy, liberação de loja, alteração no layout de duelo ou login em Discord real ocorreu.
