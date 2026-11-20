<script lang="ts">
  import {AtSign,ImagePlus,MessageCircle,Pencil,Plus,UserPlus} from 'lucide-svelte';
  import type {SocialApp} from '../app.svelte';
  import {db} from '../database/db';
  import {addImage} from '../database/files';
  import {follow} from '../database/social';
  import {actorSchema,type Records} from '../database/schema';
  import Avatar from './Avatar.svelte';
  import Post from './Post.svelte';
  import Media from './Media.svelte';
  let {app,edit,quote,lookup}:{app:SocialApp;edit:(item:Records['posts'])=>void;quote:(item:Records['posts'])=>void;lookup:(text:string)=>void}=$props();
  const t=(ru:string,en:string)=>app.t(ru,en);
  const actor=$derived(app.people.get(app.target)||(!app.target?app.persona:undefined));
  const own=$derived(actor?.id===app.persona?.id);
  const follows=$derived(app.follows.some(item=>item.from===app.persona?.id&&item.to===actor?.id));
  const posts=$derived(app.posts.filter(item=>item.author===actor?.id).sort((a,b)=>Number(b.id===actor?.pinned)-Number(a.id===actor?.pinned)||b.at-a.at));
  let editing=$state(false),creating=$state(false),name=$state(''),handle=$state(''),bio=$state(''),avatar=$state<string|undefined>(),banner=$state<string|undefined>(),mediaOnly=$state(false),limit=$state(12);
  function form(create=false) {
    creating=create;editing=true;name=create?'':actor?.name??'';handle=create?'':actor?.handle??'';bio=create?'':actor?.details.bio??'';avatar=create?undefined:actor?.avatar;banner=create?undefined:actor?.banner;
  }
  async function attach(event:Event,key:'avatar'|'banner') {
    const file=(event.currentTarget as HTMLInputElement).files?.[0];
    if(!file||!actor) return;
    const id=await addImage(actor.universeId,file);
    if(key==='avatar') avatar=id;else banner=id;
  }
  async function save() {
    if(creating) await app.addPersona(name.trim(),handle.trim());
    else if(own && actor) {
      const saved=actorSchema.parse({...actor,name:name.trim(),handle:handle.trim(),avatar,banner,details:{...actor.details,bio}});
      await db.user_personas.put(saved);
    }
    editing=false;
  }
</script>
<div class="main-heading"><div><h1>{t('Профиль','Profile')}</h1><p>{own?t('Ваша персона в этой вселенной','Your persona in this universe'):t('Участник вселенной','Universe member')}</p></div>{#if own}<button class="soft-button" onclick={()=>form()}><Pencil size={17}/>{t('Редактировать','Edit')}</button>{/if}</div>
{#if actor}
  <section class="panel profile-card"><div class="profile-cover">{#if actor.banner}<Media ids={[actor.banner]} world={actor.universeId} cover/>{/if}</div><div class="profile-body">
    <Avatar {actor} size={80}/>
    <div class="profile-controls">
      {#if !own}
        <button class="soft-button" onclick={()=>void app.safe(()=>app.openChat([actor!.id]))}><MessageCircle size={17}/>{t('Написать','Message')}</button>
        <button class="primary small" onclick={()=>void app.safe(()=>follow(actor!.universeId,app.persona!.id,actor!.id))}><UserPlus size={17}/>{follows?t('Вы подписаны','Following'):t('Подписаться','Follow')}</button>
      {:else}<button class="soft-button" onclick={()=>form(true)}><Plus size={17}/>{t('Новая персона','New persona')}</button>{/if}
    </div>
    <h2>{actor.name}</h2><small class="muted">@{actor.handle}</small><p>{actor.details.bio}</p>
    <div class="row-actions"><span><strong>{app.follows.filter(item=>item.to===actor?.id).length}</strong> {t('подписчиков','followers')}</span><span><strong>{app.follows.filter(item=>item.from===actor?.id).length}</strong> {t('подписок','following')}</span></div>
  </div></section>
  {#if own&&app.personas.length>1}<label class="panel card-form">{t('Активная персона','Active persona')}<select value={actor.id} onchange={event=>{const id=event.currentTarget.value;void app.safe(async()=>{await app.save({persona:id});app.go('profile',id);});}}>{#each app.personas as item}<option value={item.id}>{item.name}</option>{/each}</select></label>{/if}
  {#if editing}<form class="panel card-form" onsubmit={event=>{event.preventDefault();void app.safe(save);}}>
    <h2>{creating?t('Новая персона','New persona'):t('Редактировать профиль','Edit profile')}</h2>
    <label>{t('Имя','Name')}<input bind:value={name} required maxlength="120"/></label><label>Username<input bind:value={handle} required maxlength="32"/></label>
    {#if !creating}<label>{t('Биография','Bio')}<textarea bind:value={bio} rows="2" maxlength="500"></textarea></label><div class="row-actions">
      <label class="soft-button file-button"><ImagePlus size={17}/>{t('Аватар','Avatar')}<input type="file" accept="image/*" onchange={event=>void app.safe(()=>attach(event,'avatar'))}/></label>
      <label class="soft-button file-button"><ImagePlus size={17}/>{t('Баннер','Banner')}<input type="file" accept="image/*" onchange={event=>void app.safe(()=>attach(event,'banner'))}/></label>
    </div>{/if}
    <div class="row-actions"><button type="button" class="soft-button" onclick={()=>editing=false}>{t('Отмена','Cancel')}</button><button class="primary small">{t('Сохранить','Save')}</button></div>
  </form>{/if}
  <div class="feed-tabs"><button class:chosen={!mediaOnly} onclick={()=>mediaOnly=false}>{t('Публикации','Posts')}</button><button class:chosen={mediaOnly} onclick={()=>mediaOnly=true}>{t('Медиа','Media')}</button></div>
  {#each posts.filter(item=>!mediaOnly||item.media.length||item.art).slice(0,limit) as item (item.id)}<Post {app} {item} {lookup} edit={()=>edit(item)} quote={()=>quote(item)}/>{:else}<div class="state-empty"><AtSign size={24}/>{t('Пока ничего нет','Nothing here yet')}</div>{/each}
  {#if posts.length>limit}<button class="soft-button load-more" onclick={()=>limit+=12}>{t('Показать ещё','Show more')}</button>{/if}
{:else}<div class="state-empty">{t('Профиль не найден','Profile not found')}</div>{/if}
