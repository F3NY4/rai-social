import Dexie,{type EntityTable} from 'dexie';
import type {Records,TableName} from './schema';
import type {AIOptions} from '../ai/provider';
export type Settings = AIOptions & {
  id:'preferences'; universe:string; persona:string; theme:'dark'|'light'|'system'; language:'ru'|'en'; agentLanguage:'ru'|'en';
  activity:'paused'|'calm'|'normal'|'high'; catchup:number; lastSeen:number; density:'normal'|'compact';
  accent:string; font:number; motion:boolean; glass:boolean; autoPosts:boolean; autoDM:boolean; agents:number; memoryLimit:number;
};
export const defaults:Settings = {id:'preferences',universe:'',persona:'',theme:'dark',language:'ru',agentLanguage:'ru',activity:'paused',catchup:2,lastSeen:0,model:'qwen',mode:'Balanced',gpu:false,temperature:0.7,topP:0.9,density:'normal',accent:'#f88056',font:15,motion:true,glass:true,autoPosts:true,autoDM:true,agents:5,memoryLimit:5};
const v1 = {
  universes:'id,at',user_personas:'id,universeId',characters:'id,universeId',
  character_states:'id,universeId,owner',relationships:'id,universeId,[from+to]',memories:'id,universeId,[universeId+owner]',
  posts:'id,universeId,[universeId+at]',comments:'id,universeId,post',
  reactions:'id,universeId,[actor+target+kind],target',follows:'id,universeId,[from+to],to',
  conversations:'id,universeId',conversation_members:'id,universeId,conversation,actor',
  messages:'id,universeId,[conversation+at],conversation',
  notifications:'id,universeId,recipient,target',world_events:'id,universeId,virtual',
  simulation_jobs:'id,universeId,status',model_registry:'id',media_assets:'id,universeId',
  settings:'id',checkpoints:'id,universeId'
};
export function database(name = 'rai-social') {
  const db = new Dexie(name) as Dexie & {[K in TableName]:EntityTable<Records[K],'id'>} & {settings:EntityTable<Settings,'id'>};
  db.version(1).stores(v1);
  db.version(2).stores({...v1,notifications:v1.notifications+',read'}).upgrade(tx=>tx.table('settings').toCollection().modify(row=>{
    for (const [key,value] of Object.entries(defaults)) if (row[key] === undefined) row[key] = value;
  }));
  return db;
}
export const db = database();
export const scoped = <K extends Exclude<TableName,'model_registry'>>(table:K, id:string) => db.table<Records[K],string>(table).where('universeId').equals(id);
export function row(universeId:string, at=Date.now()) {return {id:crypto.randomUUID(),universeId,at};}
export const getSettings = async () => ({...defaults,...await db.settings.get('preferences')});
