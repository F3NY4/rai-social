<script lang="ts">
  import {onMount} from 'svelte';
  import {Activity,Check,Cpu,Download,HardDrive,Pause,ShieldCheck,Square,Trash2,Zap} from 'lucide-svelte';
  import {models,profiles,type ModelId,type PerformanceMode} from '../ai/models';
  import {diagnose} from '../ai/storage';
  import type {SocialApp} from '../app.svelte';
  let {app}:{app:SocialApp}=$props();
  const t=(ru:string,en:string)=>app.t(ru,en);
  let capabilities=$state<Awaited<ReturnType<typeof diagnose>>>();
  let quota=$state<StorageEstimate>();
  onMount(()=>{void diagnose().then(value=>capabilities=value);void navigator.storage?.estimate?.().then(value=>quota=value).catch(()=>{});});
  const ids=Object.keys(models) as ModelId[];
  const diagnostics=$derived(capabilities?[
    ['WebAssembly + Workers',capabilities.wasm],['IndexedDB',capabilities.indexedDB],['OPFS',capabilities.opfs],['Service Worker',capabilities.offline],['WebGPU',capabilities.gpu],['shader-f16',capabilities.f16]
  ] as const:[]);
  async function mode(mode:PerformanceMode) {
    if(mode==='Quality'&&(!capabilities?.gpu||!capabilities.f16)) return;
    await app.stop();
    await app.save({mode,gpu:mode==='Quality'&&!!capabilities?.f16,...(mode==='Eco'&&app.models.smol?{model:'smol' as const}:{}),...(mode==='Balanced'?{model:'qwen' as const}:{})});
  }
</script>
<section class="panel card-form model-callout">
  <div class="panel-kicker"><Zap size={15}/>{t('ЛОКАЛЬНЫЙ ИНФЕРЕНС','ON-DEVICE INFERENCE')}</div>
  <h2>{t('Модель на вашем устройстве','A model on your device')}</h2>
  <p class="muted">{t('Скачайте GGUF один раз. Персонажи будут использовать общую модель прямо в браузере. В демонстрационной вселенной доступны только готовые публикации.','Download a GGUF once. Characters share one model running in your browser. The demo world contains sample posts.')}</p>
  <div class="row-actions">{#each Object.keys(profiles) as key}<button class="soft-button" class:active={key===app.settings.mode} disabled={key==='Quality'&&(!capabilities?.gpu||!capabilities.f16)} onclick={()=>void app.safe(()=>mode(key as PerformanceMode))}>{key}</button>{/each}</div>
  <small class="muted">{profiles[app.settings.mode].context} {t('токенов контекста','context tokens')} · {app.settings.gpu?'WebGPU → WASM':'WASM CPU'}{app.speed?' · '+app.speed.toFixed(1)+' '+t('токенов/с','tokens/s'):''}</small>
  {#if app.running}<button class="soft-button" onclick={()=>void app.safe(()=>app.stop())}><Square size={15}/>{t('Отменить генерацию','Cancel generation')}</button>{/if}
</section>
{#each ids as id}
  <section class="panel card-form">
    <div class="panel-heading"><h2>{models[id].name}</h2>{#if app.settings.model===id&&app.models[id]}<span class="chip"><Check size={14}/>{t('Выбрана','Selected')}</span>{/if}</div>
    <p class="muted">{(models[id].size/1000000).toFixed(1)} MB · Q4_K_M GGUF · Apache-2.0</p>
    <small class="muted">{id==='qwen'?t('Рекомендуемая компактная модель для русских диалогов.','Recommended compact model for Russian dialogue.'):id==='smol'?t('Минимальный размер. Предпочтительно для английского.','Smallest download. Best suited to English.'):t('Экспериментальная модель. Загрузка и инференс требуют больше памяти.','Experimental model. Download and inference require more memory.')}</small>
    {#if app.downloadId===id}<progress max="1" value={app.progress}></progress><div class="row-actions"><span>{Math.round(app.progress*100)}%</span><button class="soft-button" onclick={()=>app.pauseDownload()}><Pause size={15}/>{t('Пауза','Pause')}</button></div>
    {:else if app.models[id]}<div class="row-actions"><button class="soft-button" onclick={()=>void app.safe(async()=>{await app.stop();await app.save({model:id});})}><Check size={15}/>{t('Использовать','Use model')}</button><button class="icon" aria-label={t('Удалить модель','Delete model')} onclick={()=>{if(confirm(t('Удалить скачанную модель?','Delete the downloaded model?'))) void app.safe(()=>app.removeModel(id));}}><Trash2 size={18}/></button></div>
    {:else}<button class="primary small" disabled={!!app.downloadId||!capabilities?.opfs||(id==='qwenLarge'&&app.settings.mode!=='Quality')} onclick={()=>void app.safe(async()=>{await app.install(id);if(app.models[id]) await app.save({model:id});})}><Download size={16}/>{t('Скачать / продолжить','Download / resume')}</button>{/if}
  </section>
{/each}
<section class="panel card-form">
  <div class="panel-heading"><h2>{t('Диагностика устройства','Device diagnostics')}</h2><Activity size={19}/></div>
  {#each diagnostics as [label,available]}<div class="diagnostic-line"><span>{label}</span><span class:good={available}>{available?t('Доступно','Available'):t('Недоступно','Unavailable')}</span></div>{/each}
  {#if quota?.quota}<small class="muted">{t('Хранилище','Storage')}: {Math.round((quota.usage??0)/1000000)} MB / {Math.round(quota.quota/1000000)} MB</small>{/if}
  <label class="tick-row"><input type="checkbox" checked={app.settings.gpu} disabled={!capabilities?.f16||!capabilities.gpu} onchange={event=>{const gpu=event.currentTarget.checked;void app.safe(async()=>{await app.stop();await app.save({gpu});});}}/> WebGPU {t('(экспериментально)','(experimental)')}</label>
  <label>{t('Температура','Temperature')} <small>{app.settings.temperature}</small><input type="range" min="0" max="1.5" step=".05" value={app.settings.temperature} onchange={event=>void app.save({temperature:+event.currentTarget.value})}/></label>
  <label>Top-p <small>{app.settings.topP}</small><input type="range" min=".1" max="1" step=".05" value={app.settings.topP} onchange={event=>void app.save({topP:+event.currentTarget.value})}/></label>
  <label>{t('Максимум токенов','Maximum tokens')}<input type="number" min="48" max={profiles[app.settings.mode].tokens} value={app.settings.maxTokens??profiles[app.settings.mode].tokens} onchange={event=>void app.save({maxTokens:Math.max(48,Math.min(profiles[app.settings.mode].tokens,+event.currentTarget.value))})}/></label>
</section>
