/** Individually reviewed public Normal Spells; certification is explicit and never grants distribution. */
import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';
const rows:[string,number,string,string|null][]=[
 ['26725158',4869,'Exile of the Wicked','Fiend'],
 ['21323861',4666,'Acid Rain','Machine'],
 ['56606928',4670,'Eternal Drought','Fish'],
 ['20101223',4669,'Breath of Light','Rock'],
 ['90873992',4659,'Warrior Elimination','Warrior'],
 ['94716515',4668,'Eradicating Aerosol','Insect'],
 ['95051344',4662,'Eternal Rest',null],
 ['90330453',4868,'Last Day of Witch','Spellcaster']
];
export const mechanicalBatch15:readonly Card[]=rows.map(([id,konamiId,name,race])=>({id,konamiId,name,englishName:name,kind:'spell',race:null,attribute:null,level:null,atk:null,defense:null,
 summary:race?`Descrição operacional: destrói os monstros do Tipo ${race} com a face para cima em ambos os campos.`:'Descrição operacional: destrói os monstros equipados com Cartas de Equipamento em ambos os campos.',
 source:`https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=${konamiId}&request_locale=en`}));
export const mechanicalEffects15:Readonly<Record<string,Effect>>=Object.fromEntries(rows.map(([id,,,race])=>[id,{kind:'destroyFiltered',filter:race?{races:[race]}:{equipped:true}}]));
