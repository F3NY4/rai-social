/// <reference lib="webworker" />
const worker=self as unknown as DedicatedWorkerGlobalScope;
type Request={op:'open';name:string;offset:number}|{op:'write';bytes:ArrayBuffer}|{op:'close'};
let file:FileSystemSyncAccessHandle|undefined;
let position=0;
worker.onmessage=async ({data}:MessageEvent<Request>)=>{
  try {
    if(data.op==='open') {
      const root=await navigator.storage.getDirectory();
      const folder=await root.getDirectoryHandle('rai-models',{create:true});
      const handle=await folder.getFileHandle(data.name,{create:true});
      file=await handle.createSyncAccessHandle();
      position=data.offset;
      if(file.getSize()!==position) file.truncate(position);
    } else if(data.op==='write') {
      if(!file) throw Error('Файл не открыт');
      const bytes=new Uint8Array(data.bytes);
      const written=file.write(bytes,{at:position});
      if(written!==bytes.length) throw Error('Не удалось полностью записать модель');
      position+=written;
    } else if(file) {
      try{file.flush();}finally{file.close();file=undefined;}
    }
    worker.postMessage({ok:true});
  } catch(error) {
    worker.postMessage({ok:false,message:error instanceof Error?error.message:String(error)});
  }
};
