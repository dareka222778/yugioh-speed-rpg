const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'collection-db-'));process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
let api=require('../dist/database');const {cards,starterContents}=require('../dist/cardCatalog');const {collectionMessage,searchCards,exactCard,cardMessage}=require('../dist/collection');
const total=id=>api.getCollection(id).reduce((s,x)=>s+x.quantity,0);
test('catalog has stable unique identifiers and each starter contains exactly 20 valid cards',()=>{
 assert.equal(cards.length,28);assert.equal(new Set(cards.map(c=>c.id)).size,28);
 for(const contents of Object.values(starterContents)){assert.equal(contents.reduce((s,x)=>s+x.quantity,0),20);assert.equal(contents.length,12);for(const x of contents)assert.ok(cards.some(c=>c.id===x.id));}
 const c=exactCard('Guardião Celta');assert.equal(c.atk,1400);assert.equal(c.defense,1200);assert.equal(c.id,'91152256');
});
test('new starter delivery is atomic and repeat actions never duplicate cards',()=>{
 for(const [n,deck]of ['warrior','spellcaster','dragon'].entries()){
  const id=String(100+n);api.createPlayer(id,'Novo');assert.equal(api.chooseStarterDeck(id,deck),true);assert.equal(total(id),20);
  for(let n=0;n<5;n++){assert.equal(api.grantStarterCards(id),false);assert.equal(api.chooseStarterDeck(id,'dragon'),false);}
  assert.equal(total(id),20);assert.equal(api.getPlayer(id).dp,1000);
 }
});
test('legacy delivery preserves profile and inventory and survives reopening',()=>{
 api.createPlayer('200','Kise');api.db.prepare("UPDATE players SET starter_deck='spellcaster',dp=1250,character_name='Kairos',theme='rubi' WHERE discord_id='200'").run();
 api.db.prepare("INSERT INTO player_cards(discord_id,card_key,quantity) VALUES ('200','91152256',3)").run();
 assert.equal(api.grantLegacyStarters(),1);assert.equal(total('200'),23);assert.equal(api.grantLegacyStarters(),0);
 api.db.close();delete require.cache[require.resolve('../dist/database')];api=require('../dist/database');
 assert.equal(api.grantLegacyStarters(),0);assert.equal(total('200'),23);assert.equal(api.getPlayer('200').character_name,'Kairos');assert.equal(api.getPlayer('200').dp,1250);
});
test('a failure mid-delivery rolls back style, receipt and all inventory rows',()=>{
 api.createPlayer('300','Falha');api.db.exec("CREATE TRIGGER fail_grant BEFORE INSERT ON player_cards WHEN NEW.discord_id='300' AND NEW.card_key='48305365' BEGIN SELECT RAISE(ABORT,'simulated disk failure'); END");
 assert.throws(()=>api.chooseStarterDeck('300','warrior'));assert.equal(total('300'),0);assert.equal(api.getPlayer('300').starter_deck,null);assert.equal(api.db.prepare("SELECT 1 FROM starter_grants WHERE discord_id='300'").get(),undefined);
 api.db.exec('DROP TRIGGER fail_grant');assert.equal(api.chooseStarterDeck('300','warrior'),true);assert.equal(total('300'),20);
});
test('unselected/invalid choices never give cards',()=>{
 api.createPlayer('400','Sem escolha');assert.equal(api.grantStarterCards('400'),false);assert.equal(api.chooseStarterDeck('400','__proto__'),false);assert.equal(total('400'),0);
});
test('collection pagination, lookup and embeds validate against Discord limits',()=>{
 assert.ok(searchCards('guardiao').some(c=>c.englishName==='Celtic Guardian'));assert.equal(exactCard('celtic guardian').id,'91152256');
 assert.equal(searchCards('nada-inexistente').length,0);
 const inventory=api.getCollection('100');
 for(const page of [-5,1,2,999,NaN]){const p=collectionMessage('100',inventory,page);const embed=p.embeds[0].toJSON();assert.ok(embed.fields.length<=6);for(const row of p.components)row.toJSON();}
 assert.equal(collectionMessage('100',inventory,999).embeds[0].toJSON().footer.text.includes('2/2'),true);
 assert.equal(collectionMessage('400',[],1).components.length,1);
 for(const c of cards)cardMessage(c,2).embeds[0].toJSON();
});
test.after(()=>{api.db.close();fs.rmSync(temp,{recursive:true,force:true});});
