import {strFromU8,strToU8,unzipSync,zipSync} from 'fflate';
import {z} from 'zod';
import {db,row,scoped} from './db';
import {actorSchema,schemas,type Actor,type Records,type TableName} from './schema';

const maxFile=60*1024*1024;
const tables=Object.keys(schemas).filter(key=>key!=='model_registry'&&key!=='media_assets'&&key!=='checkpoints') as Exclude<TableName,'model_registry'|'media_assets'|'checkpoints'>[];
type Backup = {format:'rai-social';version:1;data:Partial<{[K in typeof tables[number]]:Records[K][]}>};
export async function collect(world?:string):Promise<Backup> {
  const data:Backup['data']={};
  await db.transaction('r',tables.map(key=>db.table(key)),async()=>{
    for(const key of tables) Object.assign(data,{[key]:world ? key==='universes' ? await db.universes.where('id').equals(world).toArray() : await scoped(key,world).toArray() : await db.table(key).toArray()});
  });
  return {format:'rai-social',version:1,data};
}
export function saveFile(name:string,content:BlobPart,mime='application/json') {
  const url=URL.createObjectURL(new Blob([content],{type:mime}));
  const link=document.createElement('a');
  link.href=url;
  link.download=name;
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export async function archive(world?:string) {
  const content=await collect(world);
  const assets=world?await scoped('media_assets',world).toArray():await db.media_assets.toArray();
  if(!assets.length) {saveFile('rai-social.json',JSON.stringify(content,null,2)); return;}
  if(assets.reduce((n,item)=>n+item.blob.size,0)>maxFile-5*1024*1024) throw Error('Медиатека превышает лимит одного архива. Экспортируйте отдельные вселенные.');
  const files:Record<string,Uint8Array>={'backup.json':strToU8(JSON.stringify(content)),'media.json':strToU8(JSON.stringify(assets.map(({blob,...data})=>data)))};
  for(const item of assets) files['media/'+item.id]=new Uint8Array(await item.blob.arrayBuffer());
  saveFile('rai-social.zip',Uint8Array.from(zipSync(files,{level:0})),'application/zip');
}
const envelope=z.object({format:z.literal('rai-social'),version:z.literal(1),data:z.record(z.string(),z.array(z.unknown()).max(50000))});
const mime=z.enum(['image/jpeg','image/png','image/webp']);
const mediaMeta=z.object({id:z.string().regex(/^[\w-]+$/),universeId:z.string(),at:z.number(),mime});
const links=['universeId','owner','source','from','to','author','post','parent','actor','target','conversation','recipient','avatar','banner','cover','quote','reply','pinned'];
const lists=['participants','related','media'];
export function validateBackup(raw:unknown) {
  const input=envelope.parse(raw);
  for(const key of tables) input.data[key]=z.array(schemas[key] as z.ZodType).parse(input.data[key]??[]);
  if(!input.data.universes.length) throw Error('Архив не содержит вселенных');
  const worlds=new Set(input.data.universes.map(item=>(item as Records['universes']).id));
  const seen=new Map<string,string>();
  for(const key of tables) {
    const ownIds=new Set<string>();
    for(const item of input.data[key] as {id:string;universeId:string}[]) {
      if(!worlds.has(item.universeId) || (key==='universes'&&item.id!==item.universeId) || ownIds.has(item.id) || (seen.has(item.id)&&seen.get(item.id)!==item.universeId)) throw Error('Неверные или повторяющиеся идентификаторы');
      ownIds.add(item.id);
      seen.set(item.id,item.universeId);
    }
  }
  const indexed=(key:typeof tables[number])=>new Set((input.data[key] as {id:string}[]).map(item=>item.id));
  const actors=new Set([...indexed('characters'),...indexed('user_personas')]);
  const posts=indexed('posts'), chats=indexed('conversations'), messages=indexed('messages');
  const validActionTargets=new Set([...posts,...messages]);
  const required:Partial<Record<typeof tables[number],Record<string,Set<string>>>>={
    character_states:{owner:actors},relationships:{from:actors,to:actors},
    memories:{owner:actors},posts:{author:actors},comments:{author:actors,post:posts},
    reactions:{actor:actors,target:validActionTargets},follows:{from:actors,to:actors},
    conversation_members:{conversation:chats,actor:actors},messages:{conversation:chats,author:actors},
    notifications:{actor:actors,recipient:actors},simulation_jobs:{actor:actors}
  };
  for(const key of tables) for(const item of input.data[key] as Record<string,unknown>[]) {
    const references=[...links.map(field=>item[field]),...lists.flatMap(field=>item[field] as string[] ?? [])];
    if(references.some(value=>typeof value==='string'&&seen.has(value)&&seen.get(value)!==item.universeId)) throw Error('Ссылка между разными вселенными');
    for(const [field,targets] of Object.entries(required[key]??{})) if(typeof item[field]!=='string'||!targets.has(item[field] as string)) throw Error('Отсутствует связанная запись: '+key+'.'+field);
  }
  return input as Backup;
}
export async function readBackup(file:File) {
  if(file.size>maxFile) throw Error('Файл больше 60 МиБ');
  if(!file.name.toLowerCase().endsWith('.zip')) return {backup:validateBackup(JSON.parse(await file.text())),media:[] as Records['media_assets'][]};
  let expanded=0;
  const files=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:file=>{
    if(file.name!=='backup.json'&&file.name!=='media.json'&&!/^media\/[\w-]+$/.test(file.name)) return false;
    expanded+=file.originalSize;
    if(expanded>maxFile) throw Error('Распакованный архив слишком большой');
    return true;
  }});
  const backup=validateBackup(JSON.parse(strFromU8(files['backup.json'])));
  const manifest=z.array(mediaMeta).max(5000).parse(JSON.parse(strFromU8(files['media.json'])));
  const assetIds=new Set<string>();
  for(const item of manifest) {
    if(assetIds.has(item.id)) throw Error('Повторяющийся идентификатор изображения');
    assetIds.add(item.id);
  }
  const assetWorld=new Map(manifest.map(item=>[item.id,item.universeId]));
  for(const key of tables) for(const entry of backup.data[key]??[]) {
    const fields=entry as Record<string,unknown>;
    const refs=[fields.avatar,fields.banner,fields.cover,...(fields.media as string[]??[])];
    if(refs.some(id=>typeof id==='string'&&assetWorld.has(id)&&assetWorld.get(id)!==entry.universeId)) throw Error('Изображение другой вселенной');
  }
  const media:Records['media_assets'][]=[];
  for(const item of manifest) {
    const bytes=files['media/'+item.id];
    if(!bytes || bytes.length>8*1024*1024 || !backup.data.universes?.some(world=>world.id===item.universeId)) throw Error('Неверное изображение в архиве');
    const blob=await optimizeImage(new Blob([Uint8Array.from(bytes)],{type:item.mime}));
    media.push({...item,mime:mime.parse(blob.type),blob});
  }
  return {backup,media};
}
export async function restore(backup:Backup,media:Records['media_assets'][]=[],suffix='') {
  const remap=new Map<string,string>();
  for(const key of tables) for(const value of backup.data[key]??[]) if(!remap.has(value.id)) remap.set(value.id,crypto.randomUUID());
  for(const asset of media) remap.set(asset.id,crypto.randomUUID());
  const convert=(value:{id:string})=>{
    const result:Record<string,unknown>={...value,id:remap.get(value.id)};
    for(const key of links) if(typeof result[key]==='string') result[key]=remap.get(result[key] as string);
    for(const key of lists) if(Array.isArray(result[key])) result[key]=(result[key] as string[]).flatMap(id=>remap.get(id)??[]);
    return result;
  };
  await db.transaction('rw',[...tables.map(key=>db.table(key)),db.media_assets],async()=>{
    for(const key of tables) {
      const entries=(backup.data[key]??[]).map(value=>{
        const entry=convert(value);
        if(key==='memories'&&!entry.source) entry.source=crypto.randomUUID();
        if(key==='notifications'&&!entry.target) entry.target=entry.recipient;
        return entry;
      });
      if(key==='universes'&&suffix) for(const entry of entries) entry.name=entry.name+suffix;
      if(key==='character_states') for(const entry of entries) entry.id=entry.owner;
      if(key==='relationships') for(const entry of entries) entry.id=entry.from+'>'+entry.to;
      if(key==='simulation_jobs') for(const entry of entries) if(entry.status==='running'||entry.status==='pending') entry.status='failed';
      if(entries.length) await db.table(key).bulkAdd(entries);
    }
    if(media.length) await db.media_assets.bulkAdd(media.map(item=>convert(item)) as Records['media_assets'][]);
  });
  return remap.get(backup.data.universes![0].id)!;
}
export async function deleteWorld(world:string) {
  const children=[...tables.filter(key=>key!=='universes'),'media_assets','checkpoints'] as Exclude<TableName,'model_registry'|'universes'>[];
  await db.transaction('rw',[db.universes,...children.map(key=>db.table(key))],async()=>{
    for(const key of children) await scoped(key,world).delete();
    await db.universes.delete(world);
  });
}
export async function optimizeImage(input:Blob) {
  if(input.size>20*1024*1024 || !['image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif'].includes(input.type)) throw Error('Выберите изображение до 20 МиБ');
  const url=URL.createObjectURL(input);
  try {
    const picture=new Image();
    picture.src=url;
    await picture.decode();
    if(!picture.naturalWidth||!picture.naturalHeight||picture.naturalWidth*picture.naturalHeight>60000000) throw Error('Слишком большое изображение');
    const ratio=Math.min(1,1440/Math.max(picture.naturalWidth,picture.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(picture.naturalWidth*ratio));
    canvas.height=Math.max(1,Math.round(picture.naturalHeight*ratio));
    canvas.getContext('2d')!.drawImage(picture,0,0,canvas.width,canvas.height);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Кодирование не удалось')),'image/webp',0.83));
  } finally {URL.revokeObjectURL(url);}
}
export async function addImage(world:string,file:File) {
  const blob=await optimizeImage(file);
  const asset={...row(world),mime:mime.parse(blob.type),blob};
  await db.media_assets.add(asset);
  return asset.id;
}
const card=z.object({name:z.string().trim().min(1).max(120),description:z.string().max(12000).optional(),personality:z.string().max(12000).optional(),scenario:z.string().max(12000).optional(),mes_example:z.string().max(12000).optional(),system_prompt:z.string().max(12000).optional(),first_mes:z.string().max(12000).optional()});
export function parseCard(input:unknown):Partial<Actor> {
  const v2=z.object({spec:z.literal('chara_card_v2'),data:card}).safeParse(input);
  if(v2.success) {
    const data=v2.data.data;
    return {name:data.name,handle:data.name.toLowerCase().replace(/[^\p{L}\d]+/gu,'_').slice(0,26)||'character',details:{bio:data.description,personality:data.personality,history:data.scenario,examples:data.mes_example,instructions:data.system_prompt,initialMemory:data.first_mes}};
  }
  return actorSchema.pick({name:true,handle:true,portrait:true,details:true}).parse(input);
}
export async function readCard(file:File) {
  if(file.size>8*1024*1024) throw Error('Карточка больше 8 МиБ');
  if(!file.name.toLowerCase().endsWith('.png')) return parseCard(JSON.parse(await file.text()));
  const bytes=new Uint8Array(await file.arrayBuffer());
  const view=new DataView(bytes.buffer);
  if(bytes.length<8||view.getUint32(0)!==0x89504e47||view.getUint32(4)!==0x0d0a1a0a) throw Error('Неверный PNG');
  for(let offset=8;offset+12<=bytes.length;) {
    const size=view.getUint32(offset);
    if(size>bytes.length-offset-12) throw Error('Повреждённый PNG');
    const type=strFromU8(bytes.subarray(offset+4,offset+8));
    const chunk=bytes.subarray(offset+8,offset+8+size);
    if(type==='tEXt' && size<750000 && strFromU8(chunk.subarray(0,6))==='chara\0') {
      const encoded=atob(strFromU8(chunk.subarray(6)));
      return parseCard(JSON.parse(strFromU8(Uint8Array.from(encoded,char=>char.charCodeAt(0)))));
    }
    offset+=size+12;
  }
  throw Error('В PNG не найдена метка chara');
}
