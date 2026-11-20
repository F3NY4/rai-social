<script lang="ts">
  import {Activity,ArrowDownRight,ArrowRight,Bell,Bookmark,ChevronDown,ChevronRight,Clock,Compass,Database,Globe2,Home,Layers3,MessageCircle,Orbit,Plus,Search,Settings2,Sparkles,Users,Waypoints,Zap} from 'lucide-svelte';
  import type {Snippet} from 'svelte';
  import type {SocialApp,View} from '../app.svelte';
  import Avatar from './Avatar.svelte';
  let {app,compose,children}:{app:SocialApp;compose:()=>void;children:Snippet}=$props();
  const nav=$derived([
    {view:'feed',label:app.t('Главная','Home'),icon:Home},
    {view:'search',label:app.t('Поиск','Explore'),icon:Search},
    {view:'alerts',label:app.t('Уведомления','Notifications'),icon:Bell},
    {view:'messages',label:app.t('Сообщения','Messages'),icon:MessageCircle},
    {view:'saved',label:app.t('Закладки','Bookmarks'),icon:Bookmark}
  ] as const);
  const manage=$derived([
    {view:'universes',label:app.t('Вселенные','Universes'),icon:Orbit},
    {view:'characters',label:app.t('Персонажи','Characters'),icon:Users},
    {view:'relations',label:app.t('Отношения','Relationships'),icon:Waypoints},
    {view:'memory',label:app.t('Память','Memory'),icon:Database},
    {view:'story',label:app.t('Сюжет','Story'),icon:Layers3},
    {view:'settings',label:app.t('Настройки','Settings'),icon:Settings2}
  ] as const);
  const unread=$derived(app.latest.filter(item=>item.kind==='message').length);
  const status=$derived(app.world?.demo?'Демо-режим':app.models[app.settings.model]?(app.running?'Генерация':'Модель готова'):'Модель не загружена');
  const statusEn=$derived(app.world?.demo?'Demo mode':app.models[app.settings.model]?(app.running?'Generating':'Model ready'):'Model required');
  const trends=$derived(app.world?.demo ? ['#НочнойГород','#Сектор07','#Сигнал884'] : [...new Set(app.posts.flatMap(item=>item.text.match(/#[\p{L}\d_]+/gu)??[]))].slice(0,5));
  function go(view:View) {app.go(view);}
</script>
<div class="app-shell">
  <aside class="sidebar">
    <button class="brand" onclick={()=>go('feed')} aria-label="R.AI Social">
      <span class="brand-mark"><Zap size={21} fill="currentColor"/></span><span class="brand-text">R<span>.</span>AI <small>SOCIAL</small></span>
    </button>
    <button class="universe-switch" onclick={()=>go('universes')}>
      <span class="universe-mark"><Orbit size={20}/></span><span><small>{app.t('ВСЕЛЕННАЯ','UNIVERSE')}</small><strong>{app.world?.name??'—'}</strong></span><ChevronDown class="chevron" size={15}/>
    </button>
    <nav aria-label={app.t('Основное меню','Main menu')}>
      <p class="nav-label">{app.t('СОЦИАЛЬНАЯ СЕТЬ','SOCIAL')}</p>
      {#each nav as item}
        <button class="nav-item" class:selected={app.view===item.view} onclick={()=>go(item.view)}>
          <item.icon size={19}/><span>{item.label}</span>
          {#if item.view==='alerts'&&app.latest.length}<span class="badge">{app.latest.length}</span>{/if}
        </button>
      {/each}
      <p class="nav-label space">{app.t('МИР','WORLD')}</p>
      {#each manage as item}
        <button class="nav-item" class:selected={app.view===item.view} onclick={()=>go(item.view)}><item.icon size={18}/><span>{item.label}</span></button>
      {/each}
    </nav>
    <button class="primary side-compose" onclick={compose}><Plus size={20}/>{app.t('Создать пост','Create post')}</button>
    <button class="side-profile" onclick={()=>app.go('profile',app.persona?.id)}>
      <Avatar actor={app.persona} size={34}/><span><strong>{app.persona?.name??'—'}</strong><small>@{app.persona?.handle??'—'}</small></span><ChevronRight size={15}/>
    </button>
  </aside>
  <header class="mobile-top">
    <button class="icon" aria-label={app.t('Профиль','Profile')} onclick={()=>app.go('profile',app.persona?.id)}><Avatar actor={app.persona} size={34}/></button>
    <button class="brand" onclick={()=>go('feed')}><span class="brand-mark"><Zap size={16} fill="currentColor"/></span><span class="brand-text">R<span>.</span>AI <small>SOCIAL</small></span></button>
    <button class="icon" aria-label={app.t('Настройки','Settings')} onclick={()=>go('settings')}><Settings2 size={22}/></button>
  </header>
  <main>{@render children()}</main>
  <aside class="rightbar">
    <button class="top-search" onclick={()=>go('search')}><Search size={18}/><span>{app.t('Поиск по вселенной','Search the universe')}</span></button>
    <section class="panel status-panel">
      <div class="panel-kicker"><Activity size={15}/>{app.t('СТАТУС СИМУЛЯЦИИ','SIMULATION STATUS')}</div>
      <h2><i></i>{app.t(status,statusEn)}</h2>
      <p>{app.world?.demo?app.t('Демонстрационная лента с готовыми публикациями. Локальная модель сейчас выключена.','Sample feed with prewritten posts. Local inference is off.'):app.settings.activity==='paused'?app.t('Автономная активность на паузе.','Autonomous activity is paused.'):app.t('Вселенная развивается, пока приложение открыто.','The universe evolves while the app is open.')}</p>
      <button class="status-cta" onclick={()=>go('model')}><Zap size={15}/>{app.t('Управление нейросетью','AI settings')}<ArrowRight size={15}/></button>
    </section>
    <section class="panel">
      <div class="panel-heading"><h2>{app.t('Персонажи','Characters')}</h2><button class="icon" aria-label={app.t('Все персонажи','All characters')} onclick={()=>go('characters')}><ArrowRight size={17}/></button></div>
      {#each app.actors.slice(0,4) as actor (actor.id)}
        <button class="roster-line" onclick={()=>app.go('profile',actor.id)}>
          <Avatar {actor} size={35} online/><span><strong>{actor.name}</strong><small>@{actor.handle}</small></span><span class="ai-tag">AI</span>
        </button>
      {:else}<p>{app.t('Добавьте первого персонажа.','Add your first character.')}</p>{/each}
      <button class="panel-link" onclick={()=>go('characters')}>{app.t('Все персонажи','All characters')}<ArrowRight size={15}/></button>
    </section>
    {#if trends.length}
      <section class="panel trends-panel">
        <div class="panel-heading"><h2>{app.t('В тренде','Trending')}</h2><Sparkles size={16}/></div>
        {#each trends as tag}<button class="trend-line" onclick={()=>app.go('search',encodeURIComponent(tag))}><span><strong>{tag}</strong><small>{app.t('Во вселенной','In this universe')}</small></span><ArrowDownRight size={15}/></button>{/each}
      </section>
    {/if}
    <button class="footer-meta" onclick={()=>go('settings')}><span><i></i>{app.t('Локальное хранилище','Local storage')}</span><span>R.AI Social</span></button>
  </aside>
  <nav class="bottom-bar" aria-label={app.t('Мобильная навигация','Mobile navigation')}>
    <button class:selected={app.view==='feed'} aria-label={nav[0].label} onclick={()=>go('feed')}><Home size={21}/><small>{app.t('Лента','Feed')}</small></button>
    <button class:selected={app.view==='search'} aria-label={nav[1].label} onclick={()=>go('search')}><Compass size={21}/><small>{nav[1].label}</small></button>
    <button class="bottom-compose" aria-label={app.t('Создать пост','Create post')} onclick={compose}><Plus size={24}/></button>
    <button class:selected={app.view==='alerts'} aria-label={nav[2].label} onclick={()=>go('alerts')}><Bell size={21}/>{#if app.latest.length}<i></i>{/if}<small>{app.t('Уведомления','Alerts')}</small></button>
    <button class:selected={app.view==='messages'} aria-label={nav[3].label} onclick={()=>go('messages')}><MessageCircle size={21}/>{#if unread}<i></i>{/if}<small>{app.t('Сообщения','Messages')}</small></button>
  </nav>
</div>
