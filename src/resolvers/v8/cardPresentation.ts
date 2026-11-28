import type {Card} from './cardCatalog';
/** Presentation fallback never changes identity, mechanics or certification. */
export function displayCardName(card:Pick<Card,'id'> & {name?:unknown;englishName?:unknown}):string{
 if(typeof card.name==='string'&&card.name.trim())return card.name;
 if(typeof card.englishName==='string'&&card.englishName.trim())return card.englishName.trim();
 return `Carta ${card.id}`;
}
export function presentedCard(card:Card):Card{return card.name===displayCardName(card)?card:{...card,name:displayCardName(card)};}
