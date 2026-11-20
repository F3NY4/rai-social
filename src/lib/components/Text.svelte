<script lang="ts">
  let {text,lookup}:{text:string;lookup:(value:string)=>void}=$props();
  const pieces=$derived(text.split(/([#@][\p{L}\d_.]+)/gu));
</script>
<span class="rich-text">{#each pieces as piece}{#if /^[#@][\p{L}\d_.]+$/u.test(piece)}<button class="text-link" onclick={()=>lookup(piece)}>{piece}</button>{:else}{piece}{/if}{/each}</span>
