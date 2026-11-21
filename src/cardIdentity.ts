import type {Card} from './cardCatalog';

/** A printed "always treated as" clause replaces a card's rules name in all zones. */
export function rulesCardName(card:Pick<Card,'englishName'|'alwaysTreatedAs'>):string{
 return card.alwaysTreatedAs??card.englishName;
}
export function namedCard(card:Pick<Card,'englishName'|'alwaysTreatedAs'>,name:string):boolean{
 return rulesCardName(card)===name;
}
/** Archetype markers are additive (e.g. Black Skull Dragon is an Archfiend card). */
export function archetypeCard(card:Pick<Card,'englishName'|'alwaysTreatedAs'|'archetypes'|'excludedArchetypes'>,archetype:string):boolean{
 return !card.excludedArchetypes?.includes(archetype)&&(!!card.archetypes?.includes(archetype)||rulesCardName(card).includes(archetype));
}
