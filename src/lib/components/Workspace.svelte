<script lang="ts">
  import {ArrowRight,Archive,ChevronRight,Copy,Database,Download,Globe2,ImagePlus,Orbit,Pause,Pencil,Play,Plus,ShieldCheck,Sparkles,Trash2,Upload,Zap} from 'lucide-svelte';
  import type {SocialApp,View} from '../app.svelte';
  import {db,row,scoped,type Settings} from '../database/db';
  import {addCharacter} from '../database/social';
  import {addImage,archive,collect,deleteWorld,readBackup,readCard,restore,saveFile,validateBackup} from '../database/files';
  import {characterLabels,ties,worldLabels,type Actor,type Records,type Universe} from '../database/schema';
  import {emptyFeelings,emptyTies} from '../simulation/memory';
  import {worldEvent} from '../simulation/engine';
  import Avatar from './Avatar.svelte';
  import ModelPanel from './ModelPanel.svelte';
  import Media from './Media.svelte';
  let {app}:{app:SocialApp}=$props();
  const t=(ru:string,en:string)=>app.t(ru,en);
  const titles:Partial<Record<View,[string,string,string,string]>>={
    universes:['Вселенные','Universes','Ваши миры и сюжетные сценарии','Your worlds and story settings'],
    characters:['Персонажи','Characters','Личности и профили этой вселенной','Personalities and profiles in this world'],
    relations:['Отношения','Relationships','Направленные связи между участниками','Directed connections between members'],
    memory:['Память','Memory','Наблюдение и управление воспоминаниями','Observe and manage memories'],
    story:['Сюжет','Story','Хронология и ветки вашей вселенной','Your universe timeline and branches'],
    settings:['Настройки','Settings','Внешний вид, симуляция и локальные данные','Appearance, simulation and local data'],
    model:['Нейросеть','Local AI','Модели и возможности устройства','Models and device capabilities']
  };
  const heading=$derived(titles[app.view]??titles.settings!);
  let editor=$state<'world'|'character'|''>('');
  let editId=$state('');
  let name=$state('');
  let handle=$state('');
  let description=$state('');
  let details=$state<Record<string,string|undefined>>({});
  let cover=$state<string|undefined>();
  let avatar=$state<string|undefined>();
  let banner=$state<string|undefined>();
  let portrait=$state<Actor['portrait']>('amber');
  let personaName=$state('');
  let personaHandle=$state('');
  let characterName=$state('');
  let characterHandle=$state('');
  let characterBio=$state('');
  let preset=$state('empty');
  let backup=$state<Awaited<ReturnType<typeof readBackup>>>();
  let observer=$state(false);
  let from=$state('');
  let to=$state('');
  let values=$state({...emptyTies});
  let note=$state('');
  let eventTitle=$state('');
  let eventText=$state('');
  let eventTime=$state('');
  let checkpoint=$state('');
  let goalActor=$state('');
  let goalText=$state('');
  let memoryOwner=$state('');
  let memoryEdit=$state('');
  let memoryText=$state('');
  let limit=$state(20);
  const people=$derived([...app.actors,...app.personas]);
  $effect(()=>{app.view;editor='';editId='';backup=undefined;limit=20;});
  function openWorld(world?:Universe) {
    editor='world';editId=world?.id??'';name=world?.name??'';description=world?.description??'';details={...world?.details};cover=world?.cover;
    personaName='';personaHandle='';characterName='';characterHandle='';characterBio='';preset='empty';
  }
  function openActor(actor?:Partial<Actor>,editing=false) {
    editor='character';editId=editing?actor?.id??'':'';name=actor?.name??'';handle=actor?.handle??'';details={...actor?.details};portrait=actor?.portrait??'amber';avatar=actor?.avatar;banner=actor?.banner;description='';
  }
  async function saveWorld() {
    if(editId) await db.universes.update(editId,{name:name.trim(),description,details:{...details},cover});
    else {
      await app.create(name,description,personaName,personaHandle,characterName?{name:characterName,handle:characterHandle,personality:characterBio}:undefined);
      await db.universes.update(app.settings.universe,{details:{...details}});
      if(!app.models[app.settings.model]) app.go('model');
    }
    editor='';
  }
  async function saveActor() {
    const world=app.world;
    if(!world) return;
    const prior=app.actors.find(item=>item.id===editId);
    await addCharacter(world.id,{...prior,name:name.trim(),handle:handle.trim(),details,portrait,avatar,banner});
    editor='';
  }
  async function fileFrom(event:Event) {
    const input=event.currentTarget as HTMLInputElement;
    const file=input.files?.[0];
    input.value='';
    return file;
  }
  async function importCard(event:Event) {
    const file=await fileFrom(event);
    if(!file) return;
    const data=await readCard(file);
    if(file.type==='image/png'&&app.world) data.avatar=await addImage(app.world.id,file);
    openActor(data);
  }
  async function addArt(event:Event,key:'cover'|'avatar'|'banner') {
    const file=await fileFrom(event), world=key==='cover'?editId:app.world?.id;
    if(!file||!world) return;
    const id=await addImage(world,file);
    if(key==='cover') cover=id;
    else if(key==='avatar') avatar=id;
    else banner=id;
  }
  function usePreset() {
    if(preset==='signal') {name='Город после сигнала';description='Незнакомый сигнал объединяет жителей города.';details={genre:'Киберпанк',plot:'Радиостанция принимает нераспознанную передачу.'};}
    else if(preset==='cafe') {name='Кафе у станции';description='Обычные дни, общие привычки и новые встречи.';details={genre:'Повседневность',plot:'Кафе открывается впервые после ремонта.'};}
    else {name='';description='';details={};}
  }
  async function fork(world:Universe,suffix:string) {
    const id=await restore(await collect(world.id),await scoped('media_assets',world.id).toArray(),suffix);
    await app.selectWorld(id);
  }
  async function erase(world:Universe) {
    if(!confirm(t('Удалить вселенную и всю её историю?','Delete this universe and all its history?'))) return;
    await app.stop();
    await deleteWorld(world.id);
    if(world.id===app.world?.id) {
      const other=await db.universes.filter(item=>!item.archived).first();
      if(other) await app.selectWorld(other.id);
      else {await app.save({universe:'',persona:''});app.bind();}
    }
  }
  function relation() {
    const edge=app.relationships.find(item=>item.from===from&&item.to===to);
    values={...emptyTies,...edge?.values};note=edge?.note??'';
  }
  async function saveRelation() {
    if(!app.world||!from||!to||from===to) throw Error(t('Выберите двух участников','Choose two members'));
    await db.relationships.put({...row(app.world.id),id:from+'>'+to,from,to,values:{...values},note});
    app.notify(t('Отношение сохранено','Relationship saved'));
  }
  async function saveEvent(random=false) {
    if(!app.world||!app.persona) return;
    const target=eventTime?new Date(eventTime).getTime():app.world.clock+3600000;
    if(!Number.isFinite(target)) throw Error(t('Неверная дата','Invalid date'));
    const prompts=[['Незапланированная встреча','Unexpected meeting'],['Общий шум','A noise in common'],['Смена маршрута','Change of route']] as const;
    const choice=prompts[Math.floor(Math.random()*prompts.length)];
    const title=random?t(choice[0],choice[1]):eventTitle.trim();
    if(!title) return;
    await worldEvent(app.world.id,app.persona.id,title,eventText,target);
    eventTitle='';eventText='';eventTime='';
  }
  async function saveCheckpoint() {
    if(!app.world||!checkpoint.trim()) return;
    const snapshot=JSON.stringify(await collect(app.world.id));
    if(snapshot.length>10000000) throw Error(t('Снимок слишком большой','Snapshot is too large'));
    await db.checkpoints.add({...row(app.world.id),label:checkpoint.trim(),backup:snapshot});
    checkpoint='';
  }
  async function changeActivity(activity:Settings['activity']) {
    if(activity==='paused') await app.stop();
    await app.save({activity});
  }
  async function reset() {
    if(!confirm(t('Удалить все вселенные, переписки и модели с этого устройства?','Delete all worlds, conversations and models from this device?'))) return;
    await app.stop();
    app.pauseDownload();
    while(app.downloadId) await new Promise(resolve=>setTimeout(resolve,100));
    try{const root=await navigator.storage.getDirectory();await root.removeEntry('rai-models',{recursive:true});}catch(error){if(!(error instanceof DOMException&&error.name==='NotFoundError')) throw error;}
    await db.delete();
    for(const key of await caches.keys()) if(key.startsWith('rai-app-')) await caches.delete(key);
    const registration=await navigator.serviceWorker?.getRegistration();
    await registration?.unregister();
    location.assign(location.pathname);
  }
