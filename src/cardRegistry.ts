import {createHash} from 'node:crypto';
import type {Card} from './cardCatalog';
import type {Effect} from './effectDefinitions';
import {effectDefinitionIssues} from './effectDefinitions';
import {monsterDefinitionIssues} from './monsterEffects';
import type {MonsterDefinition} from './monsterEffects';
import type {SpellTrapModel} from './effectModels';
export type CardCertificate={fingerprint:string;suites:readonly string[]};
export type CardStatus={stage:'registered'|'validated'|'certified';issues:string[]};
export type DefinitionContext={monster?:(id:string)=>MonsterDefinition|undefined;model?:(kind:Effect['kind'])=>SpellTrapModel|undefined};
function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
export function definitionFingerprint(c:Card,e:Effect,context:DefinitionContext):string{
 const mechanical={id:c.id,kind:c.kind,monsterType:c.monsterType,level:c.level,atk:c.atk,defense:c.defense,race:c.race,attribute:c.attribute,field:c.field,fusion:c.fusion,alwaysTreatedAs:c.alwaysTreatedAs,archetypes:c.archetypes};
 return createHash('sha256').update(canonical({card:mechanical,effect:e,monster:context.monster?.(c.id),model:context.model?.(e.kind)})).digest('hex');
}
const trapKinds=new Set<Effect['kind']>(['reinforcements','castleWalls','waboku','trapHole','justDesserts','magicJammer','sevenTools','torrentialTribute','bottomlessTrapHole','sakuretsuArmor','mirrorForce']);
export function buildCardRegistry(catalog:readonly Card[],definitions:Readonly<Record<string,Effect>>,certificates:Readonly<Record<string,CardCertificate>>,context:DefinitionContext={}){
 const metadata=new Map<string,Card>(),effects=new Map<string,Effect>(),statuses=new Map<string,CardStatus>();
 for(const c of catalog){
  if(metadata.has(c.id))throw new Error(`Catálogo com identificador duplicado: ${c.id}`);
  metadata.set(c.id,c);const issues:string[]=[];
  let effect=definitions[c.id];
  // Structured category only: a translated summary can never grant capabilities.
  if(!effect&&c.monsterType==='normal')effect={kind:'normal'};
  if(!effect&&c.monsterType==='fusion'&&c.fusion)effect={kind:'fusion'};
  if(!['monster','spell','trap'].includes(c.kind))issues.push('invalid-card-kind');
  if(!/^\d{8}$/.test(c.id))issues.push('invalid-id');
  if(c.kind==='monster'){
   if(!['normal','effect','fusion','ritual'].includes(c.monsterType??''))issues.push('missing-monster-category');
   if(!Number.isSafeInteger(c.level)||c.level!<1||c.level!>12||!Number.isSafeInteger(c.atk)||c.atk!<0||!Number.isSafeInteger(c.defense)||c.defense!<0||!c.race||!c.attribute)issues.push('invalid-monster-stats');
   if(c.monsterType==='fusion'&&!c.fusion?.length||c.monsterType!=='fusion'&&c.fusion)issues.push('invalid-fusion-category');
  }
  if(!effect)issues.push('missing-definition');else issues.push(...effectDefinitionIssues(effect));
  if(effect?.kind==='continuous'){const a=effect.activation;if(!a||a.damage!=='never'||(c.kind==='trap'?(a.speed!==2||a.window!=='free'):(c.kind!=='spell'||a.speed!==1||a.window!=='main')))issues.push('unsupported-continuous-activation');}
  else if(effect?.kind==='conditionalDestruction'){
   const a=effect.activation;
   if(a.damage!=='never'||c.kind==='spell'&&(a.speed!==1||a.window!=='main')||c.kind==='trap'&&(a.speed!==2||a.window!=='free')||c.kind==='monster')issues.push('unsupported-conditional-activation');
  }
  else if(effect?.kind==='searchZone'&&c.kind!=='spell')issues.push('invalid-search-spell-category');
  else if(effect?.kind==='moveSelected'||effect?.kind==='positionChange'||effect?.kind==='sequence'||effect?.kind==='choiceSequence'||effect?.kind==='attackResponse'){
   const a=effect.activation;
   if(!a||a.damage!=='never'||['moveSelected','positionChange','sequence','choiceSequence'].includes(effect.kind)&&(c.kind==='spell'&&!(a.speed===1&&a.window==='main'||a.speed===2&&a.window==='free')||c.kind==='trap'&&(a.speed!==2||a.window!=='free'))||effect.kind==='attackResponse'&&(c.kind!=='trap'||![2,3].includes(a.speed)||a.window!=='attackDeclared'||a.opponentOnly!==true))issues.push('unsupported-activation-policy');
  }else if(effect&&(c.kind==='spell'&&trapKinds.has(effect.kind)||c.kind==='trap'&&!trapKinds.has(effect.kind)))issues.push('incompatible-spell-trap-kind');
  if(effect&&(effect.kind==='field')!==!!c.field)issues.push('incompatible-field-category');
  if(effect&&c.kind==='monster'&&!['normal','fusion','monsterEffect','ritualMonster'].includes(effect.kind))issues.push('invalid-monster-effect-category');
  if(effect&&c.kind!=='monster'&&['normal','fusion','monsterEffect','ritualMonster'].includes(effect.kind))issues.push('invalid-spell-trap-category');
  if(effect?.kind==='ritualMonster'&&(c.kind!=='monster'||c.monsterType!=='ritual'))issues.push('invalid-ritual-monster');
  if(effect?.kind==='ritualSummon'&&c.kind!=='spell')issues.push('invalid-ritual-spell');
  if(effect?.kind==='normal'&&(c.kind!=='monster'||c.monsterType!=='normal'))issues.push('invalid-normal-definition');
  if(effect?.kind==='monsterEffect'){if(c.monsterType!=='effect'&&!(c.monsterType==='fusion'&&c.fusion?.length))issues.push('invalid-effect-monster-category');issues.push(...monsterDefinitionIssues(context.monster?.(c.id)));if(context.monster?.(c.id)?.effect.operation.kind==='identityOnly'&&!c.alwaysTreatedAs)issues.push('missing-rule-identity');}
  if(effect?.kind==='fusion'&&(c.monsterType!=='fusion'||!c.fusion))issues.push('invalid-fusion-definition');
  const certificate=certificates[c.id];
  let stage:CardStatus['stage']=issues.length?'registered':'validated';
  if(certificate){
   if(issues.length||!effect||!certificate.suites.length||certificate.suites.some(p=>!/^tests\/[A-Za-z0-9_-]+\.test\.cjs$/.test(p))||certificate.fingerprint!==definitionFingerprint(c,effect,context))throw new Error(`Certificação inválida ou desatualizada: ${c.id}`);
   stage='certified';
  }
  if(effect)effects.set(c.id,effect);statuses.set(c.id,{stage,issues});
 }
 for(const id of Object.keys(certificates))if(!metadata.has(id))throw new Error(`Certificação sem metadados: ${id}`);
 const enabled=Object.freeze([...metadata.keys()].filter(id=>statuses.get(id)?.stage==='certified'));
 return {metadata,effects,statuses,enabled};
}
