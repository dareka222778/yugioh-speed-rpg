import type {Card} from '../cardCatalog';
import type {Effect} from '../effectDefinitions';
import type {MonsterDefinition} from '../monsterEffects';

/** M45 — Arsenal Bug: its printed 1000-point fallback is conditional on the
 * absence of any other face-up Insect in its controller team's shared field.
 * The capped count prevents a third/further Insect from over-boosting stats. */
export const cards:readonly Card[]=[{
  id:'42364374',
  konamiId:5033,
  name:'Inseto Arsenal',
  englishName:'Arsenal Bug',
  kind:'monster',
  monsterType:'effect',
  race:'Insect',
  attribute:'EARTH',
  level:3,
  atk:2000,
  defense:2000,
  summary:'Se você não controlar nenhum outro monstro do Tipo Inseto, o ATK e DEF deste card se tornam 1000.',
  source:'https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=5033&request_locale=en'
}];

export const effects:Record<string,Effect>={
  '42364374':{kind:'monsterEffect'}
};

export const monsters:Record<string,MonsterDefinition>={
  '42364374':{
    effect:{
      trigger:'continuous',
      operation:{
        kind:'continuous',
        rules:[{
          kind:'modifier',
          filter:{selfOnly:true},
          atk:-1000,
          def:-1000,
          count:{
            zone:'monsters',
            controller:'source',
            races:['Insect'],
            faceUp:true,
            excludeSource:true,
            cap:1,
            atk:1000,
            def:1000
          }
        }]
      }
    },
    activation:{policy:'continuous',window:'continuous'}
  }
};
