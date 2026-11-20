<script lang="ts">
  import {asset} from '$app/paths';
  import {Bookmark,Ellipsis,Heart,MessageCircle,Repeat2,Send,Quote,Pencil,Trash2,Pin,Sparkles} from 'lucide-svelte';
  import type {SocialApp} from '../app.svelte';
  import type {Records} from '../database/schema';
  import {db} from '../database/db';
  import {react,removePost} from '../database/social';
  import Avatar from './Avatar.svelte';
  import Media from './Media.svelte';
  import Text from './Text.svelte';
  let {app,item,edit,quote,lookup}:{app:SocialApp;item:Records['posts'];edit:()=>void;quote:()=>void;lookup:(text:string)=>void}=$props();
  let menu=$state(false);
  const author=$derived(app.people.get(item.author));
  const own=$derived(item.author===app.persona?.id);
  const commentCount=$derived(app.comments.filter(entry=>entry.post===item.id).length);
  const reactions=$derived(app.reactions.filter(entry=>entry.target===item.id));
  const quoted=$derived(app.posts.find(entry=>entry.id===item.quote));
  const count=(kind:string)=>reactions.filter(entry=>entry.kind===kind).length;
  const reacted=(kind:string)=>reactions.some(entry=>entry.kind===kind&&entry.actor===app.persona?.id);
  const act=(kind:Records['reactions']['kind'])=>void app.safe(()=>react(item.universeId,app.persona!.id,item.id,kind));
  const elapsed=$derived(Math.max(1,Math.floor((Date.now()-item.at)/60000)));
  const timestamp=$derived(elapsed<60?elapsed+app.t(' мин','m'):elapsed<1440?Math.floor(elapsed/60)+app.t(' ч','h'):new Date(item.at).toLocaleDateString(app.settings.language));
</script>
<article class="post-card">
  <button class="icon avatar-button" aria-label={author?.name} onclick={()=>app.go('profile',item.author)}><Avatar actor={author} size={42}/></button>
  <div class="post-main">
    <header class="post-header">
      <div class="post-author">
        <button class="author-name" onclick={()=>app.go('profile',item.author)}>{author?.name??app.t('Участник','Member')}</button>
        {#if app.actors.some(actor=>actor.id===item.author)}<span class="ai-tag">AI</span>{/if}
        <span class="post-handle">@{author?.handle??'unknown'}</span><b class="separator">·</b><time>{timestamp}</time>
        {#if item.edited}<span class="post-handle"> · {app.t('изменено','edited')}</span>{/if}
      </div>
      <div class="menu-anchor">
        <button class="icon" aria-label={app.t('Действия публикации','Post actions')} onclick={()=>menu=!menu}><Ellipsis size={19}/></button>
        {#if menu}<div class="popup">
          <button onclick={()=>{menu=false;quote();}}><Quote size={15}/>{app.t('Цитировать','Quote')}</button>
          <button onclick={()=>{menu=false;app.go('post',item.id);}}><MessageCircle size={15}/>{app.t('Открыть','Open post')}</button>
          {#if own}
            <button onclick={()=>{menu=false;edit();}}><Pencil size={15}/>{app.t('Редактировать','Edit')}</button>
            <button onclick={()=>{menu=false;void app.safe(()=>db.user_personas.update(item.author,{pinned:app.persona?.pinned===item.id?undefined:item.id}));}}><Pin size={15}/>{app.t('Закрепить','Pin')}</button>
            <button onclick={()=>{menu=false;if(confirm(app.t('Удалить публикацию?','Delete this post?'))) void app.safe(()=>removePost(item.universeId,item.author,item.id));}}><Trash2 size={15}/>{app.t('Удалить','Delete')}</button>
          {/if}
          {#if app.actors.length && !app.world?.demo && app.models[app.settings.model]}
            <button onclick={()=>{menu=false;void app.safe(()=>app.run(app.actors.find(actor=>actor.id!==item.author)??app.actors[0],'COMMENT',item.id));}}><Sparkles size={15}/>{app.t('Ответ агента','Agent reply')}</button>
          {/if}
        </div>{/if}
      </div>
    </header>
    {#if item.text}<p class="post-text"><Text text={item.text} {lookup}/></p>{/if}
    {#if item.art}<img class="post-art" src={asset(item.art==='city'?'media/city.webp':'media/signal.webp')} alt={app.t('Ночной город','City at night')} loading="lazy"/>{/if}
    <Media ids={item.media} world={item.universeId}/>
    {#if quoted}<button class="quote-card" onclick={()=>app.go('post',quoted.id)}><strong>{app.people.get(quoted.author)?.name}</strong><span>{quoted.text.slice(0,240)}</span></button>{/if}
    <footer class="post-actions">
      <button class="icon with-count" aria-label={app.t('Комментарии','Comments')} onclick={()=>app.go('post',item.id)}><MessageCircle size={17}/><span>{commentCount||''}</span></button>
      <button class="icon with-count" class:active={reacted('repost')} aria-label={app.t('Репост','Repost')} aria-pressed={reacted('repost')} onclick={()=>act('repost')}><Repeat2 size={18}/><span>{count('repost')||''}</span></button>
      <button class="icon with-count heart" class:active={reacted('like')} aria-label={app.t('Нравится','Like')} aria-pressed={reacted('like')} onclick={()=>act('like')}><Heart size={17}/><span>{count('like')||''}</span></button>
      <span></span>
      <button class="icon" class:active={reacted('bookmark')} aria-label={app.t('В закладки','Bookmark')} aria-pressed={reacted('bookmark')} onclick={()=>act('bookmark')}><Bookmark size={17}/></button>
      <button class="icon" aria-label={app.t('Копировать текст','Copy text')} onclick={()=>void app.safe(async()=>{await navigator.clipboard.writeText(item.text);app.notify(app.t('Текст скопирован','Text copied'));})}><Send size={16}/></button>
    </footer>
  </div>
</article>
