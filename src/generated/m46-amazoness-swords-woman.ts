import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';

/** M46 — Amazoness Swords Woman redirects only battle damage that would be
 * inflicted to her controller's team. Damage already prevented remains zero. */
export const cards:readonly Card[]=[{
  id:'94004268',
  konamiId:5284,
  name:'Espada Amazoness',
  englishName:'Amazoness Swords Woman',
  kind:'monster',
  monsterType:'effect',
  race:'Warrior',
  attribute:'EARTH',
  level:4,
  atk:1500,
  defense:1600,
  summary:'Seu oponente sofre qualquer dano de batalha que você teria recebido de batalhas envolvendo este card, em vez de você.',
  source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5284&request_locale=en'
}];

export const effects:Record<string,Effect>={
  '94004268':{kind:'monsterEffect'}
};

export const monsters:Record<string,MonsterDefinition>={
  '94004268':{
    effect:{
      trigger:'continuous',
      operation:{
        kind:'continuous',
        rules:[{
          kind:'combat',
          filter:{selfOnly:true},
          rule:{kind:'damage',mode:'reflect',when:'battle'}
        }]
      }
    },
    activation:{policy:'continuous',window:'continuous'}
  }
};
