'use strict';
const assert=require('node:assert/strict');
/** Representative real decks, including exact Fusion recipes and legal copy limits. */
function buildDeck(base,selected,fusion,getCard){const cards=[],counts=new Map();function add(id){const c=getCard(id);assert.ok(c,'Unplayable representative card '+id);assert.ok(!c.fusion,'Fusion in Main Deck');const name=c.alwaysTreatedAs??c.englishName??id;if((counts.get(name)??0)>=3)return;assert.ok(cards.length<30,'Representative dependencies exceed 30 cards');cards.push(id);counts.set(name,(counts.get(name)??0)+1);}
 for(const id of selected)add(id);if(fusion){const c=getCard(fusion);assert.ok(c?.fusion?.length,'Exact Fusion recipe required');for(const id of [...new Set(c.fusion),'24094653'])for(let n=0;n<3;n++)add(id);}
 for(const id of base)if(cards.length<30)add(id);assert.ok(cards.length>=20&&cards.length<=30,'Representative Main Deck must contain 20..30 cards');return {cards,extra:fusion?[fusion]:[]};}
module.exports={buildDeck};
