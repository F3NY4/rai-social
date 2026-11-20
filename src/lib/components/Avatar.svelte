<script lang="ts">
  import {asset} from '$app/paths';
  import {db} from '../database/db';
  import type {Actor} from '../database/schema';
  let {actor,size=38,online=false}:{actor?:Actor;size?:number;online?:boolean}=$props();
  let local=$state('');
  $effect(()=>{
    const id=actor?.avatar;
    let alive=true;
    let url='';
    local='';
    if(id) void db.media_assets.get(id).then(asset=>{
      if(alive&&asset?.universeId===actor?.universeId&&asset) local=url=URL.createObjectURL(asset.blob);
    });
    return ()=>{alive=false;if(url) URL.revokeObjectURL(url);};
  });
  const builtIn:Record<string,'media/violet.webp'|'media/amber.webp'|'media/blue.webp'|'media/green.webp'>={'mira.vale':'media/violet.webp','kael.row':'media/amber.webp','nova.kim':'media/blue.webp','ren.sato':'media/green.webp'};
  const picture=$derived(local||(actor&&builtIn[actor.handle]?asset(builtIn[actor.handle]):''));
</script>
<span class="avatar {actor?.portrait??'rose'}" style:--avatar-size="{size}px">
  {#if picture}<img src={picture} alt="" width={size} height={size} />{:else}<span>{actor?.name.split(' ').slice(0,2).map(part=>part[0]).join('')??'?'}</span>{/if}
  {#if online}<i></i>{/if}
</span>
