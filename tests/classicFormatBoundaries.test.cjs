const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'classic-format-boundaries-'));
process.env.DATABASE_PATH=path.join(temp,'game.sqlite');

const {RULES_PROFILE,RULES_VERSION,rulesFor}=require('../dist/rulesProfile');
const {starterContents}=require('../dist/cardCatalog');
const {engineCatalog,getPlayableCard}=require('../dist/effectRegistry');
const {validateDeck}=require('../dist/decks');
const {createDuel}=require('../dist/duelEngine');
const {assertDuelState}=require('../dist/duelIntegrity');
const db=require('../dist/database');

const main20=starterContents.warrior.map(item=>({card_key:item.id,quantity:item.quantity}));
const fusionIds=[...new Set(engineCatalog.filter(card=>card.fusion&&getPlayableCard(card.id)).map(card=>card.id))].slice(0,6);
const owned=[
  ...main20.map(item=>({card_key:item.card_key,quantity:3})),
  ...fusionIds.map(id=>({card_key:id,quantity:3}))
];
const main30=main20.map((item,index)=>({...item,quantity:item.quantity+(index<10?1:0)}));
const main31=main30.map((item,index)=>({...item,quantity:item.quantity+(index===10?1:0)}));
const main19=main20.map((item,index)=>({...item,quantity:item.quantity-(index===0?1:0)}));
const extraItems=count=>fusionIds.slice(0,count).map(id=>({card_key:id,quantity:1}));
const validate=(main,extraCount=0)=>validateDeck([...main,...extraItems(extraCount)],owned);

test('classic v1 profile keeps the requested 20-30 / 3+3 / Extra 5 / End Phase six-card rules',()=>{
  assert.equal(RULES_VERSION,'speed-rpg-classic-v1');
  assert.deepEqual({
    mainDeckMin:RULES_PROFILE.mainDeckMin,
    mainDeckMax:RULES_PROFILE.mainDeckMax,
    monsterZones:RULES_PROFILE.monsterZones,
    spellTrapZones:RULES_PROFILE.spellTrapZones,
    extraDeckMax:RULES_PROFILE.extraDeckMax,
    handLimit:RULES_PROFILE.handLimit,
    handCheck:RULES_PROFILE.handCheck
  },{
    mainDeckMin:20,mainDeckMax:30,monsterZones:3,spellTrapZones:3,
    extraDeckMax:5,handLimit:6,handCheck:'end'
  });
  assert.deepEqual(rulesFor({rulesVersion:RULES_VERSION}),RULES_PROFILE);
});

test('deck validation accepts both legal main-deck boundaries with five Fusion cards',()=>{
  assert.ok(fusionIds.length>=6,'the certified catalog must provide at least six playable Fusion cards for boundary testing');
  const minimum=validate(main20,5);
  assert.equal(minimum.total,20);
  assert.equal(minimum.extraTotal,5);
  assert.deepEqual(minimum.errors,[]);
  const maximum=validate(main30,5);
  assert.equal(maximum.total,30);
  assert.equal(maximum.extraTotal,5);
  assert.deepEqual(maximum.errors,[]);
});

test('deck validation rejects 19 or 31 main-deck cards, six Extra cards and a fourth copy',()=>{
  assert.ok(validate(main19,0).errors.some(error=>error.includes('Use 20 a 30 cartas')));
  assert.ok(validate(main31,0).errors.some(error=>error.includes('Use 20 a 30 cartas')));
  assert.ok(validate(main20,6).errors.some(error=>error.includes('Deck Adicional: máximo de 5 cartas')));
  const fourCopies=validateDeck([{card_key:main20[0].card_key,quantity:4}],owned);
  assert.ok(fourCopies.errors.some(error=>error.includes('Máximo de 3 cópias')));
});

function take(player,id){
  for(const zone of ['hand','deck']){
    const index=player[zone].findIndex(card=>card.id===id);
    if(index>=0)return player[zone].splice(index,1)[0];
  }
  throw new Error('carta de teste indisponível: '+id);
}

function formatBoundaryDuel(){
  const cards=starterContents.warrior.flatMap(item=>Array(item.quantity).fill(item.id));
  const state=createDuel([
    {id:'format-a',name:'Formato A',cards},
    {id:'format-b',name:'Formato B',cards}
  ],()=>0.5);
  const player=state.players[0];
  const monsterIds=['91152256','91152256','48305365'];
  player.monsters=monsterIds.map((id,index)=>{
    assert.equal(getPlayableCard(id)?.kind,'monster');
    return {...take(player,id),faceUp:true,position:'atk',entered:1,changed:1,attacked:0,atkBoost:0,defBoost:0};
  });
  const backrowIds=['38199696','66788016','17814387'];
  player.backrow=backrowIds.map(id=>{
    assert.ok(['spell','trap'].includes(getPlayableCard(id)?.kind));
    return {...take(player,id),setTurn:1,faceUp:false};
  });
  assert.ok(fusionIds.length>=5);
  player.extra=fusionIds.slice(0,5).map((id,index)=>({uid:'format-extra-'+index,id}));
  return state;
}

test('duel integrity accepts exactly three Monster Zones, three Spell/Trap Zones and five Extra cards',()=>{
  const state=formatBoundaryDuel();
  assert.equal(state.players[0].monsters.length,3);
  assert.equal(state.players[0].backrow.length,3);
  assert.equal(state.players[0].extra.length,5);
  assert.doesNotThrow(()=>assertDuelState(state));
});

test('duel integrity rejects a fourth monster, fourth backrow card or sixth Extra card',()=>{
  const base=formatBoundaryDuel();
  const fourthMonster=structuredClone(base);
  fourthMonster.players[0].monsters.push({...fourthMonster.players[0].monsters[0],uid:'overflow-monster'});
  assert.throws(()=>assertDuelState(fourthMonster),/limite de zonas/);

  const fourthBackrow=structuredClone(base);
  fourthBackrow.players[0].backrow.push({...fourthBackrow.players[0].backrow[0],uid:'overflow-backrow'});
  assert.throws(()=>assertDuelState(fourthBackrow),/limite de zonas/);

  const sixthExtra=structuredClone(base);
  sixthExtra.players[0].extra.push({...sixthExtra.players[0].extra[0],uid:'overflow-extra'});
  assert.throws(()=>assertDuelState(sixthExtra),/limite de zonas/);
});

after(()=>{
  db.db.close();
  fs.rmSync(temp,{recursive:true,force:true});
});
