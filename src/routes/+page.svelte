<script lang="ts">
  import {onMount} from 'svelte';
  import {asset} from '$app/paths';
  import {ArrowDownWideNarrow,ArrowLeft,ArrowRight,Bell,Bookmark,ChevronDown,Clock,Globe2,ImagePlus,LoaderCircle,MessageCircle,Orbit,Plus,Search,Send,Sparkles,X,Zap} from 'lucide-svelte';
  import {SocialApp} from '../lib/app.svelte';
  import Avatar from '../lib/components/Avatar.svelte';
  import Shell from '../lib/components/Shell.svelte';
  import Post from '../lib/components/Post.svelte';
  import Text from '../lib/components/Text.svelte';
  import Media from '../lib/components/Media.svelte';
  import {db} from '../lib/database/db';
  import {addImage} from '../lib/database/files';
  import type {Records} from '../lib/database/schema';
  import './global.css';

  const app=new SocialApp();
  const t=app.t;
  let tab=$state<'all'|'following'>('all');
  let recommended=$state(false);
  let query=$state('');
  let limit=$state(12);
  let compose=$state(false);
  let draft=$state('');
  let media=$state<string[]>([]);
  let edit=$state('');
  let quote=$state('');
  let loadingMedia=$state(false);
  let commentDraft=$state('');
  let parent=$state('');
  let dialog=$state<HTMLDialogElement>();
  let inline=$state<HTMLTextAreaElement>();
  const currentPost=$derived(app.posts.find(item=>item.id===app.target));
  const saved=$derived(app.reactions.filter(item=>item.kind==='bookmark'&&item.actor===app.persona?.id).map(item=>item.target));
  const following=$derived(app.follows.filter(item=>item.from===app.persona?.id).map(item=>item.to));
  const feed=$derived.by(()=>{
    const posts=app.posts.filter(item=>tab==='all'||following.includes(item.author)||item.author===app.persona?.id||app.reactions.some(reaction=>reaction.target===item.id&&reaction.kind==='repost'&&following.includes(reaction.actor)));
    if(!recommended) return posts;
    const score=(id:string)=>app.reactions.filter(entry=>entry.target===id&&entry.kind==='like').length + app.comments.filter(entry=>entry.post===id).length;
    return posts.sort((a,b)=>score(b.id)-score(a.id)||b.at-a.at);
  });
  const tagQuery=$derived(app.view==='search' ? decode(app.target) : '');
  const match=$derived((query||tagQuery).trim().toLocaleLowerCase());
  const actorResults=$derived(app.actors.filter(actor=>!match||[actor.name,'@'+actor.handle,actor.details.bio].some(item=>item?.toLocaleLowerCase().includes(match))));
  const postResults=$derived(app.posts.filter(item=>!match||item.text.toLocaleLowerCase().includes(match)));
  const alerts=$derived(app.alerts.filter(item=>item.recipient===app.persona?.id));
  const grouped=$derived(alerts.filter((item,i)=>alerts.findIndex(other=>other.kind===item.kind&&other.target===item.target&&other.read===item.read)===i));
  onMount(()=>{
    void app.safe(()=>app.start());
    return ()=>app.destroy();
  });
  $effect(()=>{document.documentElement.lang=app.settings.language;});
  $effect(()=>{
    if(compose&&!dialog?.open) dialog?.showModal();
    if(!compose&&dialog?.open) dialog.close();
  });
  function decode(text:string) {try{return decodeURIComponent(text);}catch{return '';}}
  function lookup(value:string) {query='';app.go('search',encodeURIComponent(value));}
  function openCompose(item?:Records['posts'],asQuote=false) {
    draft=asQuote?'':item?.text??'';
    media=asQuote?[]:[...(item?.media??[])];
    edit=asQuote?'':item?.id??'';
    quote=asQuote?item?.id??'':item?.quote??'';
    compose=true;
  }
  async function attach(event:Event) {
    const input=event.currentTarget as HTMLInputElement;
    const world=app.world;
    if(!world) return;
    loadingMedia=true;
    try{for(const file of Array.from(input.files??[]).slice(0,4-media.length)) media=[...media,await addImage(world.id,file)];}
    finally{loadingMedia=false;input.value='';}
  }
  async function submit() {
    if(!draft.trim()&&!media.length&&!quote) return;
    await app.publish(draft,media,quote||undefined,edit||undefined);
    compose=false;
    draft='';media=[];quote='';edit='';
    app.notify(t('Публикация сохранена','Post saved'));
    if(app.view!=='post') app.go('feed');
  }
  async function markAlerts() {
    await db.notifications.where('recipient').equals(app.persona?.id??'').modify({read:true});
  }
  const kinds={message:['Новое сообщение','New message'],comment:['Комментарий','Comment'],reply:['Ответ','Reply'],like:['Отметка «Нравится»','Like'],follow:['Новый подписчик','New follower'],mention:['Упоминание','Mention'],repost:['Репост','Repost'],world:['Событие мира','World event']} as const;
  async function openAlert(item:Records['notifications']) {
    await db.notifications.where('target').equals(item.target).filter(entry=>entry.recipient===item.recipient).modify({read:true});
    if(item.kind==='message'){await app.readChat(item.target);app.go('messages',item.target);}
    else if(item.kind==='follow') app.go('profile',item.actor);
    else if(item.kind==='world') app.go('story');
    else app.go('post',item.target);
  }
  const clock=$derived(app.world?new Intl.DateTimeFormat(app.settings.language==='ru'?'ru-RU':'en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'}).format(app.world.clock):'');
