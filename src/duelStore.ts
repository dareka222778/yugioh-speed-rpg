import {randomBytes,randomInt} from 'node:crypto';
import {db,getPlayer} from './database';
import {openDeck} from './decks';
import {starterContents} from './cardCatalog';
import {createDuel,step,legalActions,validateDuelCards,atk,def,type Action,type DuelState} from './duelEngine';
import {getCard} from './collection';
export type DuelRecord={id:string;guild_id:string;channel_id:string;message_id:string|null;status:string;revision:number;updated:number;state:DuelState|null;invite:{owner:string;opponent:string;name:string;cards:string[]}|null};
db.exec(`CREATE TABLE IF NOT EXISTS duels (id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,message_id TEXT,status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL,state TEXT,invite TEXT);
 CREATE TABLE IF NOT EXISTS duel_members (owner TEXT PRIMARY KEY,duel_id TEXT NOT NULL REFERENCES duels(id) ON DELETE CASCADE);`);
function read(id:string):DuelRecord|undefined {const row=db.prepare('SELECT * FROM duels WHERE id=?').get(id) as any;if(!row)return;return {...row,state:row.state?JSON.parse(row.state):null,invite:row.invite?JSON.parse(row.invite):null};}
function save(record:DuelRecord){db.prepare('UPDATE duels SET status=?,revision=?,updated=?,state=?,invite=? WHERE id=?').run(record.status,record.revision,record.updated,record.state?JSON.stringify(record.state):null,record.invite?JSON.stringify(record.invite):null,record.id);if(!['pending','playing'].includes(record.status))db.prepare('DELETE FROM duel_members WHERE duel_id=?').run(record.id);}
export const getDuel=db.transaction((id:string):DuelRecord=>{
 const record=read(id);if(!record)throw new Error('Duelo não encontrado.');
 const limit=record.status==='pending'?120_000:1_800_000;
 if(['pending','playing'].includes(record.status)&&Date.now()-record.updated>limit){record.status='expired';record.revision++;if(record.state){record.state.phase='finished';record.state.reason='tempo de inatividade (30 minutos)';record.state.winner=null;}save(record);}
 return record;
});
export function currentDuel(owner:string){const row=db.prepare('SELECT duel_id FROM duel_members WHERE owner=?').get(owner) as {duel_id:string}|undefined;if(!row)return;const duel=getDuel(row.duel_id);return ['pending','playing'].includes(duel.status)?duel:undefined;}
function available(owner:string){if(currentDuel(owner))throw new Error('Esse duelista já tem um duelo ou convite aberto. Use /duelo ver ou /duelo sair.');}
function activeCards(owner:string){const row=db.prepare('SELECT slot FROM decks WHERE discord_id=? AND active=1').get(owner) as {slot:number}|undefined;if(!row)throw new Error('Ative um deck válido primeiro com /deck ativar.');const deck=openDeck(owner,row.slot);if(!deck.active||deck.errors.length)throw new Error('O deck ativo ficou inválido. Confira /deck ver.');const cards=deck.items.flatMap(c=>Array(c.quantity).fill(c.card_key)) as string[];validateDuelCards(cards);return cards;}
function name(owner:string){const p=getPlayer(owner);if(!p)throw new Error('Crie seu duelista com /start.');return p.character_name||p.username;}
function insert(r:DuelRecord,owners:string[]){db.prepare('INSERT INTO duels VALUES(?,?,?,?,?,?,?,?,?)').run(r.id,r.guild_id,r.channel_id,r.message_id,r.status,r.revision,r.updated,r.state?JSON.stringify(r.state):null,r.invite?JSON.stringify(r.invite):null);const put=db.prepare('INSERT INTO duel_members VALUES(?,?)');for(const owner of owners)put.run(owner,r.id);}
export const challenge=db.transaction((owner:string,opponent:string,guild:string,channel:string):DuelRecord=>{
 if(owner===opponent)throw new Error('Escolha outro jogador ou use /duelo treino.');available(owner);available(opponent);const cards=activeCards(owner);
 const r:DuelRecord={id:randomBytes(8).toString('hex'),guild_id:guild,channel_id:channel,message_id:null,status:'pending',revision:0,updated:Date.now(),state:null,invite:{owner,opponent,name:name(owner),cards}};insert(r,[owner]);return r;
});
export const acceptChallenge=db.transaction((id:string,actor:string,guild:string,expected:number):DuelRecord=>{
 const r=getDuel(id);if(r.guild_id!==guild||r.status!=='pending'||r.revision!==expected)throw new Error('O convite expirou ou já foi respondido.');if(r.invite!.opponent!==actor)throw new Error('Só o jogador convidado pode aceitar.');available(actor);
 const invite=r.invite!;r.state=createDuel([{id:invite.owner,name:invite.name,cards:invite.cards},{id:actor,name:name(actor),cards:activeCards(actor)}],Math.random,randomInt(2));
 db.prepare('INSERT INTO duel_members VALUES(?,?)').run(actor,id);r.invite=null;r.status='playing';r.revision++;r.updated=Date.now();save(r);return r;
});
export const declineChallenge=db.transaction((id:string,actor:string,guild:string):DuelRecord=>{const r=getDuel(id);if(r.guild_id!==guild||r.status!=='pending'||![r.invite!.owner,r.invite!.opponent].includes(actor))throw new Error('Não é possível cancelar esse convite.');r.status='declined';r.revision++;r.updated=Date.now();save(r);return r;});
export function chooseNPC(s:DuelState,id:string):Action|undefined {
 const actions=legalActions(s,id);const p=s.players.find(p=>p.id===id)!;const op=s.players.find(p=>p.id!==id)!;
 const beneficial=actions.filter(a=>a.kind==='trap'&&p.monsters.some(m=>m.uid===a.target&&m.faceUp));
 if(beneficial.length)return beneficial[0];if(s.phase==='response')return actions.find(a=>a.kind==='pass');
 if(s.phase==='discard')return [...actions].sort((a,b)=>{const score=(x:Action)=>x.kind==='discard'?(getCard(p.hand.find(c=>c.uid===x.card)!.id)!.atk??0):0;return score(a)-score(b);})[0];
 if(s.phase==='choice')return actions[0];
 const spells=actions.filter(a=>a.kind==='spell');if(spells.length)return spells[0];
 const summon=actions.filter((a):a is Extract<Action,{kind:'summon'}>=>a.kind==='summon'&&a.position==='atk').sort((a,b)=>getCard(p.hand.find(c=>c.uid===b.card)!.id)!.atk!-getCard(p.hand.find(c=>c.uid===a.card)!.id)!.atk!);
 if(summon.length)return summon[0];const set=actions.find(a=>a.kind==='set');if(set)return set;
 const position=actions.find(a=>a.kind==='position'&&a.mode!=='def');if(position)return position;
 const attacks=actions.filter((a):a is Extract<Action,{kind:'attack'}>=>a.kind==='attack').filter(a=>{if(!a.target)return true;const m=p.monsters.find(m=>m.uid===a.card)!;const target=op.monsters.find(m=>m.uid===a.target)!;return !target.faceUp||atk(m)>=(target.position==='atk'?atk(target):def(target));});if(attacks.length)return attacks[0];
 return actions.find(a=>a.kind==='battle')??actions.find(a=>a.kind==='end');
}
function driveNPC(s:DuelState){let steps=0;while(s.phase!=='finished'){const npc=s.players.find(p=>p.id.startsWith('npc-'));if(!npc)return s;const a=chooseNPC(s,npc.id);if(!a)return s;if(++steps>100)throw new Error('Limite de ações do treino excedido.');s=step(s,npc.id,a);}return s;}
export const createTraining=db.transaction((owner:string,guild:string,channel:string):DuelRecord=>{
 available(owner);const id=randomBytes(8).toString('hex');const cards=activeCards(owner);const style=['warrior','spellcaster','dragon'][randomInt(3)];const opponent=starterContents[style].flatMap(c=>Array(c.quantity).fill(c.id));
 const state=driveNPC(createDuel([{id:owner,name:name(owner),cards},{id:`npc-${id}`,name:'Duelista de treino',cards:opponent}],Math.random,randomInt(2)));
 const r:DuelRecord={id,guild_id:guild,channel_id:channel,message_id:null,status:'playing',revision:0,updated:Date.now(),state,invite:null};insert(r,[owner]);return r;
});
export const performDuelAction=db.transaction((id:string,owner:string,guild:string,expected:number,index:number|Action):DuelRecord=>{
 const r=getDuel(id);if(r.guild_id!==guild||r.status!=='playing'||!r.state)throw new Error('Esse duelo não está ativo neste servidor.');if(r.revision!==expected)throw new Error('Esse painel ficou antigo. Clique em Atualizar.');
 const actions=legalActions(r.state,owner);const action=typeof index==='number'?actions[index]:index;
 if(!action||(typeof index!=='number'&&action.kind!=='concede'))throw new Error('Ação inválida.');
 r.state=driveNPC(step(r.state,owner,action));r.revision++;r.updated=Date.now();if(r.state.phase==='finished')r.status='finished';save(r);return r;
});
export function setDuelMessage(id:string,channel:string,message:string){db.prepare('UPDATE duels SET channel_id=?,message_id=? WHERE id=?').run(channel,message,id);}
