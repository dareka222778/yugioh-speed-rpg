const {test,after}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'decks-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const db=require('../dist/database');let api=require('../dist/decks');const {deckMessage,deckCardMessage,getDeckCardIndex}=require('../dist/deckUI');
const {starterContents}=require('../dist/cardCatalog');
for(const [i,type]of ['warrior','spellcaster','dragon'].entries()){db.createPlayer(String(i+1),'Teste');db.chooseStarterDeck(String(i+1),type);}
test('all starter styles open a valid 20-card deck without consuming inventory or changing profile',()=>{
 for(const id of ['1','2','3']){const before=db.getPlayer(id);const inventory=db.getCollection(id);const d=api.openDeck(id);assert.equal(d.total,20);assert.deepEqual(d.errors,[]);assert.equal(d.active,0);assert.deepEqual(db.getCollection(id),inventory);assert.deepEqual(db.getPlayer(id),before);assert.deepEqual(api.openDeck(id).items,d.items);}
});
test('only owned copies can be added, valid decks activate, invalid active decks deactivate, revisions reject stale edits',()=>{
 const d=api.openDeck('1');const card=d.items.find(c=>c.quantity===2).card_key;
 let active=api.activateDeck('1',1,d.revision);assert.equal(active.active,1);
 const changed=api.changeDeck('1',1,card,-1,active.revision);assert.equal(changed.total,19);assert.equal(changed.active,0);assert.throws(()=>api.activateDeck('1',1),/20 a 30/);
 assert.throws(()=>api.changeDeck('1',1,card,1,active.revision),/antigo/);
 const valid=api.changeDeck('1',1,card,1,changed.revision);assert.equal(valid.errors.length,0);
 assert.throws(()=>api.changeDeck('1',1,card,1),/possui/);assert.throws(()=>api.changeDeck('1',1,card,2),/3 cópias/);assert.throws(()=>api.changeDeck('1',1,'00000000',1),/catálogo/);
});
test('three separate slots share ownership, exactly one is active, fill never overwrites a nonempty deck',()=>{
 assert.equal(api.openDeck('1',2).total,0);api.fillInitialDeck('1',2);api.renameDeck('1',2,'Meu segundo');api.activateDeck('1',1);api.activateDeck('1',2);
 assert.equal(api.openDeck('1',1).active,0);assert.equal(api.openDeck('1',2).active,1);assert.equal(db.getCollection('1').reduce((s,c)=>s+c.quantity,0),20);
 assert.throws(()=>api.fillInitialDeck('1',2),/vazio/);assert.throws(()=>api.openDeck('1',4),/1 a 3/);assert.throws(()=>api.renameDeck('1',2,' '),/nome/);
 assert.equal(api.openDeck('2',2).total,0);assert.notEqual(api.openDeck('2',1).name,'Meu segundo');
});
test('max 30 and 3 copies, foreign ownership, malformed counts, unknown cards and database transaction rollback',()=>{
 const d=api.openDeck('3');const owned=d.items.map(c=>({...c,quantity:99}));
 assert.ok(api.validateDeck([{card_key:d.items[0].card_key,quantity:4}],owned).errors.some(x=>x.includes('3 cópias')));
 assert.ok(api.validateDeck([{card_key:'unknown',quantity:20}],[]).errors.length);
 assert.ok(api.validateDeck([{card_key:d.items[0].card_key,quantity:1.5}],owned).errors.length);
 for(const c of d.items)db.db.prepare('UPDATE player_cards SET quantity=3 WHERE discord_id=? AND card_key=?').run('3',c.card_key);
 for(const c of d.items){let now=api.openDeck('3');if(now.total===30)break;api.changeDeck('3',1,c.card_key,Math.min(3-c.quantity,30-now.total));}
 assert.equal(api.openDeck('3').total,30);const c=api.openDeck('3').items.find(c=>c.quantity<3);assert.throws(()=>api.changeDeck('3',1,c.card_key,1),/30 cartas/);
 const before=api.openDeck('3');db.db.exec("CREATE TRIGGER fail_edit BEFORE UPDATE ON decks WHEN NEW.discord_id='3' BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
 assert.throws(()=>api.changeDeck('3',1,c.card_key,-1),/simulated/);db.db.exec('DROP TRIGGER fail_edit');assert.deepEqual(api.openDeck('3'),before);
});
test('interactive panels serialize within Discord limits for every page and empty slot',()=>{
 for(const id of ['1','2','3'])for(const slot of [1,2,3])for(const page of [-1,1,2,999]){
  const p=deckMessage(id,slot,page);assert.ok(p.components.length<=5);const embed=p.embeds[0].toJSON();assert.ok(embed.fields.length<=6);
  for(const row of p.components){const data=row.toJSON();assert.ok(data.components.length<=5);for(const c of data.components)assert.ok(c.custom_id.length<=100);}
 }
});
test('owner-owned cards can be browsed individually with correct effect text and original deck return page',()=>{
 const cards=db.getCollection('1').filter(c=>c.quantity>0).map(c=>c.card_key);
 assert.ok(cards.length>6);
 for(const cardId of cards){
  const index=getDeckCardIndex('1',1,cardId);
  const view=deckCardMessage('1',1,index);
  assert.equal(view.cardId,cardId);
  assert.equal(view.components.length,1);
  const controls=view.components[0].toJSON().components;
  assert.equal(controls.length,3);
  assert.ok(controls[0].custom_id.startsWith('deck:card:1:1:'));
  assert.ok(controls[1].custom_id.startsWith('deck:view:1:1:'));
  assert.ok(controls[2].custom_id.startsWith('deck:card:1:1:'));
  assert.ok(view.embeds[0].toJSON().description.includes('Na coleção'));
 }
 const panel=deckMessage('1');
 const inspect=panel.components[2].toJSON().components.at(-1);
 assert.match(inspect.label,/Ver carta/);
 assert.ok(inspect.custom_id.startsWith('deck:inspect:1:1:'));
 assert.throws(()=>getDeckCardIndex('1',1,'00000000'),/não pertence/);
 assert.throws(()=>deckCardMessage('1',1,-1),/inexistente/);
 assert.throws(()=>deckCardMessage('1',1,999),/inexistente/);
});
test('saved decks and active selection survive database reopen; lost ownership invalidates active deck',()=>{
 api.activateDeck('1',2);const before=api.openDeck('1',2);db.db.close();delete require.cache[require.resolve('../dist/database')];delete require.cache[require.resolve('../dist/decks')];api=require('../dist/decks');
 assert.deepEqual(api.openDeck('1',2),before);const fresh=require('../dist/database');fresh.db.prepare('UPDATE player_cards SET quantity=0 WHERE discord_id=? AND card_key=?').run('1',before.items[0].card_key);
 assert.equal(api.openDeck('1',2).active,0);assert.ok(api.openDeck('1',2).errors.length);
 fresh.db.close();
});
after(()=>fs.rmSync(temp,{recursive:true,force:true}));
