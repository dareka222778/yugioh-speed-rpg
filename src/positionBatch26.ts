import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';
const rows:[string,number,string,string,Card['kind'],string][]=[
 ['82828051',5983,'Tremor de Terra','Earthquake','spell','Coloque todos os monstros com a face para cima em Defesa.'],
 ['59744639',5001,'Tufão de Etaqua','Windstorm of Etaqua','trap','Mude a posição de batalha de todos os monstros com a face para cima do oponente.'],
 ['83133491',5857,'Gravidade Zero','Zero Gravity','trap','Mude a posição de batalha de todos os monstros com a face para cima no campo.'],
 ['31785398',5331,'Pronto para Interceptar','Ready for Intercepting','trap','Escolha 1 Guerreiro ou Mago com a face para cima no campo; coloque-o em Defesa com a face para baixo.']
];
export const positionBatch26:readonly Card[]=rows.map(([id,konamiId,name,englishName,kind,summary])=>({id,konamiId,name,englishName,kind,summary,race:null,attribute:null,level:null,atk:null,defense:null,source:`https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${konamiId}&request_locale=en`}));
const trap={speed:2 as const,window:'free' as const,damage:'never' as const};
export const positionEffects26:Record<string,Effect>={
 '82828051':{kind:'positionChange',activation:{speed:1,window:'main',damage:'never'},rule:{scope:'both',mode:'def'}},
 '59744639':{kind:'positionChange',activation:trap,rule:{scope:'opponent',mode:'switch'}},
 '83133491':{kind:'positionChange',activation:trap,rule:{scope:'both',mode:'switch'}},
 '31785398':{kind:'positionChange',activation:trap,rule:{scope:'selected',mode:'set',races:['Warrior','Spellcaster']}}
};
