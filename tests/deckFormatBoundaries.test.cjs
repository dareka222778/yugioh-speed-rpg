const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'deck-format-m379-'));
process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const db=require('../dist/database');
const {openDeck,changeDeck,validateDeck}=require('../dist/decks');
const {getCard}=require('../dist/collection');
const {getPlayableCard}=require('../dist/effectRegistry');

const owner='m379-deck-format';
const fusionIds=['40173854','89112729','02504891','27134689','86164529','41462083'];

db.createPlayer(owner,'Deck format test');
db.chooseStarterDeck(owner,'warrior');
const initial=openDeck(owner,1);
for(const id of fusionIds){
  const card=getCard(id);
  assert.ok(card, `fusion ${id} must be visible in the enabled catalog`);
  assert.ok(card.fusion?.length, `${card.englishName} must carry factual fusion materials`);
  assert.ok(getPlayableCard(id), `${card.englishName} must be playable before it enters an Extra Deck`);
  db.db.prepare('INSERT INTO player_cards(discord_id,card_key,quantity) VALUES(?,?,1)').run(owner,id);
}

test('the classic format counts 20 main-deck cards separately from five Extra Deck cards',()=>{
  let deck=openDeck(owner,1);
  const inventoryBefore=db.getCollection(owner);
  for(const id of fusionIds.slice(0,5)) deck=changeDeck(owner,1,id,1,deck.revision);

  assert.equal(deck.total,20,'Fusion monsters must not inflate the Main Deck count');
  assert.equal(deck.extraTotal,5,'the Extra Deck must count its own cards');
  assert.deepEqual(deck.errors,[],'20 Main + 5 Extra is a valid classic deck');
  assert.deepEqual(db.getCollection(owner),inventoryBefore,'editing a deck must not consume collection cards');
});

test('a sixth Fusion card is rejected atomically without changing the deck or collection',()=>{
  const before=openDeck(owner,1);
  const inventoryBefore=db.getCollection(owner);
  assert.equal(before.extraTotal,5);
  assert.throws(()=>changeDeck(owner,1,fusionIds[5],1,before.revision),/Deck Adicional: máximo de 5 cartas/);
  assert.deepEqual(openDeck(owner,1),before,'the failed edit must leave every deck row unchanged');
  assert.deepEqual(db.getCollection(owner),inventoryBefore,'the failed edit must not grant, remove or consume inventory');
});

test('the pure validator reports the Extra Deck overflow while preserving Main Deck totals',()=>{
  const deck=openDeck(owner,1);
  const six=[...deck.items,{card_key:fusionIds[5],quantity:1}];
  const validation=validateDeck(six,db.getCollection(owner));
  assert.equal(validation.total,20);
  assert.equal(validation.extraTotal,6);
  assert.ok(validation.errors.some(error=>error==='Deck Adicional: máximo de 5 cartas.'));
  assert.ok(!validation.errors.some(error=>error.includes('Use 20 a 30 cartas')),
    'Extra Deck cards must not make a valid 20-card Main Deck appear oversized');
});

after(()=>{
  db.db.close();
  fs.rmSync(temp,{recursive:true,force:true});
});
