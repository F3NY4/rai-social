import {liveQuery} from 'dexie';
import {db,defaults,getSettings,row,scoped,type Settings} from './database/db';
import {seed} from './database/demo';
import {addCharacter,comment,conversation,createWorld,isMember,message,post} from './database/social';
import {actorSchema,type Actor,type Records,type Universe} from './database/schema';
import {downloadModel,installed,removeModel} from './ai/storage';
import {models,type ModelId} from './ai/models';
import {catchup,interval,SimulationEngine} from './simulation/engine';
import {experience} from './simulation/memory';
export type View = 'feed'|'search'|'alerts'|'messages'|'universes'|'characters'|'relations'|'memory'|'story'|'settings'|'model'|'profile'|'saved'|'post';
export class SocialApp {
  settings=$state<Settings>({...defaults});
  worlds=$state<Universe[]>([]);
  actors=$state<Actor[]>([]);
  personas=$state<Actor[]>([]);
  posts=$state<Records['posts'][]>([]);
  comments=$state<Records['comments'][]>([]);
  reactions=$state<Records['reactions'][]>([]);
  follows=$state<Records['follows'][]>([]);
  alerts=$state<Records['notifications'][]>([]);
  chats=$state<Records['conversations'][]>([]);
  memberships=$state<Records['conversation_members'][]>([]);
  messages=$state<Records['messages'][]>([]);
  events=$state<Records['world_events'][]>([]);
  relationships=$state<Records['relationships'][]>([]);
  states=$state<Records['character_states'][]>([]);
  memories=$state<Records['memories'][]>([]);
  checkpoints=$state<Records['checkpoints'][]>([]);
  models=$state<Partial<Record<ModelId,boolean>>>({});
  view=$state<View>('feed');
  target=$state('');
  chat=$state('');
  ready=$state(false);
  error=$state('');
  notice=$state('');
  running=$state(0);
  speed=$state(0);
  progress=$state(-1);
  downloadId=$state<ModelId|null>(null);
  world=$derived(this.worlds.find(item=>item.id===this.settings.universe));
  persona=$derived(this.personas.find(item=>item.id===this.settings.persona)??this.personas[0]);
  people=$derived(new Map([...this.actors,...this.personas].map(item=>[item.id,item])));
  latest=$derived(this.alerts.filter(item=>item.recipient===this.persona?.id&&!item.read));
  private timer?:ReturnType<typeof setInterval>;
  private downloadAbort?:AbortController;
  private simulation=new SimulationEngine();
  private lastTick=0;
  private stepping=false;
  private lastVisibility=0;
  private refresh?:()=>void;
  private router?:()=>void;
  async start() {
    this.settings=await getSettings();
    if(!this.settings.universe || !await db.universes.get(this.settings.universe)) {
      const {world,persona}=await seed();
      await this.save({universe:world.id,persona:persona.id});
    }
    await db.simulation_jobs.where('status').anyOf('running','pending').modify({status:'failed'});
    await this.refreshModels();
    this.worlds=await db.universes.toArray();
    this.bind();
    const route=()=>{
      const [path,arg]=location.hash.slice(1).split('/');
      const views:View[]=['feed','search','alerts','messages','universes','characters','relations','memory','story','settings','model','profile','saved','post'];
      this.view=views.includes(path as View)?path as View:'feed';
      this.target=arg||'';
      this.chat=this.view==='messages'?this.target:'';
    };
    this.router=route;
    window.addEventListener('hashchange',route);
    route();
    this.ready=true;
    this.lastTick=Date.now();
    this.lastVisibility=this.settings.lastSeen;
    document.addEventListener('visibilitychange',this.visibility);
    window.addEventListener('pagehide',this.hide);
    this.timer=setInterval(()=>{
      if(!document.hidden && !this.stepping && !this.running && Date.now()-this.lastTick>=interval(this.settings)) {
        this.lastTick=Date.now();
        void this.safe(()=>this.step());
      }
      if(!document.hidden) void this.save({lastSeen:Date.now()});
    },15000);
    if(this.settings.activity!=='paused') await this.safe(()=>this.resume());
  }
  destroy() {
    this.refresh?.();
    clearInterval(this.timer);
    if(this.router) window.removeEventListener('hashchange',this.router);
    document.removeEventListener('visibilitychange',this.visibility);
    window.removeEventListener('pagehide',this.hide);
    this.downloadAbort?.abort();
    void this.simulation.stop(true).catch(()=>{});
  }
  private visibility=()=>{
    if(document.hidden) this.hide();
    else void this.safe(()=>this.resume());
  };
  private hide=()=>{
    this.lastVisibility=Date.now();
    void this.save({lastSeen:this.lastVisibility});
    void this.simulation.stop(true).catch(()=>{});
    this.downloadAbort?.abort();
  };
  private async resume() {
    const last=this.lastVisibility;
    this.lastVisibility=0;
    this.lastTick=Date.now();
    if(!last || this.settings.activity==='paused' || !this.models[this.settings.model]) return;
    const count=catchup(last,Date.now(),this.settings.catchup);
    for(let i=0;i<count&&!document.hidden;i++) await this.step(Math.floor(last/120000)+i);
    if(count) this.notify(this.t('Догоняющая симуляция завершена','Catch-up simulation complete'));
  }
  t=(ru:string,en:string)=>this.settings.language==='en'?en:ru;
  async safe<T>(work:()=>Promise<T>) {
    this.error='';
    try {return await work();}
    catch(error) {
      if(!(error instanceof Error&&error.name==='AbortError')) this.error=error instanceof Error?error.message:String(error);
    }
  }
  notify(message:string) {this.notice=message;}
  go(view:View,target='') {
    this.view=view;
    this.target=target;
    this.chat=view==='messages'?target:'';
    location.hash=view+(target?'/'+target:'');
    window.scrollTo({top:0});
  }
  bind() {
    this.refresh?.();
    const world=this.settings.universe;
    const subscribe=<K extends Exclude<keyof Records,'model_registry'>>(key:K,assign:(items:Records[K][])=>void)=>liveQuery(()=>scoped(key,world).toArray()).subscribe({next:assign,error:error=>this.error=String(error)});
    const subs=[
      liveQuery(()=>db.universes.toArray()).subscribe({next:items=>this.worlds=items,error:error=>this.error=String(error)}),
      subscribe('characters',items=>this.actors=items),subscribe('user_personas',items=>this.personas=items),
      subscribe('posts',items=>this.posts=items.sort((a,b)=>b.at-a.at)),subscribe('comments',items=>this.comments=items.sort((a,b)=>a.at-b.at)),
      subscribe('reactions',items=>this.reactions=items),subscribe('follows',items=>this.follows=items),subscribe('notifications',items=>this.alerts=items.sort((a,b)=>b.at-a.at)),
      subscribe('conversations',items=>this.chats=items.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.at-a.at)),
      subscribe('conversation_members',items=>this.memberships=items),subscribe('messages',items=>this.messages=items.sort((a,b)=>a.at-b.at)),
      subscribe('world_events',items=>this.events=items.sort((a,b)=>b.virtual-a.virtual)),subscribe('relationships',items=>this.relationships=items),
      subscribe('character_states',items=>this.states=items),subscribe('memories',items=>this.memories=items.sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.at-a.at)),
      subscribe('checkpoints',items=>this.checkpoints=items.sort((a,b)=>b.at-a.at))
    ];
    this.refresh=()=>subs.forEach(sub=>sub.unsubscribe());
  }
  async save(patch:Partial<Settings>) {
    const next={...this.settings,...patch};
    this.settings=next;
    await db.settings.put(next);
  }
  async selectWorld(world:string) {
    await this.simulation.stop(true);
    const persona=await scoped('user_personas',world).first();
    await this.save({universe:world,persona:persona?.id??'',lastSeen:Date.now()});
    this.actors=[];this.personas=[];this.posts=[];this.comments=[];this.reactions=[];this.follows=[];this.alerts=[];this.chats=[];this.memberships=[];this.messages=[];this.events=[];this.relationships=[];this.states=[];this.memories=[];this.checkpoints=[];
    this.bind();
    this.go('feed');
  }
  async create(name:string, description:string,personaName:string,handle:string,character?:{name:string;handle:string;personality:string}) {
    const validated=actorSchema.pick({name:true,handle:true}).parse({name:personaName.trim(),handle:handle.trim()});
    if(character?.name.trim()) actorSchema.pick({name:true,handle:true}).parse({name:character.name.trim(),handle:character.handle.trim()});
    const {world,persona}=await createWorld(name,description);
    await db.user_personas.update(persona.id,validated);
    if(character?.name.trim()) await addCharacter(world.id,{name:character.name.trim(),handle:character.handle.trim(),details:{personality:character.personality}});
    await this.selectWorld(world.id);
  }
  async refreshModels() {
    const keys=Object.keys(models) as ModelId[];
    const values=await Promise.all(keys.map(id=>installed(id)));
    this.models=Object.fromEntries(keys.map((id,index)=>[id,values[index]]));
  }
  async install(id:ModelId) {
    if(this.downloadAbort) return;
    const abort=new AbortController();
    this.downloadAbort=abort;
    this.downloadId=id;
    this.progress=0;
    try {
      await navigator.storage.persist?.().catch(()=>false);
      const transfer=()=>downloadModel(id,abort.signal,value=>this.progress=value);
      if(navigator.locks) await navigator.locks.request('rai-model-'+id,{signal:abort.signal},transfer);
      else await transfer();
      await db.model_registry.put({id,at:Date.now()});
      await this.refreshModels();
      this.notify(this.t('Модель сохранена на устройстве','Model saved on this device'));
    } catch(error) {
      if(error instanceof Error && (error.name==='QuotaExceededError'||/storage quota/i.test(error.message))) {
        throw Error(this.t('Браузер исчерпал квоту хранилища. Освободите место или выберите модель меньшего размера.','The browser ran out of storage quota. Free up space or select a smaller model.'));
      }
      throw error;
    } finally {this.downloadAbort=undefined;this.downloadId=null;this.progress=-1;}
  }
  pauseDownload() {this.downloadAbort?.abort();}
  async removeModel(id:ModelId) {
    await this.simulation.stop(true);
    await removeModel(id);
    await db.model_registry.delete(id);
    await this.refreshModels();
  }
  async stop() {await this.simulation.stop(true);}
  private get hasEngine() {return !this.world?.demo && !!this.models[this.settings.model];}
  async run(actor:Actor,type:Parameters<SimulationEngine['run']>[2],target?:string) {
    if(!this.world || !this.hasEngine) throw Error(this.t('Для генерации выберите локальную модель в своей вселенной','Select a local model in your own universe to generate'));
    this.running++;
    try {this.speed=await this.simulation.run(this.world,actor,type,target,this.settings,10);}
    finally {this.running--;}
  }
  async step(seed=Date.now()) {
    if(!this.world || !this.hasEngine || this.stepping || document.hidden) return;
    this.stepping=true;
    this.running++;
    try {this.speed=await this.simulation.step(this.world,this.settings,seed);}
    finally {this.stepping=false;this.running--;}
  }
  async describe(text:string) {
    if(!this.hasEngine) throw Error(this.t('Выберите модель в собственной вселенной','Select a model in your own universe'));
    this.running++;
    try {return await this.simulation.describe(this.settings,text);}
    finally {this.running--;}
  }
  async publish(text:string,media:string[],quote?:string,edit?:string) {
    const world=this.world, persona=this.persona;
    if(!world||!persona) return;
    if(edit) {
      const entry=await db.posts.get(edit);
      if(entry?.author!==persona.id||entry.universeId!==world.id||text.length>4000||(!text.trim()&&!media.length&&!quote)) throw Error('Недопустимое изменение публикации');
      await db.posts.update(edit,{text:text.trim(),media:[...media],edited:Date.now()});
      return;
    }
    const entry=await post(world.id,persona.id,text,media,quote);
    const responder=this.actors.find(actor=>text.includes('@'+actor.handle))??this.actors[0];
    if(responder&&this.hasEngine&&this.settings.autoPosts) void this.safe(()=>this.run(responder,'COMMENT',entry.id));
  }
  async replyPost(postId:string,text:string,parent?:string) {
    if(!this.world||!this.persona) return;
    const entry=await comment(this.world.id,this.persona.id,postId,text,parent);
    const item=this.posts.find(post=>post.id===postId);
    const actor=this.actors.find(actor=>actor.id===(parent?this.comments.find(item=>item.id===parent)?.author:item?.author));
    if(actor) {
      await experience(this.world.id,actor.id,this.persona.id,entry.id,text,false);
      if(this.hasEngine&&this.settings.autoPosts) void this.safe(()=>this.run(actor,'COMMENT',postId));
    }
  }
  async openChat(ids:string[],title='') {
    if(!this.world||!this.persona) return;
    const entry=await conversation(this.world.id,[this.persona.id,...ids],title);
    await this.readChat(entry.id);
    this.go('messages',entry.id);
  }
  async readChat(id:string) {
    if(!this.persona||!await isMember(id,this.persona.id)) return;
    await db.transaction('rw',db.conversations,db.notifications,async()=>{
      await db.conversations.update(id,{read:Date.now()});
      await db.notifications.where('target').equals(id).filter(item=>item.recipient===this.persona?.id).modify({read:true});
    });
  }
  async send(chat:string,text:string,media:string[]=[],reply?:string,edit?:string) {
    const world=this.world, persona=this.persona;
    if(!world||!persona) return;
    if(edit) {
      const entry=await db.messages.get(edit);
      if(entry?.author!==persona.id || entry.conversation!==chat || entry.universeId!==world.id || text.length>8000 || (!text.trim()&&!media.length)) throw Error('Недопустимое изменение сообщения');
      await db.messages.update(edit,{text:text.trim(),media:[...media],edited:Date.now()});
      for(const memory of await scoped('memories',world.id).filter(item=>item.source===edit).toArray()) await db.memories.update(memory.id,{text:text.slice(0,320)});
      return;
    }
    const sent=await message(world.id,chat,persona.id,text,media,reply);
    await this.readChat(chat);
    const members=this.memberships.filter(item=>item.conversation===chat).map(item=>item.actor);
    const actors=this.actors.filter(actor=>members.includes(actor.id));
    for(const actor of actors) await experience(world.id,actor.id,persona.id,sent.id,text,true);
    if(this.hasEngine) void this.safe(async()=>{
      for(const actor of actors.slice(0,3)) {
        if(this.chat!==chat||document.hidden||this.world?.id!==world.id) break;
        await this.run(actor,members.length>2?'SEND_GROUP_MESSAGE':'SEND_DM',chat);
      }
    });
  }
  async alternative(chat:string,id:string) {
    const world=this.world, persona=this.persona;
    const last=this.messages.findLast(item=>item.conversation===chat);
    const actor=this.actors.find(item=>item.id===last?.author);
    if(!world||!persona||!this.hasEngine||!actor||last?.id!==id||!await isMember(chat,persona.id)) throw Error(this.t('Можно заменить только последнюю реплику агента','Only the latest agent reply can be replaced'));
    this.running++;
    try {return await this.simulation.alternative(world,actor,chat,id,this.settings);}
    finally {this.running--;}
  }
  async acceptAlternative(chat:string,id:string,text:string) {
    const world=this.world, persona=this.persona;
    if(!world||!persona||!await isMember(chat,persona.id)) return;
    await db.transaction('rw',db.messages,db.memories,db.characters,async()=>{
      const last=await db.messages.where('[conversation+at]').between([chat,0],[chat,Infinity],true,true).last();
      if(last?.id!==id||last.universeId!==world.id||!await db.characters.get(last.author)) throw Error(this.t('После генерации чат изменился','The conversation changed since generation'));
      await db.messages.update(id,{text,edited:Date.now()});
      await scoped('memories',world.id).filter(item=>item.source===id).modify({text:text.slice(0,320),valence:0,kind:'episode'});
      await scoped('memories',world.id).filter(item=>item.kind==='working'&&item.related.includes(id)).delete();
    });
  }
  async addPersona(name:string,handle:string) {
    if(!this.world) return;
    const actor=actorSchema.parse({...row(this.world.id),name,handle,details:{}});
    await db.user_personas.add(actor);
    await this.save({persona:actor.id});
    this.go('profile',actor.id);
  }
}