</script>
<div class="main-heading"><div><h1>{t(heading[0],heading[1])}</h1><p>{t(heading[2],heading[3])}</p></div>
  {#if app.view==='universes'}<button class="primary small" onclick={()=>openWorld()}><Plus size={17}/>{t('Новая вселенная','New universe')}</button>{/if}
  {#if app.view==='characters'&&app.world}<button class="primary small" onclick={()=>openActor()}><Plus size={17}/>{t('Добавить','Add')}</button>{/if}
</div>

{#if app.view==='model'}
  <ModelPanel {app}/>
{:else if app.view==='universes'}
  {#if editor==='world'}
    <form class="panel card-form" onsubmit={event=>{event.preventDefault();void app.safe(saveWorld);}}>
      <h2>{editId?t('Редактор вселенной','Edit universe'):t('Настройте свою вселенную','Set up your universe')}</h2>
      {#if !editId}<div class="field-grid">
        <label>{t('Язык интерфейса','Interface language')}<select value={app.settings.language} onchange={event=>void app.save({language:event.currentTarget.value as Settings['language']})}><option value="ru">Русский</option><option value="en">English</option></select></label>
        <label>{t('Сценарий','Scenario')}<select bind:value={preset} onchange={usePreset}><option value="empty">{t('Чистый лист','Blank world')}</option><option value="signal">{t('Город после сигнала','City after the signal')}</option><option value="cafe">{t('Кафе у станции','Café by the station')}</option></select></label>
      </div>{/if}
      <label>{t('Название','Name')}<input bind:value={name} required maxlength="120"/></label><label>{t('Описание','Description')}<textarea rows="2" bind:value={description} maxlength="500"></textarea></label>
      <details><summary>{t('Лор и правила мира','Lore and world rules')}</summary><div class="field-grid">{#each Object.entries(worldLabels) as [key,label]}<label>{t(label,{genre:'Genre',era:'Era',geography:'Geography',rules:'Rules',lore:'Lore',plot:'Plot'}[key]??key)}<textarea rows="2" bind:value={details[key]} maxlength="4000"></textarea></label>{/each}</div></details>
      {#if editId}<label class="soft-button file-button"><ImagePlus size={17}/>{t('Обложка','Cover')}<input type="file" accept="image/*" onchange={event=>void app.safe(()=>addArt(event,'cover'))}/></label>{#if cover}<Media ids={[cover]} world={editId}/>{/if}
      {:else}
        <h3>{t('Ваш профиль','Your profile')}</h3><div class="field-grid"><label>{t('Имя','Name')}<input bind:value={personaName} required maxlength="120"/></label><label>Username<input bind:value={personaHandle} required maxlength="32"/></label></div>
        <details><summary>{t('Добавить первого персонажа','Add the first character')}</summary><div class="field-grid"><label>{t('Имя персонажа','Character name')}<input bind:value={characterName} maxlength="120"/></label><label>Username<input bind:value={characterHandle} maxlength="32"/></label></div><label>{t('Характер','Personality')}<textarea rows="2" bind:value={characterBio} maxlength="1000"></textarea></label></details>
      {/if}
      <div class="row-actions"><button type="button" class="soft-button" onclick={()=>editor=''}>{t('Отмена','Cancel')}</button><button class="primary small">{editId?t('Сохранить','Save'):t('Создать вселенную','Create universe')}</button></div>
    </form>
  {/if}
  {#each app.worlds as world (world.id)}
    <section class="panel card-form">
      <div class="panel-heading"><h2><Orbit size={18}/> {world.name}</h2><span class="chip">{world.archived?t('Архив','Archived'):world.id===app.world?.id?t('Активная','Active'):world.demo?t('Демо','Demo'):world.details.genre||t('Вселенная','Universe')}</span></div>
      <p class="muted">{world.description}</p>
      <div class="row-actions">
        {#if !world.archived&&world.id!==app.world?.id}<button class="primary small" onclick={()=>void app.safe(()=>app.selectWorld(world.id))}>{t('Открыть','Open')}<ArrowRight size={15}/></button>{/if}
        {#if !world.demo}<button class="soft-button" onclick={()=>openWorld(world)}><Pencil size={16}/>{t('Править','Edit')}</button><button class="icon" aria-label={t('Дублировать','Duplicate')} onclick={()=>void app.safe(()=>fork(world,t(' — копия',' — copy')))}><Copy size={17}/></button>{/if}
        <button class="icon" aria-label={t('Экспорт вселенной','Export universe')} onclick={()=>void app.safe(()=>archive(world.id))}><Download size={17}/></button>
        <button class="icon" aria-label={world.archived?t('Разархивировать','Unarchive'):t('Архивировать','Archive')} onclick={()=>void app.safe(async()=>{await db.universes.update(world.id,{archived:!world.archived});if(!world.archived&&world.id===app.world?.id){const next=app.worlds.find(item=>item.id!==world.id&&!item.archived);if(next) await app.selectWorld(next.id);else{await app.stop();await app.save({universe:'',persona:''});app.bind();}}})}><Archive size={17}/></button>
        <button class="icon" aria-label={t('Удалить вселенную','Delete universe')} onclick={()=>void app.safe(()=>erase(world))}><Trash2 size={17}/></button>
      </div>
    </section>
  {/each}
  <section class="panel card-form"><label class="soft-button file-button"><Upload size={17}/>{t('Импорт резервной копии','Import backup')}<input type="file" accept=".json,.zip" onchange={event=>void app.safe(async()=>{const file=await fileFrom(event);if(file) backup=await readBackup(file);})}/></label>
  {#if backup}<p>{backup.backup.data.universes?.map(item=>item.name).join(', ')} · {backup.media.length} {t('изображений','images')}</p><div class="row-actions"><button class="soft-button" onclick={()=>backup=undefined}>{t('Отмена','Cancel')}</button><button class="primary small" onclick={()=>void app.safe(async()=>{const id=await restore(backup!.backup,backup!.media);backup=undefined;await app.selectWorld(id);})}>{t('Импортировать копию','Import a copy')}</button></div>{/if}</section>

{:else if app.view==='characters'}
  <div class="row-actions section-spacing"><label class="soft-button file-button"><Upload size={17}/>{t('Импорт карточки','Import card')}<input type="file" accept=".json,.png" onchange={event=>void app.safe(()=>importCard(event))}/></label></div>
  {#if editor==='character'}
    <form class="panel card-form" onsubmit={event=>{event.preventDefault();void app.safe(saveActor);}}>
      <h2>{editId?t('Редактор персонажа','Edit character'):t('Новый персонаж','New character')}</h2>
      {#if !editId}<details><summary>{t('Создать по описанию','Draft from a description')}</summary><label>{t('Описание персонажа','Character description')}<textarea rows="2" bind:value={description} maxlength="650"></textarea></label><button type="button" class="soft-button" disabled={!description.trim()||!!app.running} onclick={()=>void app.safe(async()=>{const data=await app.describe(description);openActor({name:data.name,handle:data.handle,details:{bio:data.bio,speech:data.speech,personality:data.personality}});})}><Sparkles size={16}/>{t('Сгенерировать','Generate')}</button></details>{/if}
      <div class="field-grid"><label>{t('Имя','Name')}<input bind:value={name} maxlength="120" required/></label><label>Username<input bind:value={handle} maxlength="32" required/></label></div>
      <label>{t('Характер','Personality')}<textarea bind:value={details.personality} rows="2" maxlength="12000"></textarea></label>
      <label>{t('Манера речи','Speech style')}<textarea bind:value={details.speech} rows="2" maxlength="12000"></textarea></label>
      <details><summary>{t('Расширенные поля','Advanced fields')}</summary><div class="field-grid">{#each Object.entries(characterLabels).filter(([key])=>key!=='speech'&&key!=='personality') as [key,label]}<label>{t(label,key.replace(/([A-Z])/g,' $1').replace(/^./,char=>char.toUpperCase()))}{#if key==='frequency'||key==='initiative'}<input type="text" inputmode="decimal" bind:value={details[key]} placeholder={key==='frequency'?'0.1–3':'0–1'} maxlength="6"/>{:else}<textarea rows="2" bind:value={details[key]} maxlength="12000"></textarea>{/if}</label>{/each}</div></details>
      <div class="row-actions"><label class="soft-button file-button"><ImagePlus size={17}/>{t('Аватар','Avatar')}<input type="file" accept="image/*" onchange={event=>void app.safe(()=>addArt(event,'avatar'))}/></label><label class="soft-button file-button"><ImagePlus size={17}/>{t('Баннер','Banner')}<input type="file" accept="image/*" onchange={event=>void app.safe(()=>addArt(event,'banner'))}/></label></div>
      <div class="row-actions"><button type="button" class="soft-button" onclick={()=>editor=''}>{t('Отмена','Cancel')}</button><button class="primary small">{t('Сохранить','Save')}</button></div>
    </form>
  {/if}
  <section class="panel section-list">
    {#each app.actors.slice(0,limit) as actor (actor.id)}
      <div class="manage-line"><button class="roster-line" onclick={()=>app.go('profile',actor.id)}><Avatar {actor}/><span><strong>{actor.name}</strong><small>@{actor.handle}</small></span></button><div class="row-actions">
        <button class="icon" aria-label={t('Редактировать','Edit')} onclick={()=>openActor(actor,true)}><Pencil size={17}/></button>
        <button class="icon" aria-label={t('Дублировать','Duplicate')} onclick={()=>openActor({...actor,handle:actor.handle.slice(0,25)+'_copy'})}><Copy size={17}/></button>
        <button class="icon" aria-label={t('Экспорт персонажа','Export character')} onclick={()=>saveFile('rai-character.json',JSON.stringify(actor,null,2))}><Download size={17}/></button>
      </div></div>
    {:else}<div class="state-empty">{t('Добавьте первого персонажа','Add your first character')}</div>{/each}
  </section>

{:else if app.view==='relations'}
  <section class="panel card-form"><label class="tick-row"><input type="checkbox" bind:checked={observer}/>{t('Режим наблюдателя','Observer mode')}</label>
    <div class="field-grid"><label>{t('Кто испытывает','From')}<select bind:value={from} onchange={relation}><option value="">—</option>{#each people as item}<option value={item.id}>{item.name}</option>{/each}</select></label><label>{t('К кому','Toward')}<select bind:value={to} onchange={relation}><option value="">—</option>{#each people as item}<option value={item.id}>{item.name}</option>{/each}</select></label></div>
    <label>{t('Описание отношения','Relationship note')}<textarea bind:value={note} rows="2" maxlength="1000"></textarea></label>
    {#if observer}<div class="field-grid">{#each ties as key,i}<label>{t(['Доверие','Привязанность','Симпатия','Уважение','Романтический интерес','Ревность','Неприязнь','Соперничество','Близость','Конфликты'][i],key)} <small>{values[key]}</small><input type="range" min="-100" max="100" step="1" bind:value={values[key]}/></label>{/each}</div>{/if}
    <button class="primary small" disabled={!from||!to||from===to} onclick={()=>void app.safe(saveRelation)}>{t('Сохранить','Save')}</button>
  </section>
  <section class="panel section-list">
    {#each app.relationships.slice(0,limit) as edge}<button class="roster-line" onclick={()=>{from=edge.from;to=edge.to;relation();}}><span><strong>{app.people.get(edge.from)?.name} → {app.people.get(edge.to)?.name}</strong><small>{edge.note}</small></span><ChevronRight size={16}/></button>{:else}<p class="muted">{t('Связей пока нет','No relationships yet')}</p>{/each}
  </section>
  {#if observer}<section class="panel card-form"><h2>{t('Эмоциональные состояния','Emotional states')}</h2>{#each app.states as state}<details><summary>{app.people.get(state.owner)?.name}</summary><div class="field-grid">{#each Object.entries(state.values) as [key,value]}<span>{key}: {value.toFixed(1)}</span>{/each}</div></details>{:else}<p class="muted">{t('Появятся после взаимодействий','Appears after interactions')}</p>{/each}</section>{/if}

{:else if app.view==='memory'}
  <section class="panel card-form"><label class="tick-row"><input type="checkbox" bind:checked={observer}/>{t('Показать скрытые воспоминания','Show private memories')}</label>
  {#if observer}<label>{t('Владелец','Owner')}<select bind:value={memoryOwner}><option value="">{t('Все персонажи','All characters')}</option>{#each app.actors as actor}<option value={actor.id}>{actor.name}</option>{/each}</select></label><button class="soft-button" onclick={()=>saveFile('rai-memories.json',JSON.stringify(app.memories.filter(item=>!memoryOwner||item.owner===memoryOwner),null,2))}><Download size={16}/>{t('Экспорт воспоминаний','Export memories')}</button>{/if}
  </section>
  {#each app.memories.filter(item=>(observer||item.privacy==='world')&&(!memoryOwner||item.owner===memoryOwner)).slice(0,limit) as item (item.id)}
    <section class="panel card-form"><div class="panel-heading"><h2>{app.people.get(item.owner)?.name}</h2><small>{item.kind} · {new Date(item.at).toLocaleDateString(app.settings.language)}</small></div>
    {#if memoryEdit===item.id}<textarea bind:value={memoryText} rows="3" maxlength="12000"></textarea><button class="primary small" onclick={()=>void app.safe(async()=>{await db.memories.update(item.id,{text:memoryText});memoryEdit='';})}>{t('Сохранить','Save')}</button>{:else}<p>{item.text}</p>{/if}
    <div class="row-actions"><button class="soft-button" onclick={()=>void app.safe(()=>db.memories.update(item.id,{pinned:!item.pinned}))}>{item.pinned?t('Открепить','Unpin'):t('Закрепить','Pin')}</button><button class="icon" aria-label={t('Редактировать','Edit')} onclick={()=>{memoryEdit=item.id;memoryText=item.text;}}><Pencil size={16}/></button><button class="icon" aria-label={t('Удалить','Delete')} onclick={()=>{if(confirm(t('Удалить воспоминание?','Delete memory?'))) void app.safe(()=>db.memories.delete(item.id));}}><Trash2 size={16}/></button></div></section>
  {:else}<div class="state-empty"><Database size={24}/>{t('Нет видимых воспоминаний','No visible memories')}</div>{/each}

{:else if app.view==='story'}
  <form class="panel card-form" onsubmit={event=>{event.preventDefault();void app.safe(()=>saveEvent());}}><h2>{t('Событие мира','World event')}</h2><label>{t('Название','Title')}<input bind:value={eventTitle} maxlength="120" required/></label><label>{t('Что произошло','What happened')}<textarea rows="2" bind:value={eventText} maxlength="4000"></textarea></label><label>{t('Время внутри мира','In-world time')}<input type="datetime-local" bind:value={eventTime}/></label><div class="row-actions"><button class="primary small" disabled={!app.world}>{t('Добавить событие','Add event')}</button><button type="button" class="soft-button" onclick={()=>void app.safe(()=>saveEvent(true))}><Sparkles size={16}/>{t('Случайное событие','Random event')}</button></div></form>
  <section class="panel card-form"><h2>{t('Цели персонажей','Character goals')}</h2><select bind:value={goalActor}><option value="">—</option>{#each app.actors as actor}<option value={actor.id}>{actor.name}</option>{/each}</select><input bind:value={goalText} maxlength="500" placeholder={t('Текущая цель','Current goal')}/><button class="soft-button" disabled={!goalActor} onclick={()=>void app.safe(async()=>{const state=await db.character_states.get(goalActor);const values=state?.values??emptyFeelings;await db.character_states.put({...row(app.world!.id),id:goalActor,owner:goalActor,values,goal:goalText});})}>{t('Применить','Apply')}</button></section>
  <section class="panel card-form"><h2>{t('Хронология','Timeline')}</h2>{#each app.events.slice(0,limit) as item}<div class="timeline"><strong>{item.title}</strong><small>{new Date(item.virtual).toLocaleString(app.settings.language)}</small><p>{item.text}</p></div>{:else}<p class="muted">{t('Событий пока нет','No events yet')}</p>{/each}</section>
  <section class="panel card-form"><h2>{t('Контрольные точки','Checkpoints')}</h2><input bind:value={checkpoint} placeholder={t('Название точки','Checkpoint name')} maxlength="100"/><div class="row-actions"><button class="soft-button" disabled={!checkpoint.trim()} onclick={()=>void app.safe(saveCheckpoint)}>{t('Сохранить точку','Save checkpoint')}</button><button class="soft-button" disabled={!app.world} onclick={()=>void app.safe(()=>fork(app.world!,t(' — ветка',' — branch')))}><Copy size={16}/>{t('Создать ветку','Branch world')}</button></div>
    {#each app.checkpoints as item}<button class="roster-line" onclick={()=>void app.safe(async()=>{if(!confirm(t('Открыть контрольную точку в новой ветке?','Open this checkpoint as a new branch?'))) return;const id=await restore(validateBackup(JSON.parse(item.backup)),await scoped('media_assets',item.universeId).toArray(),t(' — '+item.label,' — '+item.label));await app.selectWorld(id);})}><span>{item.label}</span><ArrowRight size={16}/></button>{/each}
  </section>

{:else if app.view==='settings'}
  <div class="quick-links">{#each [['universes','Вселенные','Universes',Orbit],['characters','Персонажи','Characters',Sparkles],['relations','Отношения','Relationships',Globe2],['memory','Память','Memory',Database],['story','Сюжет','Story',Archive],['model','Нейросеть','Local AI',Zap],['saved','Закладки','Bookmarks',Archive]] as [view,ru,en,Icon]}<button class="soft-button" onclick={()=>app.go(view as View)}>{t(String(ru),String(en))}<ChevronRight size={15}/></button>{/each}</div>
  <section class="panel card-form"><h2>{t('Внешний вид','Appearance')}</h2>
    <div class="field-grid">
      <label>{t('Тема','Theme')}<select value={app.settings.theme} onchange={event=>void app.save({theme:event.currentTarget.value as Settings['theme']})}><option value="dark">{t('Тёмная','Dark')}</option><option value="light">{t('Светлая','Light')}</option><option value="system">{t('Системная','System')}</option></select></label>
      <label>{t('Плотность','Density')}<select value={app.settings.density} onchange={event=>void app.save({density:event.currentTarget.value as Settings['density']})}><option value="normal">{t('Обычная','Normal')}</option><option value="compact">{t('Компактная','Compact')}</option></select></label>
      <label>{t('Акцентный цвет','Accent color')}<input type="color" value={app.settings.accent} onchange={event=>void app.save({accent:event.currentTarget.value})}/></label>
      <label>{t('Размер текста','Text size')}<input type="range" min="13" max="20" value={app.settings.font} onchange={event=>void app.save({font:+event.currentTarget.value})}/></label>
    </div>
    <label class="tick-row"><input type="checkbox" checked={app.settings.motion} onchange={event=>void app.save({motion:event.currentTarget.checked})}/>{t('Анимации','Animations')}</label><label class="tick-row"><input type="checkbox" checked={app.settings.glass} onchange={event=>void app.save({glass:event.currentTarget.checked})}/>{t('Полупрозрачность навигации','Translucent navigation')}</label>
  </section>
  <section class="panel card-form"><h2>{t('Симуляция','Simulation')}</h2>
    <label>{t('Активность','Activity')}<select value={app.settings.activity} onchange={event=>{const value=event.currentTarget.value as Settings['activity'];void app.safe(()=>changeActivity(value));}}>{#each Object.entries({paused:t('Пауза','Paused'),calm:t('Спокойная','Calm'),normal:t('Обычная','Normal'),high:t('Высокая','High')}) as [value,label]}<option {value}>{label}</option>{/each}</select></label>
    <div class="field-grid"><label>{t('Активные агенты','Active agents')}<input type="number" min="1" max="50" value={app.settings.agents} onchange={event=>void app.save({agents:Math.max(1,Math.min(50,+event.currentTarget.value))})}/></label><label>{t('Догоняющие события (0 — выкл.)','Catch-up events (0 = off)')}<input type="number" min="0" max="10" value={app.settings.catchup} onchange={event=>void app.save({catchup:Math.min(10,Math.max(0,+event.currentTarget.value))})}/></label></div>
    <label class="tick-row"><input type="checkbox" checked={app.settings.autoPosts} onchange={event=>void app.save({autoPosts:event.currentTarget.checked})}/>{t('Автономные публикации','Autonomous posts')}</label><label class="tick-row"><input type="checkbox" checked={app.settings.autoDM} onchange={event=>void app.save({autoDM:event.currentTarget.checked})}/>{t('Автономные переписки','Autonomous chats')}</label>
    <div class="row-actions"><button class="soft-button" disabled={!!app.running || app.world?.demo || !app.models[app.settings.model]} onclick={()=>void app.safe(()=>app.step())}><Play size={16}/>{t('Запустить событие','Run an event')}</button><button class="soft-button" onclick={()=>void app.safe(()=>changeActivity('paused'))}><Pause size={16}/>{t('Пауза','Pause')}</button></div>
  </section>
  <section class="panel card-form"><h2>{t('Язык и память','Language and memory')}</h2><div class="field-grid">
    <label>{t('Язык интерфейса','Interface language')}<select value={app.settings.language} onchange={event=>void app.save({language:event.currentTarget.value as Settings['language']})}><option value="ru">Русский</option><option value="en">English</option></select></label>
    <label>{t('Язык персонажей','Character language')}<select value={app.settings.agentLanguage} onchange={event=>void app.save({agentLanguage:event.currentTarget.value as Settings['agentLanguage']})}><option value="ru">Русский</option><option value="en">English</option></select></label>
    <label>{t('Воспоминаний в запросе','Memories per prompt')}<input type="number" min="0" max="12" value={app.settings.memoryLimit} onchange={event=>void app.save({memoryLimit:Math.max(0,Math.min(12,+event.currentTarget.value))})}/></label>
  </div></section>
  <section class="panel card-form"><div class="panel-heading"><h2>{t('Данные и конфиденциальность','Data and privacy')}</h2><ShieldCheck size={20}/></div><p class="muted">{t('Переписки, профили и память сохраняются в браузере. Запросы наружу нужны для доставки приложения и выбранной модели. Safari может очистить локальные данные. Сохраняйте резервные копии перед сменой браузера или установкой на экран «Домой».','Messages, profiles and memories stay in your browser. Network requests deliver the app and the selected model. Safari may remove local data. Export a backup before switching browsers or adding the app to your Home Screen.')}</p>
    <div class="row-actions"><button class="soft-button" onclick={()=>void app.safe(()=>archive())}><Download size={16}/>{t('Экспорт сети','Export network')}</button><button class="soft-button" onclick={()=>app.go('universes')}><Upload size={16}/>{t('Импорт','Import')}</button><button class="soft-button" onclick={()=>app.go('model')}><Zap size={16}/>{t('Модели','Models')}</button><button class="soft-button" onclick={()=>void app.safe(reset)}><Trash2 size={16}/>{t('Удалить все данные','Delete all data')}</button></div>
  </section>
{/if}
{#if (app.view==='memory'&&app.memories.length>limit)||(app.view==='relations'&&app.relationships.length>limit)||(app.view==='story'&&app.events.length>limit)||(app.view==='characters'&&app.actors.length>limit)}
  <button class="soft-button load-more" onclick={()=>limit+=20}>{t('Показать ещё','Show more')}</button>
{/if}
