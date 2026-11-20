import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {models,type ModelId} from './models';

const directory=async()=>(await navigator.storage.getDirectory()).getDirectoryHandle('rai-models',{create:true});
const filename=(id:ModelId)=>id+'-'+models[id].sha.slice(0,12)+'.gguf';
async function file(id:ModelId) {
  return (await (await directory()).getFileHandle(filename(id))).getFile();
}
export async function installed(id:ModelId) {
  try {
    const folder=await directory();
    await folder.getFileHandle(filename(id)+'.verified');
    return (await file(id)).size===models[id].size;
  } catch {return false;}
}
export async function removeModel(id:ModelId) {
  const folder=await directory();
  for(const name of [filename(id),filename(id)+'.verified',filename(id).replace(/\.gguf$/,'.part')]) {
    try {await folder.removeEntry(name);}
    catch(error) {if(!(error instanceof DOMException&&error.name==='NotFoundError')) throw error;}
  }
}

type WorkerInput={op:'open';name:string;offset:number}|{op:'write';bytes:ArrayBuffer}|{op:'close'};
async function openWriter(handle:FileSystemFileHandle,offset:number) {
  const worker=new Worker(new URL('./model-file.worker.ts',import.meta.url),{type:'module'});
  const call=(data:WorkerInput,transfer:Transferable[]=[])=>new Promise<void>((resolve,reject)=>{
    worker.onmessage=({data})=>data.ok?resolve():reject(Error(data.message));
    worker.onerror=event=>reject(Error(event.message||'OPFS worker error'));
    worker.postMessage(data,transfer);
  });
  try {
    await call({op:'open',name:handle.name,offset});
  } catch(error) {
    worker.terminate();
    if(!handle.createWritable) throw error;
    const stream=await handle.createWritable({keepExistingData:offset>0});
    await stream.seek(offset);
    return {write:(bytes:Uint8Array)=>stream.write(Uint8Array.from(bytes)),close:()=>stream.close()};
  }
  return {
    write:(bytes:Uint8Array)=>{
      const payload=Uint8Array.from(bytes).buffer;
      return call({op:'write',bytes:payload},[payload]);
    },
    close:async()=>{try{await call({op:'close'});}finally{worker.terminate();}}
  };
}
async function ingest(input:Blob|ReadableStream<Uint8Array>,hash:ReturnType<typeof sha256.create>,signal:AbortSignal,write?:(bytes:Uint8Array)=>Promise<void>) {
  const reader=(input instanceof Blob?input.stream():input).getReader();
  try {
    while(true) {
      signal.throwIfAborted();
      const result=await reader.read();
      if(result.done) return;
      hash.update(result.value);
      await write?.(result.value);
    }
  } finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function getModel(id:ModelId) {
  if(!await installed(id)) throw Error('Скачайте и проверьте модель');
  return file(id);
}
export async function downloadModel(id:ModelId,signal:AbortSignal,progress:(value:number)=>void) {
  const model=models[id];
  if(await installed(id)) {progress(1);return;}
  const folder=await directory();
  const handle=await folder.getFileHandle(filename(id),{create:true});
  const previous=await handle.getFile();
  let received=previous.size<=model.size?previous.size:0;
  const estimate=await navigator.storage.estimate?.().catch(()=>null);
  if(estimate?.quota&&estimate.usage!==undefined&&estimate.quota-estimate.usage<model.size-received) throw Error('Недостаточно места для модели');
  const hash=sha256.create();
  if(received===model.size) {
    await ingest(previous,hash,signal);
    if(bytesToHex(hash.digest())!==model.sha){await removeModel(id);throw Error('Не совпадает SHA-256 модели. Повторите загрузку.');}
  } else {
    const response=await fetch(model.url,{signal,headers:received?{Range:`bytes=${received}-`}:{}});
    if(!response.ok||!response.body) throw Error('Загрузка модели: HTTP '+response.status);
    const expectedRange=`bytes ${received}-${model.size-1}/${model.size}`;
    if(received&&(response.status!==206||response.headers.get('Content-Range')!==expectedRange)) {
      if(response.status===200) received=0;
      else {
        await response.body.cancel();
        await removeModel(id);
        return downloadModel(id,signal,progress);
      }
    }
    progress(received/model.size);
    if(received) await ingest(previous,hash,signal);
    const output=await openWriter(handle,received);
    let lastProgress=-1;
    try {
      await ingest(response.body,hash,signal,async bytes=>{
        if(received+bytes.length>model.size) throw Error('Размер файла превышает ожидаемый');
        await output.write(bytes);
        received+=bytes.length;
        const percent=Math.floor(received*100/model.size);
        if(percent!==lastProgress){lastProgress=percent;progress(received/model.size);}
      });
    } finally {await output.close();}
    signal.throwIfAborted();
    if(received!==model.size) throw Error('Файл получен частично. Продолжите загрузку.');
    if(bytesToHex(hash.digest())!==model.sha){await removeModel(id);throw Error('Не совпадает SHA-256 модели. Повторите загрузку.');}
  }
  signal.throwIfAborted();
  await folder.getFileHandle(filename(id)+'.verified',{create:true});
  progress(1);
}
export async function diagnose() {
  const gpu=(navigator as Navigator&{gpu?:{requestAdapter():Promise<null|{features:Set<string>}>}}).gpu;
  const adapter=await gpu?.requestAdapter().catch(()=>null);
  const opfs=await navigator.storage?.getDirectory?.().then(()=>true,()=>false);
  return {gpu:!!adapter,f16:!!adapter?.features.has('shader-f16'),wasm:typeof WebAssembly==='object'&&typeof Worker==='function',opfs:!!opfs,indexedDB:typeof indexedDB!=='undefined',offline:'serviceWorker' in navigator};
}
