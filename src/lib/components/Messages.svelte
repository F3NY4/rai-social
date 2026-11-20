<script lang="ts">
  import {untrack} from 'svelte';
  import {ArrowLeft,CheckCheck,Heart,ImagePlus,MessageCircle,Pencil,Pin,Plus,RefreshCw,Reply,Search,Send,Square,Trash2,X} from 'lucide-svelte';
  import type {SocialApp} from '../app.svelte';
  import {db,scoped} from '../database/db';
  import {react} from '../database/social';
  import {addImage,saveFile} from '../database/files';
  import Avatar from './Avatar.svelte';
  import Media from './Media.svelte';
  let {app}:{app:SocialApp}=$props();
  const t=(ru:string,en:string)=>app.t(ru,en);
  const own=$derived(app.persona?.id??'');
  const joined=$derived(app.memberships.filter(item=>item.actor===own).map(item=>item.conversation));
  const chats=$derived(app.chats.filter(item=>joined.includes(item.id)));
  const selected=$derived(chats.find(item=>item.id===app.chat));
  const selectedId=$derived(selected?.id);
  const members=$derived(app.memberships.filter(item=>item.conversation===selected?.id).map(item=>item.actor));
  const peers=$derived(app.actors.filter(item=>members.includes(item.id)));
  let draft=$state('');
  let query=$state('');
  let title=$state('');
  let recipients=$state<string[]>([]);
  let creating=$state(false);
  let reply=$state('');
  let edit=$state('');
  let media=$state<string[]>([]);
  let limit=$state(30);
  let attaching=$state(false);
  let alternate=$state<{id:string;text:string}>();
  const latestMessage=$derived(app.messages.findLast(item=>item.conversation===selectedId));
  const history=$derived(app.messages.filter(item=>item.conversation===selected?.id&&(!query||item.text.toLowerCase().includes(query.toLowerCase()))));
  const name=(id:string)=>app.chats.find(item=>item.id===id)?.title || app.memberships.filter(item=>item.conversation===id&&item.actor!==own).map(item=>app.people.get(item.actor)?.name).filter(Boolean).join(', ');
  $effect(()=>{
    const id=selectedId;
    if(id) untrack(()=>void app.safe(()=>app.readChat(id)));
    draft='';query='';reply='';edit='';media=[];limit=30;alternate=undefined;
  });
  async function send() {
    if(!selected) return;
    await app.send(selected.id,draft,media,reply||undefined,edit||undefined);
    draft='';media=[];reply='';edit='';
  }
  async function attach(event:Event) {
    const input=event.currentTarget as HTMLInputElement;
    if(!selected) return;
    attaching=true;
    try {for(const file of Array.from(input.files??[]).slice(0,4-media.length)) media=[...media,await addImage(selected.universeId,file)];}
    finally{input.value='';attaching=false;}
  }
  async function remove(id:string) {
    const entry=await db.messages.get(id);
    if(!selected||entry?.author!==own||entry.conversation!==selected.id) return;
    await db.transaction('rw',db.messages,db.memories,db.reactions,async()=>{
      await db.messages.delete(id);
      await scoped('memories',entry.universeId).filter(item=>item.source===id||item.related.includes(id)).delete();
      await db.reactions.where('target').equals(id).delete();
    });
  }
