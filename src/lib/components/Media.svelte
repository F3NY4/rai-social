<script lang="ts">
  import {db} from '../database/db';
  let {ids=[],world,cover=false}:{ids?:string[];world:string;cover?:boolean}=$props();
  let images=$state<string[]>([]);
  $effect(()=>{
    const requested=[...ids], universe=world;
    let active=true;
    let urls:string[]=[];
    images=[];
    if(requested.length) void db.media_assets.bulkGet(requested).then(entries=>{
      if(active) images=urls=entries.flatMap(item=>item&&item.universeId===universe?URL.createObjectURL(item.blob):[]);
    });
    return ()=>{active=false;urls.forEach(url=>URL.revokeObjectURL(url));};
  });
</script>
{#if images.length}<div class:cover class="media-grid" class:multi={images.length>1}>
  {#each images as src}<img {src} alt="Изображение публикации" loading="lazy" />{/each}
</div>{/if}
