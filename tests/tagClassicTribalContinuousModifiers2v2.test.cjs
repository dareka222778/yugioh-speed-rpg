'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const tag=require('../dist/tagDuel');
const engine=require('../dist/duelEngine');
const {getPlayableCard}=require('../dist/effectRegistry');
const {getMonsterEffect}=require('../dist/monsterEffects');

const HARPIE_LADY_1='91932350';
const HARPIES_PET_DRAGON='52040216';
const SWAMP_BATTLEGUARD='40453765';
const LAVA_BATTLEGUARD='20394040';
const DARK_MAGICIAN_GIRL='38033121';
const DARK_MAGICIAN='46986414';
const SPEAR_DRAGON='31553716';
const BLUE_EYES='89631139';

for(const [id,name] of [
  [HARPIE_LADY_1,'Harpie Lady 1'],
  [HARPIES_PET_DRAGON,"Harpie's Pet Dragon"],
  [SWAMP_BATTLEGUARD,'Swamp Battleguard'],
  [LAVA_BATTLEGUARD,'Lava Battleguard'],
  [DARK_MAGICIAN_GIRL,'Dark Magician Girl'],
  [DARK_MAGICIAN,'Dark Magician'],
  [SPEAR_DRAGON,'Spear Dragon'],
  [BLUE_EYES,'Blue-Eyes White Dragon']
]){
  assert.equal(getPlayableCard(id)?.englishName,name);
}
for(const id of [HARPIE_LADY_1,HARPIES_PET_DRAGON,SWAMP_BATTLEGUARD,LAVA_BATTLEGUARD,DARK_MAGICIAN_GIRL]){
  assert.equal(getMonsterEffect(id)?.trigger,'continuous');
  assert.equal(getMonsterEffect(id)?.operation.kind,'continuous');
}
assert.equal(getPlayableCard(SPEAR_DRAGON)?.attribute,'WIND');
assert.equal(getPlayableCard(BLUE_EYES)?.attribute,'LIGHT');

const normal=[...new Set(tag.tagNormalCardIds)]
  .map(id=>({id,card:getPlayableCard(id)}))
  .filter(entry=>entry.card&&entry.card.kind==='monster'&&Number.isInteger(entry.card.atk)&&Number.isInteger(entry.card.defense));
assert.ok(normal.length>=8,'the continuous modifier fixture needs eight certified Normal Monsters');
const normalIds=normal.slice(0,8).map(entry=>entry.id);

function member(seat){return 'm203-seat-'+seat;}
function deck(required=[]){
  const ids=[...new Set([...required,...normalIds])];
  assert.ok(ids.length>=8);
  return Array.from({length:20},(_,index)=>ids[index%ids.length]);
}
function game(required,seed){
  const players=[0,1,2,3].map(seat=>({
    id:member(seat),name:'M203 Seat '+seat,cards:deck(required)
  }));
  const state=tag.createTagDuel(players,{classic:true,first:0,seed});
  state.core.rulesVersion='speed-rpg-v2';
  state.core.turn=3;
  return state;
}
function holder(state,seat){
  const team=seat%2;
  return state.active[team]===seat?state.core.players[team]:state.reserves[seat];
}
function takeCard(state,seat,id){
  const physical=holder(state,seat);
  for(const zone of ['hand','deck']){
    const index=physical[zone].findIndex(card=>card.id===id);
    if(index>=0)return physical[zone].splice(index,1)[0];
  }
  throw new Error('M203 fixture card missing from physical seat '+seat+': '+id);
}
function deploy(state,seat,id,position='atk'){
  const card=takeCard(state,seat,id);
  const monster={...card,owner:seat%2,position,faceUp:true,
    entered:0,changed:0,attacked:0,atkBoost:0,defBoost:0};
  state.core.players[seat%2].monsters.push(monster);
  return monster;
}
function inventorySnapshot(state){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,80,'four physical 20-card Decks must contribute 80 cards');
  const snapshot=new Map(cards.map(card=>[card.uid,card.id]));
  assert.equal(snapshot.size,80,'all physical UIDs must be unique');
  return snapshot;
}
function assertConserved(state,before){
  const cards=tag.tagInventory(state);
  assert.equal(cards.length,before.size,'continuous modifiers must not create or remove cards');
  assert.equal(new Set(cards.map(card=>card.uid)).size,before.size,'continuous modifiers must not duplicate UIDs');
  for(const card of cards)assert.equal(before.get(card.uid),card.id,'physical identity changed: '+card.uid);
}

