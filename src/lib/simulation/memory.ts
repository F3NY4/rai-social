import {db,row,scoped} from '../database/db';
import {feelings,ties,type Records} from '../database/schema';

export const emptyFeelings = Object.fromEntries(feelings.map(key=>[key,0])) as Records['character_states']['values'];
export const emptyTies = Object.fromEntries(ties.map(key=>[key,0])) as Records['relationships']['values'];
const clamp=(value:number)=>Math.max(-100,Math.min(100,value));
const words=(text:string):string[]=>text.toLowerCase().match(/[\p{L}\d]{2,}/gu) ?? [];
export class MemoryManager {
  async search(world:string,owner:string,query:string,participants:string[],limit=5,visible?: (record:Records['memories'])=>boolean) {
    const memories=await db.memories.where('[universeId+owner]').equals([world,owner]).toArray();
    const records=visible?memories.filter(visible):memories;
    if(!records.length) return [];
    const documents=records.map(memory=>words(memory.text));
    const terms=[...new Set(words(query))].slice(0,40);
    const average=documents.reduce((sum,doc)=>sum+doc.length,0)/records.length || 1;
    const df=terms.map(term=>documents.filter(doc=>doc.includes(term)).length);
    return records.map((memory,i)=>{
      const doc=documents[i];
      const bm25=terms.reduce((score,term,index)=>{
        const count=doc.filter(word=>word===term).length;
        return score+Math.log(1+(records.length-df[index]+0.5)/(df[index]+0.5))*count*2.2/(count+1.2*(0.25+0.75*doc.length/average));
      },0);
      return {memory,score:bm25 + memory.importance + Number(memory.pinned)*3 + Number(memory.participants.some(id=>participants.includes(id))) + Math.exp(-Math.max(0,Date.now()-memory.at)/86400000)};
    }).sort((a,b)=>b.score-a.score).slice(0,limit).map(item=>item.memory);
  }
  async digest(world:string,chat:string,owner:string,participants:string[], older:Records['messages'][]) {
    if(!older.length) return '';
    const id='summary-'+chat+'-'+owner;
    const pieces=older.filter(item=>item.text).slice(-18).map(item=>item.author.slice(0,8)+': '+item.text.slice(0,80));
    const text=pieces.join(' · ').slice(0,1400);
    await db.memories.put({...row(world),id,owner,source:chat,participants,kind:'working',text,importance:0.45,valence:0,confidence:1,privacy:'private',related:older.slice(-18).map(item=>item.id),pinned:false});
    return text;
  }
}
export const memory = new MemoryManager();
export async function experience(world:string,owner:string,other:string,source:string,text:string,priv:boolean,neutral=false) {
  if(owner===other) return;
  const edgeId=owner+'>'+other;
  const tone=neutral?0:/спасибо|great|рад|супер|thank/i.test(text)?1:/ненавиж|идиот|hate|liar/i.test(text)?-1:0;
  await db.transaction('rw',db.character_states,db.relationships,db.memories,async()=>{
    const state = await db.character_states.get(owner);
    const values = {...emptyFeelings,...state?.values};
    values.mood=clamp(values.mood+tone*2);
    values.stress=clamp(values.stress*0.97-tone);
    values.irritation=clamp(values.irritation*0.96-tone*2);
    values.interest=clamp(values.interest+0.8);
    values.fatigue=clamp(values.fatigue+0.3);
    await db.character_states.put({...row(world),...state,id:owner,owner,values});
    const edge = await db.relationships.get(edgeId);
    const relation={...emptyTies,...edge?.values};
    relation.trust=clamp(relation.trust+0.25+tone);
    relation.liking=clamp(relation.liking+tone*1.5);
    relation.conflicts=clamp(relation.conflicts+Number(tone<0));
    await db.relationships.put({...row(world),...edge,id:edgeId,from:owner,to:other,values:relation,note:edge?.note??''});
    await db.memories.put({...row(world),id:source+'-'+owner,owner,source,participants:[owner,other],kind:tone?'emotional':'episode',text:text.slice(0,320),importance:tone?0.7:0.35,valence:tone,confidence:1,privacy:priv?'private':'world',related:[],pinned:false});
  });
}
export const listMemories=(world:string)=>scoped('memories',world).reverse().limit(100).toArray();
