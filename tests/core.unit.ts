import 'fake-indexeddb/auto';
import {afterEach,describe,expect,it} from 'vitest';
import Dexie from 'dexie';
import {database,db,defaults,scoped} from '../src/lib/database/db';
import {addCharacter,comment,conversation,createWorld,follow,message,post,react} from '../src/lib/database/social';
import {collect,parseCard,restore,validateBackup} from '../src/lib/database/files';
import {experience,memory} from '../src/lib/simulation/memory';
import {catchup,deterministic,parseAction,SimulationEngine} from '../src/lib/simulation/engine';
import {GenerationQueue} from '../src/lib/ai/queue';
import type {ModelProvider,Turn} from '../src/lib/ai/provider';

afterEach(async()=>{await db.open();await db.transaction("rw",db.tables,async()=>{for(const table of db.tables) await table.clear();});});
async function scene() {
  const {world,persona}=await createWorld('Город','Мир с метро');
  const actor=await addCharacter(world.id,{name:'Кира',handle:'kira',details:{speech:'деловая',initialMemory:'Метро закрывается в полночь'}});
  return {world,persona,actor};
}
describe('Социальные данные',()=>{
  it('изолирует вселенные и проверяет принадлежность взаимодействий',async()=>{
    const {world,persona,actor}=await scene();
    const {world:other,persona:visitor}=await createWorld('Другой','');
    const item=await post(world.id,actor.id,'Тест');
    await expect(comment(other.id,visitor.id,item.id,'Отсюда')).rejects.toThrow();
    await expect(follow(world.id,persona.id,visitor.id)).rejects.toThrow();
    expect(await scoped('posts',other.id).count()).toBe(0);
  });
  it('сохраняет комментарии, подписки, реакции и уведомления',async()=>{
    const {world,persona,actor}=await scene();
    const item=await post(world.id,actor.id,'Привет');
    const first=await comment(world.id,persona.id,item.id,'Как дела?');
    await comment(world.id,actor.id,item.id,'Хорошо',first.id);
    await follow(world.id,persona.id,actor.id);
    await react(world.id,persona.id,item.id,'like');
    expect(await db.notifications.count()).toBe(4);
    expect(await db.comments.where('post').equals(item.id).count()).toBe(2);
    await react(world.id,persona.id,item.id,'like');
    expect(await db.reactions.count()).toBe(0);
  });
  it('приватная переписка требует членства',async()=>{
    const {world,persona,actor}=await scene();
    const outsider=await addCharacter(world.id,{name:'Рай',handle:'rai',details:{}});
    const chat=await conversation(world.id,[actor.id,persona.id]);
    const item=await message(world.id,chat.id,persona.id,'Встреча в метро');
    await expect(message(world.id,chat.id,outsider.id,'Подслушано')).rejects.toThrow();
    expect(await db.messages.get(item.id)).toMatchObject({text:'Встреча в метро'});
    expect((await conversation(world.id,[persona.id,actor.id])).id).toBe(chat.id);
  });
  it('ищет личные воспоминания и направленно изменяет отношения',async()=>{
    const {world,persona,actor}=await scene();
    const stranger=await addCharacter(world.id,{name:'Рай',handle:'rai',details:{}});
    await experience(world.id,actor.id,persona.id,'src','Спасибо за метро',true);
    const items=await memory.search(world.id,actor.id,'метро',[persona.id]);
    expect(items.some(item=>item.text==='Спасибо за метро')).toBe(true);
    expect(await memory.search(world.id,stranger.id,'метро',[])).toEqual([]);
    expect((await db.relationships.get(actor.id+'>'+persona.id))?.values.trust).toBeGreaterThan(0);
    expect(await db.relationships.get(persona.id+'>'+actor.id)).toBeUndefined();
  });
  it('экспортирует и импортирует копию с новым пространством идентификаторов',async()=>{
    const {world,persona,actor}=await scene();
    await experience(world.id,actor.id,persona.id,'src','Спасибо',true);
    const source=await post(world.id,actor.id,'Запись');
    const input=validateBackup(JSON.parse(JSON.stringify(await collect(world.id))));
    const id=await restore(input,[],' — ветка');
    const [copy]=await scoped('posts',id).toArray();
    expect(copy.text).toBe(source.text);
    expect(copy.author).not.toBe(source.author);
    expect(await db.characters.get(copy.author)).toMatchObject({universeId:id});
    expect(await db.character_states.get(copy.author)).toMatchObject({owner:copy.author});
    expect(await db.universes.count()).toBe(2);
  });
  it('читает V2 и отклоняет повреждённую карточку и чужую версию архива',()=>{
    expect(parseCard({spec:'chara_card_v2',data:{name:'Луна',personality:'Внимательная'}})).toMatchObject({handle:'луна',details:{personality:'Внимательная'}});
    expect(()=>parseCard({spec:'chara_card_v2',data:{name:12}})).toThrow();
    expect(()=>validateBackup({format:'rai-social',version:2,data:{}})).toThrow();
  });
  it('мигрирует существующие настройки',async()=>{
    const v1=new Dexie('rai-v1-unit');
    v1.version(1).stores({settings:'id'});
    await v1.table('settings').add({id:'preferences',theme:'light'});
    v1.close();
    const v2=database('rai-v1-unit');
    expect(await v2.settings.get('preferences')).toMatchObject({theme:'light',memoryLimit:5});
    await v2.delete();
  });
});
describe('Инференс и симуляция',()=>{
  it('проверяет структуру, границы и тип действия',()=>{
    expect(parseAction('{"type":"COMMENT","text":"да"}','COMMENT','p')).toMatchObject({text:'да'});
    expect(()=>parseAction('{"type":"SEND_DM","target":"x","text":"да"}','COMMENT','p')).toThrow();
    expect(()=>parseAction('{"type":"COMMENT","text":"да","code":"x"}','COMMENT')).toThrow();
    expect(catchup(1000,9999999,3)).toBe(3);
    expect(catchup(1000,5000,3)).toBe(0);
    expect(deterministic(328)).toBe(deterministic(328));
  });
  it('исполняет валидную модельную реплику, не дублирует её и исключает чужую память',async()=>{
    const {world,persona,actor}=await scene();
    const entry=await post(world.id,persona.id,'Поедем на метро?');
    await experience(world.id,actor.id,persona.id,'secret-dm','PRIVATE_TEXT_756',true);
    let received:Turn[]=[];
    const model:ModelProvider={generate:async turns=>{received=turns;return {text:'{"type":"COMMENT","text":"Встретимся у входа."}',speed:12};},dispose:async()=>{}};
    const engine=new SimulationEngine(()=>model);
    await engine.run(world,actor,'COMMENT',entry.id,defaults);
    await engine.run(world,actor,'COMMENT',entry.id,defaults);
    expect(await db.comments.count()).toBe(1);
    expect(received[1].content).toContain('Поедем на метро?');
    expect(received[1].content).not.toContain('PRIVATE_TEXT_756');
  });
  it('соблюдает приоритет, отменяет задачи и продолжает после отказа',async()=>{
    const queue=new GenerationQueue();
    let release:()=>void=()=>{};
    const ordered:number[]=[];
    const a=queue.enqueue(1,async()=>await new Promise<void>(resolve=>release=resolve));
    const b=queue.enqueue(1,async()=>{ordered.push(1);throw new Error('broken');});
    const c=queue.enqueue(9,async()=>{ordered.push(9);});
    release();
    await a;
    await expect(b).rejects.toThrow('broken');
    await c;
    expect(ordered).toEqual([9,1]);
    const running=queue.enqueue(5,signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));
    const waiting=queue.enqueue(4,async()=>42);
    queue.cancel();
    await expect(running).rejects.toMatchObject({name:'AbortError'});
    await expect(waiting).rejects.toMatchObject({name:'AbortError'});
    await expect(queue.enqueue(1,async()=>7)).resolves.toBe(7);
  });
});

it('drafts an alternative without changing the stored reply or leaking it to the prompt',async()=>{
  const {world,persona,actor}=await scene();
  const chat=await conversation(world.id,[persona.id,actor.id]);
  await message(world.id,chat.id,persona.id,'Встретимся на станции?');
  const original=await message(world.id,chat.id,actor.id,'ORIGINAL_REPLY_HEY');
  await experience(world.id,actor.id,persona.id,original.id,original.text,true,true);
  let request:Turn[]=[];
  const engine=new SimulationEngine(()=>({
    generate:async turns=>{request=turns;return {text:'{"type":"SEND_DM","text":"Давай у входа."}',speed:1};},
    dispose:async()=>{}
  }));
  await expect(engine.alternative(world,actor,chat.id,original.id,defaults)).resolves.toBe('Давай у входа.');
  expect(request.map(item=>item.content).join('')).not.toContain('ORIGINAL_REPLY_HEY');
  expect((await db.messages.get(original.id))?.text).toBe('ORIGINAL_REPLY_HEY');
});
