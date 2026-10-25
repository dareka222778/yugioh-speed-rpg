const {test}=require('node:test'),assert=require('node:assert/strict');const {helpMessage,helpPages}=require('../dist/commandUI'),{validateDiscordPayload}=require('../dist/discordPayload'),{cardRulesPT}=require('../dist/cardText');
test('all guide pages remain within Discord limits and provide concrete next steps without stale four-effect claims',()=>{
 for(const page of Object.keys(helpPages)){const p=helpMessage('101',page);validateDiscordPayload(p);const text=JSON.stringify(p.embeds[0].toJSON());assert.ok(!/quatro efeitos|Fase 2|V0.3/.test(text));assert.ok(p.components[0].toJSON().components[0].custom_id.endsWith(':101'));}assert.throws(()=>helpMessage('101','unknown'),/inválida/);
});
test('full descriptions remain available beside the image for long-effect and Normal cards',()=>{
 for(const id of ['07089711','86318356','77414722','91152256'])assert.ok(cardRulesPT(id).length>150);
});
