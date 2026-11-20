import {db,row,scoped} from './db';
import {actorSchema, worldSchema, type Actor, type Records} from './schema';
export async function createWorld(name:string,description:string,demo=false) {
  const meta = row('');
  const world = worldSchema.parse({...meta, universeId:meta.id,name:name.trim(),description,clock:Date.now(),demo,details:{genre:demo?'Киберпанк':''}});
  const persona = actorSchema.parse({...row(world.id),name:'Алекс Морган',handle:'alex.morgan',portrait:'amber',details:{bio:'Наблюдаю за городом и записываю то, что замечаю.'}});
  await db.transaction('rw', db.universes,db.user_personas, async ()=>{
    await db.universes.add(world);
    await db.user_personas.add(persona);
  });
  return {world,persona};
}
export async function addCharacter(universeId:string, patch:Partial<Actor>) {
  const character = actorSchema.parse({...row(universeId),...patch});
  if (!await db.universes.get(universeId)) throw Error('Вселенная не найдена');
  if (character.universeId !== universeId) throw Error('Неверная вселенная');
  await db.transaction('rw',db.characters,db.memories,async ()=>{
    if ((await scoped('characters',universeId).toArray()).some(actor=>actor.handle===character.handle && actor.id!==character.id)) throw Error('Имя пользователя занято');
    await db.characters.put(character);
    const initial = character.details.initialMemory;
    if (initial && !await db.memories.get('initial-'+character.id)) {
      await db.memories.add({...row(universeId),id:'initial-'+character.id,owner:character.id,source:character.id,participants:[character.id],kind:'semantic',text:initial,importance:0.8,valence:0,confidence:1,privacy:'private',related:[],pinned:true});
    }
  });
  return character;
}
export async function actorIn(world:string,id:string) {
  const candidate = await db.characters.get(id) ?? await db.user_personas.get(id);
  if (!candidate || candidate.universeId!==world) throw Error('Участник не найден');
  return candidate;
}
export async function post(world:string,author:string,text:string,media:string[]=[],quote?:string) {
  await actorIn(world,author);
  if ((!text.trim() && !media.length && !quote) || text.length>4000) throw Error('Добавьте текст или изображение');
  if (quote && (await db.posts.get(quote))?.universeId!==world) throw Error('Пост не найден');
  await validateMedia(world,media);
  const entry = {...row(world),author,text:text.trim(),media:[...media],quote};
  await db.transaction('rw',db.posts,db.notifications,db.characters,db.user_personas,async()=>{
    await db.posts.add(entry);
    const targets = [...await scoped('characters',world).toArray(),...await scoped('user_personas',world).toArray()];
    const mentions = new Set(Array.from(text.matchAll(/@([\p{L}\d_.]+)/gu),match=>match[1].toLowerCase()));
    for(const target of targets) if(mentions.has(target.handle.toLowerCase())) await notify(world,author,target.id,entry.id,'mention');
  });
  return entry;
}
async function validateMedia(world:string,media:string[]) {
  if (media.length>4 || (await db.media_assets.bulkGet(media)).some(item=>item?.universeId!==world)) throw Error('Неверное вложение');
}
export async function notify(world:string,actor:string,recipient:string,target:string,kind:Records['notifications']['kind']) {
  if (actor!==recipient) await db.notifications.add({...row(world),actor,recipient,target,kind,read:false});
}
export async function comment(world:string,author:string,postId:string,text:string,parent?:string) {
  await actorIn(world,author);
  const parentComment = parent ? await db.comments.get(parent) : undefined;
  const target = await db.posts.get(postId);
  if (target?.universeId!==world || (parent && parentComment?.post!==postId) || !text.trim() || text.length>4000) throw Error('Неверный комментарий');
  const entry = {...row(world),author,text:text.trim(),post:postId,parent};
  await db.transaction('rw',db.comments,db.notifications,async ()=>{
    await db.comments.add(entry);
    await notify(world,author,parentComment?.author ?? target.author,postId,parent?'reply':'comment');
  });
  return entry;
}
export async function react(world:string,actor:string,target:string,kind:Records['reactions']['kind']) {
  await actorIn(world,actor);
  const entry = await db.posts.get(target) ?? await db.messages.get(target);
  if(entry?.universeId!==world) throw Error('Публикация не найдена');
  if ('conversation' in entry && !await isMember(entry.conversation, actor)) throw Error('Нет доступа');
  await db.transaction('rw',db.reactions,db.notifications,async ()=>{
    const existing=await db.reactions.where('[actor+target+kind]').equals([actor,target,kind]).first();
    if (existing) {await db.reactions.delete(existing.id); return;}
    await db.reactions.add({...row(world),actor,target,kind});
    if (kind==='like'||kind==='repost') await notify(world,actor,entry.author,target,kind);
  });
}
export async function follow(world:string,from:string,to:string,desired?:boolean) {
  if(from===to) return;
  await Promise.all([actorIn(world,from),actorIn(world,to)]);
  await db.transaction('rw',db.follows,db.notifications,async ()=>{
    const existing=await db.follows.where('[from+to]').equals([from,to]).first();
    if(existing && desired!==true) await db.follows.delete(existing.id);
    if(!existing && desired!==false) {
      await db.follows.add({...row(world),from,to});
      await notify(world,from,to,to,'follow');
    }
  });
}
export async function conversation(world:string,participants:string[],title='') {
  const members = [...new Set(participants)];
  if(members.length<2 || members.length>10) throw Error('Нужно от 2 до 10 участников');
  await Promise.all(members.map(actor=>actorIn(world,actor)));
  return db.transaction('rw',db.conversations,db.conversation_members,async ()=>{
    const group = members.length>2;
    if(!group) {
      for(const membership of await db.conversation_members.where('actor').equals(members[0]).toArray()) {
        const chat=await db.conversations.get(membership.conversation);
        if(chat?.universeId===world && !chat.group && await isMember(chat.id,members[1])) return chat;
      }
    }
    const chat={...row(world),title:title.trim(),group,read:0,pinned:false};
    await db.conversations.add(chat);
    await db.conversation_members.bulkAdd(members.map(actor=>({...row(world),conversation:chat.id,actor})));
    return chat;
  });
}
export async function isMember(chat:string,actor:string) {
  return !!await db.conversation_members.where('conversation').equals(chat).filter(member=>member.actor===actor).first();
}
export async function message(world:string,chat:string,author:string,text:string,media:string[]=[],reply?:string) {
  const target=await db.conversations.get(chat);
  if(target?.universeId!==world || !await isMember(chat,author) || (!text.trim()&&!media.length) || text.length>8000) throw Error('Неверное сообщение');
  if(reply && (await db.messages.get(reply))?.conversation!==chat) throw Error('Сообщение не найдено');
  await validateMedia(world,media);
  const entry={...row(world),conversation:chat,author,text:text.trim(),media:[...media],reply};
  await db.transaction('rw',db.messages,db.conversation_members,db.notifications,db.conversations, async ()=>{
    await db.messages.add(entry);
    await db.conversations.update(chat,{at:entry.at});
    const members=await db.conversation_members.where('conversation').equals(chat).toArray();
    for(const member of members) await notify(world,author,member.actor,chat,'message');
  });
  return entry;
}
export async function removePost(world:string,actor:string,id:string) {
  const entry=await db.posts.get(id);
  if(entry?.universeId!==world || entry.author!==actor) throw Error('Нет доступа');
  await db.transaction('rw',db.posts,db.comments,db.reactions,db.notifications,async()=>{
    await db.posts.delete(id);
    await db.comments.where('post').equals(id).delete();
    await db.reactions.where('target').equals(id).delete();
    await db.notifications.where('target').equals(id).delete();
    await scoped('posts',world).filter(item=>item.quote===id).modify(item=>{delete item.quote;});
  });
}
