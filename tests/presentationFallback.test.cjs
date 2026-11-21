const {test}=require('node:test'),assert=require('node:assert/strict');
const {displayCardName,presentedCard}=require('../dist/cardPresentation'),registry=require('../dist/effectRegistry'),{definitionFingerprint}=require('../dist/cardRegistry'),{getMonsterDefinition}=require('../dist/monsterEffects'),{getEffectModel}=require('../dist/effectModels');
test('REA-D01: missing Portuguese name falls back without changing mechanical identity or certification',()=>{
 const card=registry.engineCard('91152256'),context={monster:getMonsterDefinition,model:getEffectModel},effect=registry.getEffect(card.id),fingerprint=definitionFingerprint(card,effect,context),missing={...card,name:'  '},shown=presentedCard(missing);
 assert.equal(shown.name,card.englishName);assert.equal(shown.id,card.id);assert.equal(missing.name,'  ');assert.equal(definitionFingerprint(shown,effect,context),fingerprint);assert.equal(displayCardName({...missing,englishName:null}),'Carta '+card.id);assert.equal(registry.getCardStatus(card.id).stage,'certified');
});
test('REA-D01: actual collection/search/inspector lookup uses the approved fallback and keeps admission unchanged',()=>{
 const collection=require('../dist/collection'),card=registry.engineCard('91152256'),original=card.name,enabled=[...registry.enabledCardIds];
 try{card.name='';assert.equal(collection.getCard(card.id).name,card.englishName);assert.ok(collection.searchCards(card.englishName).some(c=>c.id===card.id));assert.equal(collection.exactCard(card.englishName).id,card.id);assert.deepEqual(registry.enabledCardIds,enabled);assert.equal(registry.getDuelCard(card.id).name,card.englishName);}finally{card.name=original;}
});