</script>
{#if selected}
  <div class="main-heading"><div><button class="back icon" aria-label={t('Назад','Back')} onclick={()=>app.go('messages')}><ArrowLeft size={22}/></button><h1>{name(selected.id)||t('Переписка','Conversation')}</h1><p>{selected.group?t('Групповой чат','Group chat'):t('Личные сообщения','Direct messages')}</p></div><div class="row-actions"><button class="icon" class:active={selected.pinned} aria-label={t('Закрепить чат','Pin chat')} onclick={()=>void app.safe(()=>db.conversations.update(selected.id,{pinned:!selected.pinned}))}><Pin size={19}/></button><button class="soft-button" onclick={()=>saveFile('rai-messages.json',JSON.stringify(app.messages.filter(item=>item.conversation===selected.id),null,2))}>{t('Экспорт','Export')}</button></div></div>
  <label class="search-field panel"><Search size={17}/><input type="search" bind:value={query} placeholder={t('Поиск в переписке','Search messages')}/></label>
  <section class="panel chat-content">
    {#if history.length>limit}<button class="soft-button" onclick={()=>limit+=30}>{t('Ранние сообщения','Earlier messages')}</button>{/if}
    {#each history.slice(-limit) as item (item.id)}
      <div class="bubble-row" class:own={item.author===own}>
        {#if item.author!==own}<Avatar actor={app.people.get(item.author)} size={31}/>{/if}
        <div class="bubble">
          {#if selected.group&&item.author!==own}<strong>{app.people.get(item.author)?.name}</strong>{/if}
          {#if item.reply}<blockquote>{app.messages.find(other=>other.id===item.reply)?.text.slice(0,120)??t('Сообщение удалено','Message deleted')}</blockquote>{/if}
          <p>{item.text}</p><Media ids={item.media} world={selected.universeId}/>
          <footer><time>{new Date(item.at).toLocaleTimeString(app.settings.language,{hour:'2-digit',minute:'2-digit'})}</time>{#if item.edited}<small>{t('изменено','edited')}</small>{/if}{#if item.author===own}<CheckCheck size={14} aria-label={t('Сохранено локально','Saved locally')}/>{/if}</footer>
          <div class="bubble-actions">
            <button class="icon" aria-label={t('Ответить','Reply')} onclick={()=>{reply=item.id;edit='';}}><Reply size={15}/></button>
            <button class="icon" class:active={app.reactions.some(entry=>entry.target===item.id&&entry.actor===own&&entry.kind==='heart')} aria-label={t('Реакция','Reaction')} onclick={()=>void app.safe(()=>react(selected.universeId,own,item.id,'heart'))}><Heart size={15}/></button>
            {#if item.id===latestMessage?.id&&item.author!==own&&peers.some(actor=>actor.id===item.author)&&!app.world?.demo&&app.models[app.settings.model]}
              <button class="icon" aria-label={t('Подготовить альтернативу','Draft an alternative')} disabled={!!app.running} onclick={()=>void app.safe(async()=>{const text=await app.alternative(selected.id,item.id);alternate={id:item.id,text};})}><RefreshCw size={15}/></button>
            {/if}
            {#if item.author===own}
              <button class="icon" aria-label={t('Редактировать','Edit')} onclick={()=>{edit=item.id;reply='';draft=item.text;media=[...item.media];}}><Pencil size={15}/></button>
              <button class="icon" aria-label={t('Удалить','Delete')} onclick={()=>{if(confirm(t('Удалить сообщение?','Delete message?'))) void app.safe(()=>remove(item.id));}}><Trash2 size={15}/></button>
            {/if}
          </div>
        </div>
      </div>
    {:else}<div class="state-empty"><MessageCircle size={24}/>{t('Здесь появятся сообщения','Messages will appear here')}</div>{/each}
    {#if app.running}<div class="typing">{t('Агент обрабатывает контекст…','An agent is processing context…')}<button class="icon" aria-label={t('Остановить','Stop')} onclick={()=>void app.safe(()=>app.stop())}><Square size={15}/></button></div>{/if}
  </section>
  {#if alternate}<section class="panel card-form"><h2>{t('Альтернативная реплика','Alternative reply')}</h2><p>{alternate.text}</p><div class="row-actions"><button class="soft-button" onclick={()=>alternate=undefined}>{t('Оставить исходную','Keep original')}</button><button class="primary small" onclick={()=>void app.safe(async()=>{await app.acceptAlternative(selected.id,alternate!.id,alternate!.text);alternate=undefined;})}>{t('Заменить реплику','Replace reply')}</button></div></section>{/if}
  <form class="panel card-form" onsubmit={event=>{event.preventDefault();void app.safe(send);}}>
    {#if edit||reply}<button type="button" class="chip" onclick={()=>{edit='';reply='';draft='';media=[];}}>{edit?t('Редактирование','Editing'):t('Ответ на сообщение','Replying to a message')}<X size={14}/></button>{/if}
    <textarea rows="2" bind:value={draft} maxlength="8000" aria-label={t('Сообщение','Message')} placeholder={t('Напишите сообщение','Write a message')}></textarea>
    <Media ids={media} world={selected.universeId}/>
    <div class="row-actions"><label class="soft-button file-button"><ImagePlus size={17}/>{t('Фото','Photo')}<input type="file" accept="image/*" multiple onchange={event=>void app.safe(()=>attach(event))}/></label>
      {#if peers.length&&!app.world?.demo}<button class="soft-button" type="button" disabled={!!app.running} onclick={()=>void app.safe(()=>app.run(peers.at(-1)!,selected.group?'SEND_GROUP_MESSAGE':'SEND_DM',selected.id))}><RefreshCw size={15}/>{t('Ещё реплика','Another reply')}</button>{/if}
      <button type="submit" class="primary small push" disabled={attaching||(!draft.trim()&&!media.length)}><Send size={16}/>{t('Отправить','Send')}</button></div>
  </form>
{:else}
  <div class="main-heading"><div><h1>{t('Сообщения','Messages')}</h1><p>{t('Личные и групповые переписки','Direct and group conversations')}</p></div><button class="primary small" onclick={()=>creating=!creating}><Plus size={18}/>{t('Новый чат','New chat')}</button></div>
  {#if creating}<form class="panel card-form" onsubmit={event=>{event.preventDefault();void app.safe(async()=>{await app.openChat(recipients,title);creating=false;recipients=[];title='';});}}>
    <h2>{t('Участники','Participants')}</h2>
    {#each [...app.actors,...app.personas.filter(item=>item.id!==own)] as actor}<label class="tick-row"><input type="checkbox" bind:group={recipients} value={actor.id}/><Avatar {actor} size={28}/>{actor.name}</label>{:else}<p class="muted">{t('Сначала добавьте персонажей','Add characters first')}</p>{/each}
    {#if recipients.length>1}<input bind:value={title} placeholder={t('Название группы','Group name')} maxlength="100"/>{/if}
    <button class="primary small" disabled={!recipients.length}>{t('Открыть переписку','Open conversation')}</button>
  </form>{/if}
  <section class="panel section-list">
    {#each chats as chat (chat.id)}
      {@const last=app.messages.findLast(item=>item.conversation===chat.id)}
      {@const peer=app.memberships.find(item=>item.conversation===chat.id&&item.actor!==own)}
      {@const unread=app.latest.filter(item=>item.target===chat.id&&item.kind==='message').length}
      <button class="roster-line" onclick={()=>app.go('messages',chat.id)}><Avatar actor={app.people.get(peer?.actor??'')} size={43}/><span><strong>{name(chat.id)||t('Диалог','Conversation')} {chat.pinned?' · 📌':''}</strong><small>{last?.text||t('Новый диалог','New conversation')}</small></span>{#if unread}<span class="badge">{unread}</span>{/if}</button>
    {:else}<div class="state-empty"><MessageCircle size={24}/>{t('У вас пока нет переписок','No conversations yet')}</div>{/each}
  </section>
{/if}