</script>
<svelte:head><title>R.AI Social</title><meta name="description" content="Локальная социальная сеть для ваших вселенных и персонажей."/></svelte:head>
<div class="app-theme" data-theme={app.settings.theme} class:compact={app.settings.density==='compact'} class:no-motion={!app.settings.motion} class:no-glass={!app.settings.glass} style:--accent={app.settings.accent} style:--text-size="{app.settings.font}px">
<Shell {app} compose={()=>openCompose()}>
  {#snippet children()}
    {#if !app.ready}
      <div class="state-empty">{#if app.error}{app.error}{:else}<LoaderCircle class="spin" size={24}/>{t('Открываем вашу вселенную','Opening your universe')}{/if}</div>
    {:else if app.view==='feed'}
      <div class="main-heading"><div><h1>{t('Главная','Home')}</h1><p>{t('Лента вашей вселенной','Your universe feed')}</p></div><button class="soft-button sort" onclick={()=>recommended=!recommended}><ArrowDownWideNarrow size={16}/><span>{recommended?t('Рекомендации','For you'):t('Сначала новые','Latest first')}</span><ChevronDown size={14}/></button></div>
      <section class="hero" style:--hero="url('{asset('media/city.webp')}')">
        {#if app.world?.cover}<Media ids={[app.world.cover]} world={app.world.id} cover/>{/if}
        <div class="hero-content"><span class="hero-label"><Orbit size={13}/>{t('АКТИВНАЯ ВСЕЛЕННАЯ','ACTIVE UNIVERSE')}</span>{#if app.world?.demo}<span class="hero-label demo-label">{t('ДЕМО','DEMO')}</span>{/if}
          <h2>{app.world?.name??'—'}</h2><p>{app.world?.description}</p>
          <div class="hero-meta"><span><Globe2 size={13}/>{app.world?.details.genre||t('Свой мир','Original world')}</span><span><Clock size={13}/>{app.world?.demo?'2147 · ':''}{clock}</span></div>
        </div>
        <button class="hero-open icon" aria-label={t('Открыть вселенную','Open universe')} onclick={()=>app.go('universes')}><ArrowRight size={19}/></button>
      </section>
      <div class="feed-tabs" aria-label={t('Фильтр ленты','Feed filter')}>
        <button class:chosen={tab==='all'} onclick={()=>{tab='all';limit=12;}}>{t('Общая лента','All posts')}</button>
        <button class:chosen={tab==='following'} onclick={()=>{tab='following';limit=12;}}>{t('Подписки','Following')}</button>
        <span></span><button class="icon feed-action" aria-label={t('Управление нейросетью','AI settings')} onclick={()=>app.go('model')}><Sparkles size={17}/></button>
      </div>
      <form class="composer panel" onsubmit={event=>{event.preventDefault();void app.safe(submit);}}>
        <Avatar actor={app.persona} size={41}/>
        <div><textarea bind:this={inline} bind:value={draft} aria-label={t('Текст публикации','Post text')} placeholder={t('Что происходит в вашей вселенной?','What’s happening in your universe?')} rows="1" maxlength="4000"></textarea>
          <div class="composer-actions"><button type="button" class="icon" aria-label={t('Добавить изображение','Add image')} onclick={()=>{edit='';quote='';compose=true;}}><ImagePlus size={19}/></button><button type="button" class="icon" aria-label={t('Добавить хештег','Add hashtag')} onclick={()=>{draft+=(draft?' ':'')+'#';inline?.focus();}}><span class="hash-icon">#</span></button><span></span><button class="primary small" type="submit" disabled={!draft.trim()}>{t('Опубликовать','Post')}</button></div>
        </div>
      </form>
      {#each feed.slice(0,limit) as item (item.id)}<Post {app} {item} {lookup} edit={()=>openCompose(item)} quote={()=>openCompose(item,true)}/>{:else}<div class="state-empty"><MessageCircle size={24}/>{t('Здесь появятся публикации','Posts will appear here')}</div>{/each}
      {#if feed.length>limit}<button class="soft-button load-more" onclick={()=>limit+=12}>{t('Показать ещё','Show more')}</button>{/if}
    {:else if app.view==='search'}
      <div class="main-heading"><div><h1>{t('Поиск','Explore')}</h1><p>{t('Люди, публикации и хештеги','People, posts and hashtags')}</p></div></div>
      <label class="search-field panel"><Search size={19}/><input type="search" aria-label={t('Поиск по вселенной','Search the universe')} value={query||tagQuery} oninput={event=>{if(app.target) app.go('search');query=event.currentTarget.value;}} placeholder={t('Поиск по вселенной','Search the universe')}/></label>
      {#if actorResults.length}<section class="panel section-list"><h2>{t('Персонажи','Characters')}</h2>{#each actorResults.slice(0,16) as actor}<button class="roster-line" onclick={()=>app.go('profile',actor.id)}><Avatar {actor}/><span><strong>{actor.name}</strong><small>@{actor.handle}</small></span><ArrowRight size={16}/></button>{/each}</section>{/if}
      {#each postResults.slice(0,limit) as item (item.id)}<Post {app} {item} {lookup} edit={()=>openCompose(item)} quote={()=>openCompose(item,true)}/>{:else}{#if !actorResults.length}<div class="state-empty">{t('Ничего не найдено','No results')}</div>{/if}{/each}
      {#if postResults.length>limit}<button class="soft-button load-more" onclick={()=>limit+=12}>{t('Показать ещё','Show more')}</button>{/if}
    {:else if app.view==='saved'}
      <div class="main-heading"><div><h1>{t('Закладки','Bookmarks')}</h1><p>{t('Ваши сохранённые публикации','Your saved posts')}</p></div></div>
      {#each app.posts.filter(item=>saved.includes(item.id)).slice(0,limit) as item (item.id)}<Post {app} {item} {lookup} edit={()=>openCompose(item)} quote={()=>openCompose(item,true)}/>{:else}<div class="state-empty"><Bookmark size={24}/>{t('Сохраните публикации, чтобы вернуться к ним','Save posts to come back to them')}</div>{/each}
      {#if saved.length>limit}<button class="soft-button load-more" onclick={()=>limit+=12}>{t('Показать ещё','Show more')}</button>{/if}
    {:else if app.view==='alerts'}
      <div class="main-heading"><div><h1>{t('Уведомления','Notifications')}</h1><p>{t('Активность в вашей вселенной','Activity in your universe')}</p></div><button class="soft-button" onclick={()=>void app.safe(markAlerts)}>{t('Прочитать все','Mark all read')}</button></div>
      <div class="panel section-list">{#each grouped.slice(0,limit) as item (item.id)}<button class="roster-line alert-line" onclick={()=>void app.safe(()=>openAlert(item))}><Avatar actor={app.people.get(item.actor)}/><span><strong>{t(kinds[item.kind][0],kinds[item.kind][1])}{!item.read?' •':''}</strong><small>{app.people.get(item.actor)?.name} · {new Date(item.at).toLocaleString(app.settings.language)} {alerts.filter(other=>other.kind===item.kind&&other.target===item.target&&other.read===item.read).length>1?' · ×'+alerts.filter(other=>other.kind===item.kind&&other.target===item.target&&other.read===item.read).length:''}</small></span><ArrowRight size={16}/></button>{:else}<div class="state-empty"><Bell size={24}/>{t('Уведомлений пока нет','No notifications yet')}</div>{/each}</div>
      {#if grouped.length>limit}<button class="soft-button load-more" onclick={()=>limit+=12}>{t('Показать ещё','Show more')}</button>{/if}
    {:else if app.view==='post'}
      <div class="main-heading"><div><button class="back icon" onclick={()=>app.go('feed')} aria-label={t('Назад','Back')}><ArrowLeft size={22}/></button><h1>{t('Публикация','Post')}</h1></div></div>
      {#if currentPost}
        <Post {app} item={currentPost} {lookup} edit={()=>openCompose(currentPost)} quote={()=>openCompose(currentPost,true)}/>
        <form class="panel card-form" onsubmit={event=>{event.preventDefault();void app.safe(async()=>{await app.replyPost(currentPost.id,commentDraft,parent||undefined);commentDraft='';parent='';});}}>
          {#if parent}<button class="chip" type="button" onclick={()=>parent=''}>{t('Ответ на комментарий','Replying to comment')} <X size={14}/></button>{/if}
          <textarea aria-label={t('Ваш комментарий','Your comment')} placeholder={t('Напишите комментарий','Write a comment')} bind:value={commentDraft} maxlength="4000" rows="2" required></textarea><button class="primary small" type="submit"><Send size={15}/>{t('Ответить','Reply')}</button>
        </form>
        <div class="panel section-list">
          {#each app.comments.filter(item=>item.post===currentPost.id).slice(-limit) as item (item.id)}
            <div class="comment-line" class:nested={!!item.parent}>
              <Avatar actor={app.people.get(item.author)} size={33}/><div><strong>{app.people.get(item.author)?.name}</strong>{#if item.parent}<small>{t(' в ответ на комментарий',' in reply to a comment')}</small>{/if}<p><Text text={item.text} {lookup}/></p><button class="text-link" onclick={()=>parent=item.id}>{t('Ответить','Reply')}</button></div>
            </div>
          {:else}<p class="muted">{t('Комментариев пока нет','No comments yet')}</p>{/each}
          {#if app.comments.filter(item=>item.post===currentPost.id).length>limit}<button class="text-link" onclick={()=>limit+=12}>{t('Показать ещё','Show more')}</button>{/if}
        </div>
      {:else}<div class="state-empty">{t('Публикация не найдена','Post not found')}</div>{/if}
    {:else if app.view==='messages'}
      {#await import('../lib/components/Messages.svelte')}<div class="state-empty"><LoaderCircle class="spin" size={22}/></div>{:then {default:Messages}}<Messages {app}/>{/await}
    {:else if app.view==='profile'}
      {#await import('../lib/components/Profile.svelte')}<div class="state-empty"><LoaderCircle class="spin" size={22}/></div>{:then {default:Profile}}<Profile {app} {lookup} edit={item=>openCompose(item)} quote={item=>openCompose(item,true)}/>{/await}
    {:else}
      {#await import('../lib/components/Workspace.svelte')}<div class="state-empty"><LoaderCircle class="spin" size={22}/></div>{:then {default:Workspace}}<Workspace {app}/>{/await}
    {/if}
  {/snippet}
</Shell>
<dialog bind:this={dialog} onclose={()=>compose=false} class="compose-dialog">
  <form class="card-form" onsubmit={event=>{event.preventDefault();void app.safe(submit);}}>
    <div class="dialog-heading"><h2>{edit?t('Редактировать пост','Edit post'):t('Новая публикация','New post')}</h2><button class="icon" type="button" aria-label={t('Закрыть','Close')} onclick={()=>compose=false}><X size={21}/></button></div>
    <textarea bind:value={draft} aria-label={t('Текст публикации','Post text')} placeholder={t('Что происходит в вашей вселенной?','What’s happening in your universe?')} maxlength="4000" rows="5"></textarea>
    {#if quote}<div class="quote-card">{app.posts.find(item=>item.id===quote)?.text.slice(0,130)}</div>{/if}
    <Media ids={media} world={app.world?.id??''}/>
    <div class="row-actions"><label class="soft-button file-button" aria-label={t('Изображения','Images')}><ImagePlus size={17}/>{t('Изображения','Images')}<input type="file" accept="image/*" multiple onchange={event=>void app.safe(()=>attach(event))}/></label>
      {#if media.length}<button class="icon" type="button" aria-label={t('Убрать изображения','Remove images')} onclick={()=>media=[]}><X size={18}/></button>{/if}
      <button class="primary small push" type="submit" disabled={loadingMedia||(!draft.trim()&&!media.length&&!quote)}>{t('Опубликовать','Post')}</button>
    </div>
  </form>
</dialog>
{#if app.error||app.notice}<div class="toast" class:error={!!app.error} role="status"><span>{app.error||app.notice}</span><button class="icon" aria-label={t('Закрыть','Close')} onclick={()=>{app.error='';app.notice='';}}><X size={17}/></button></div>{/if}
</div>