test('Harpie Lady 1 grants +300 ATK to WIND monsters across both shared 2v2 fields only',()=>{
  let state=game([HARPIE_LADY_1,SPEAR_DRAGON,BLUE_EYES],'m203-harpie-lady-global-wind');
  const before=inventorySnapshot(state);
  const source=deploy(state,2,HARPIE_LADY_1);
  const allyWind=deploy(state,0,SPEAR_DRAGON);
  const opponentWind=deploy(state,3,SPEAR_DRAGON);
  const opponentLight=deploy(state,1,BLUE_EYES);
  assert.match(source.uid,/^m2:/,'the global modifier source retains partner physical ownership');
  assert.equal(engine.atk(source,state.core),1600,'Harpie Lady 1 receives its own WIND bonus');
  assert.equal(engine.atk(allyWind,state.core),2200,'the active teammate WIND monster receives +300 ATK');
  assert.equal(engine.atk(opponentWind,state.core),2200,'the opposing team WIND monster also receives +300 ATK');
  assert.equal(engine.atk(opponentLight,state.core),3000,'a non-WIND monster receives no bonus');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test("Harpie's Pet Dragon counts Harpie Lady 1 on both teams, including partner-owned copies",()=>{
  let state=game([HARPIE_LADY_1,HARPIES_PET_DRAGON],'m203-pet-dragon-count-both-teams');
  const before=inventorySnapshot(state);
  const pet=deploy(state,0,HARPIES_PET_DRAGON);
  const allyHarpie=deploy(state,2,HARPIE_LADY_1);
  const opponentHarpie=deploy(state,3,HARPIE_LADY_1);
  assert.match(allyHarpie.uid,/^m2:/);
  assert.match(opponentHarpie.uid,/^m3:/);
  assert.equal(engine.atk(pet,state.core),3200,
    "Pet Dragon gets +600 from two global WIND sources and +600 for two Harpie Lady names");
  assert.equal(engine.def(pet,state.core),3100,
    'Pet Dragon gets +600 DEF for the two face-up Harpie Lady names on both teams');
  allyHarpie.faceUp=false;
  assert.equal(engine.atk(pet,state.core),2600,
    'turning one Harpie Lady face-down removes one global WIND bonus and one name count');
  assert.equal(engine.def(pet,state.core),2800,
    'only the remaining face-up Harpie Lady contributes to Pet Dragon DEF');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Swamp and Lava Battleguard count only the matching partner on their own shared team',()=>{
  let state=game([SWAMP_BATTLEGUARD,LAVA_BATTLEGUARD],'m203-battleguard-pair');
  const before=inventorySnapshot(state);
  const swamp=deploy(state,0,SWAMP_BATTLEGUARD);
  const lava=deploy(state,2,LAVA_BATTLEGUARD);
  const opposingLava=deploy(state,1,LAVA_BATTLEGUARD);
  assert.match(lava.uid,/^m2:/,'the Lava Battleguard source belongs physically to the inactive partner');
  assert.equal(engine.atk(swamp,state.core),2300,
    'Swamp Battleguard receives +500 from its own team partner Lava Battleguard');
  assert.equal(engine.atk(lava,state.core),2050,
    'Lava Battleguard receives +500 from the active teammate Swamp Battleguard');
  assert.equal(engine.atk(opposingLava,state.core),1550,
    'an opposing team Battleguard cannot borrow the allied Swamp Battleguard bonus');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});

test('Dark Magician Girl counts named monsters in both shared team Graveyards',()=>{
  let state=game([DARK_MAGICIAN_GIRL,DARK_MAGICIAN],'m203-dark-magician-girl-both-graves');
  const before=inventorySnapshot(state);
  const girl=deploy(state,2,DARK_MAGICIAN_GIRL);
  const ownDarkMagician=takeCard(state,0,DARK_MAGICIAN);
  const opposingDarkMagician=takeCard(state,3,DARK_MAGICIAN);
  state.core.players[0].grave.push(ownDarkMagician);
  state.core.players[1].grave.push(opposingDarkMagician);
  assert.match(ownDarkMagician.uid,/^m0:/);
  assert.match(opposingDarkMagician.uid,/^m3:/);
  assert.equal(engine.atk(girl,state.core),2600,
    'Dark Magician Girl gains 300 ATK for each Dark Magician in the two teams Graveyards');
  const opposingIndex=state.core.players[1].grave.findIndex(card=>card.uid===opposingDarkMagician.uid);
  assert.notEqual(opposingIndex,-1);
  const [returned]=state.core.players[1].grave.splice(opposingIndex,1);
  holder(state,3).hand.push(returned);
  assert.equal(engine.atk(girl,state.core),2300,
    'returning the opposing Graveyard copy to its physical owner hand removes exactly one 300 ATK count');
  tag.assertTagDuel(state);
  assertConserved(state,before);
});
