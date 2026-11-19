const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const {buildDeckInteractionId,parseDeckInteractionId,DECK_INTERACTION_ACTIONS}=require('../dist/deckInteractionId');

test('all supported Deck actions round-trip through the canonical Discord ID',()=>{
  for(const action of DECK_INTERACTION_ACTIONS){
    const id=buildDeckInteractionId(action,'m382-owner',2,17,0,'89631139');
    assert.ok(id.length<=100);
    assert.deepEqual(parseDeckInteractionId(id),{
      action,owner:'m382-owner',slot:2,revision:17,page:0,cardId:'89631139'
    });
  }
});

test('empty card selection and zero-based page remain valid for navigation controls',()=>{
  const id=buildDeckInteractionId('view','m382-owner',1,0,0,'');
  assert.deepEqual(parseDeckInteractionId(id),{
    action:'view',owner:'m382-owner',slot:1,revision:0,page:0,cardId:''
  });
});

test('rejects malformed, ambiguous, and unknown custom IDs',()=>{
  for(const value of [
    null,undefined,17,'','duel:view:m382-owner:1:0:1:',
    'deck:view:m382-owner:1:0:1',
    'deck:view:m382-owner:1:0:1::extra',
    'deck:unknown:m382-owner:1:0:1:',
    'deck:view::1:0:1:',
    'deck:view:m382-owner:01:0:1:',
    'deck:view:m382-owner:+1:0:1:',
    'deck:view:m382-owner:4:0:1:',
    'deck:view:m382-owner:1:-1:1:',
    'deck:view:m382-owner:1:9007199254740992:1:',
    'deck:view:m382-owner:1:0:-1:',
    'deck:view:m382-owner:1:0:1:89631139:tail',
    'x'.repeat(101)
  ]) assert.equal(parseDeckInteractionId(value),null,String(value));
});

test('builder rejects invalid owner, slot, revision, page, action, and card segment',()=>{
  const valid={action:'view',owner:'m382-owner',slot:1,revision:0,page:0,cardId:''};
  for(const patch of [
    {action:'unknown'},
    {owner:''},
    {owner:'owner:forged'},
    {slot:0},
    {slot:4},
    {slot:1.5},
    {revision:-1},
    {revision:Number.MAX_SAFE_INTEGER+1},
    {page:-1},
    {page:1.5},
    {cardId:'id:forged'}
  ]) assert.throws(()=>buildDeckInteractionId(
    patch.action??valid.action,patch.owner??valid.owner,patch.slot??valid.slot,
    patch.revision??valid.revision,patch.page??valid.page,patch.cardId??valid.cardId
  ));
});

test('builder rejects non-string owner and card values without throwing TypeError',()=>{
  assert.throws(()=>buildDeckInteractionId('view',undefined,1,0,0,''),/Identificador/);
  assert.throws(()=>buildDeckInteractionId('view','m382-owner',1,0,0,null),/Identificador/);
});

test('builder refuses Discord custom IDs longer than 100 characters',()=>{
  assert.throws(()=>buildDeckInteractionId('view','o'.repeat(64),1,Number.MAX_SAFE_INTEGER,0,'c'.repeat(20)),/100 caracteres/);
});

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'deck-id-m382-'));
process.env.DATABASE_PATH=path.join(temp,'game.sqlite');
const database=require('../dist/database');
const {deckMessage}=require('../dist/deckUI');
const owner='m382-ui-owner';
database.createPlayer(owner,'Deck ID UI test');
database.chooseStarterDeck(owner,'warrior');

test('every custom ID emitted by the real Deck editor payload passes the strict parser',()=>{
  const message=deckMessage(owner,1);
  const components=message.components.flatMap(row=>row.toJSON().components);
  assert.ok(components.length>=10);
  for(const component of components){
    assert.ok(component.custom_id);
    const parsed=parseDeckInteractionId(component.custom_id);
    assert.ok(parsed,component.custom_id);
    assert.equal(parsed.owner,owner);
    assert.equal(parsed.slot,1);
  }
});

after(()=>{
  database.db.close();
  fs.rmSync(temp,{recursive:true,force:true});
});
