const {test}=require('node:test');
const assert=require('node:assert/strict');
const {archetypeCard,rulesCardName}=require('../dist/cardIdentity');
test('Lesser Fiend is an Archfiend card without replacing its printed name',()=>{
 const card={englishName:'Lesser Fiend',archetypes:['Archfiend']};
 assert.equal(archetypeCard(card,'Archfiend'),true);
 assert.equal(rulesCardName(card),'Lesser Fiend');
});
