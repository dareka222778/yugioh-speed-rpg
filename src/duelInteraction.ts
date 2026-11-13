import {MessageFlags} from 'discord.js';
import {getDuel,acceptChallenge,declineChallenge,performDuelAction,type DuelRecord} from './duelStore';
import {duelPublicMessage,duelZonesMessage,quitMessage,visualDuelPrivate,visualDuelCard as defaultCard,visualDuelZoneCard as defaultZone} from './duelUI';
import {validateDiscordPayload as checked} from './discordPayload';
export type DuelComponent={customId:string;guildId:string|null;user:{id:string};values?:string[];isButton():boolean;isStringSelectMenu():boolean;deferReply(options:any):Promise<any>;deferUpdate():Promise<any>;editReply(payload:any):Promise<any>;reply(payload:any):Promise<any>;followUp(payload:any):Promise<any>};
export type DuelDelivery={refreshArena:(r:DuelRecord)=>Promise<void>;onDefer?:(kind:'reply'|'update')=>void;privatePayload?:(r:DuelRecord,owner:string,page?:number)=>Promise<any>;cardPayload?:(r:DuelRecord,owner:string,index:number)=>Promise<any>;zonePayload?:(r:DuelRecord,owner:string,index:number)=>Promise<any>};
/** Same route used by live Discord and the isolated integration harness. */
export async function handleDuelComponent(i:DuelComponent,delivery:DuelDelivery){
 const id=i.user.id,refreshArena=delivery.refreshArena,privatePayload=delivery.privatePayload??visualDuelPrivate;
 const visualDuelCard=delivery.cardPayload??defaultCard,visualDuelZoneCard=delivery.zonePayload??defaultZone;
 const deferUpdate=async()=>{await i.deferUpdate();delivery.onDefer?.('update');},deferReply=async(p:any)=>{await i.deferReply(p);delivery.onDefer?.('reply');};
 const edit=(p:any)=>i.editReply(checked(p)),reply=(p:any)=>i.reply(checked(p)),follow=(p:any)=>i.followUp(checked(p));
      if(!i.guildId)throw new Error('Use os duelos dentro de um servidor.');
      const [,action,duelId,revisionText,pageText]=i.customId.split(':');let r=getDuel(duelId);
      if(r.guild_id!==i.guildId)throw new Error('Esse duelo pertence a outro servidor.');
      if(r.state?.phase==='finished'){await deferUpdate();await edit(duelPublicMessage(r));return;}
      if(action==='zones'&&i.isButton()){await deferReply({flags:MessageFlags.Ephemeral});await edit(duelZonesMessage(r,id));return;}
      const revision=Number(revisionText),page=Number(pageText??1);
      if(!Number.isSafeInteger(revision)||!Number.isSafeInteger(page))throw new Error('Painel inválido. Use /duelo ver.');
      if(action==='accept'&&i.isButton()){await deferUpdate();r=acceptChallenge(duelId,id,i.guildId,revision);await refreshArena(r);await follow({content:'Duelo iniciado! Clique em Abrir meu painel / mão no campo.',flags:MessageFlags.Ephemeral});return;}
      if(action==='decline'&&i.isButton()){await deferUpdate();r=declineChallenge(duelId,id,i.guildId);await refreshArena(r);return;}
      if(action==='public'&&i.isButton()){await deferUpdate();await refreshArena(r);return;}
      if(!r.state?.players.some(p=>p.id===id))throw new Error('Só participantes podem abrir o painel privado.');
      if(action==='open'&&i.isButton()){await deferReply({flags:MessageFlags.Ephemeral});await edit(await privatePayload(r,id));return;}
      if(action==='quit'&&i.isButton()){await reply({...quitMessage(r),flags:MessageFlags.Ephemeral});return;}
      if(action==='view'&&i.isButton()){await deferUpdate();await edit(await privatePayload(r,id,page));return;}
      if(action==='zoneback'&&i.isButton()){await deferUpdate();await edit(duelZonesMessage(r,id));return;}
      if(action==='zonecard'&&i.isStringSelectMenu()){
        if(r.revision!==revision)throw new Error('Esse painel ficou antigo. Abra as zonas novamente.');
        const index=Number(i.values![0]);
        await deferUpdate();await edit(await visualDuelZoneCard(r,id,index));return;
      }
      if(action==='card'&&(i.isButton()||i.isStringSelectMenu())){
        if(r.revision!==revision)throw new Error('Esse painel ficou antigo. Clique em Atualizar.');
        const cardIndex=i.isStringSelectMenu()?Number(i.values![0]):page;
        if(!Number.isSafeInteger(cardIndex)||cardIndex<0)throw new Error('Carta inválida.');
        await deferUpdate();await edit(await visualDuelCard(r,id,cardIndex));return;
      }
      if(action==='quick'&&i.isButton()){
        await deferUpdate();r=performDuelAction(duelId,id,i.guildId,revision,page);try{await edit(await privatePayload(r,id));}finally{await refreshArena(r);}return;
      }
      if(action==='act'&&i.isStringSelectMenu()){
        await deferUpdate();const index=Number(i.values![0]);if(!Number.isSafeInteger(index)||index<0)throw new Error('Ação inválida.');
        r=performDuelAction(duelId,id,i.guildId,revision,index);try{await edit(await privatePayload(r,id,page));}finally{await refreshArena(r);}return;
      }
      if(action==='confirm'&&i.isButton()){await deferUpdate();r=performDuelAction(duelId,id,i.guildId,revision,{kind:'concede'});await edit({content:'Desistência registrada.',components:[]});await refreshArena(r);return;}
      throw new Error('Ação desconhecida. Use /duelo ver.');

}
