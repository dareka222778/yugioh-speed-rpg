const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'deck-discord-m381-'));
process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const db=require('../dist/database');
const {openDeck,changeDeck}=require('../dist/decks');
const {getCard}=require('../dist/collection');
const {deckMessage,getDeckCardIndex}=require('../dist/deckUI');

const owner='m381-deck-discord';
const fusionIds=['40173854','89112729','02504891','27134689','86164529','41462083'];
db.createPlayer(owner,'Deck Discord test');
db.chooseStarterDeck(owner,'warrior');
openDeck(owner,1);
for(const id of fusionIds){
  const card=getCard(id);
  assert.ok(card?.fusion?.length, `enabled Fusion metadata missing for ${id}`);
  db.db.prepare('INSERT INTO player_cards(discord_id,card_key,quantity) VALUES(?,?,1)').run(owner,id);
}
let deck=openDeck(owner,1);
for(const id of fusionIds.slice(0,5)) deck=changeDeck(owner,1,id,1,deck.revision);

function plusControl(cardId){
  const index=getDeckCardIndex(owner,1,cardId);
  const page=Math.floor(index/6)+1;
  const message=deckMessage(owner,1,page,cardId);
  const rows=message.components.map(row=>row.toJSON());
  assert.equal(rows.length,4,'the standard deck editor must keep its four Discord rows');
  const plus=rows[2].components[1];
  return {plus,description:message.embeds[0].toJSON().description};
}

test('the Discord editor disables adding a sixth Fusion at 5/5 Extra Deck',()=>{
  const result=plusControl(fusionIds[5]);
  assert.equal(openDeck(owner,1).total,20);
  assert.equal(openDeck(owner,1).extraTotal,5);
  assert.equal(result.plus.disabled,true);
  assert.match(result.description,/20\/30 no Principal • 5\/5 no Adicional/);
});

test('a Main Deck card remains addable while the Extra Deck is full',()=>{
  const main=openDeck(owner,1).items.find(item=>!getCard(item.card_key)?.fusion&&item.quantity<3);
  assert.ok(main,'starter deck must expose a Main Deck card with copy capacity');
  const have=db.getCollection(owner).find(item=>item.card_key===main.card_key)?.quantity??0;
  db.db.prepare('UPDATE player_cards SET quantity=? WHERE discord_id=? AND card_key=?').run(main.quantity+1,owner,main.card_key);
  assert.ok(have<=main.quantity);
  const result=plusControl(main.card_key);
  assert.equal(result.plus.disabled,false,'Extra Deck fullness must not disable Main Deck additions');
  assert.match(result.description,/20\/30 no Principal • 5\/5 no Adicional/);
});

after(()=>{
  db.db.close();
  fs.rmSync(temp,{recursive:true,force:true});
});
