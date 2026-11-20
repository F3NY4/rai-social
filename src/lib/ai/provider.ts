import {profiles, type ModelId, type PerformanceMode} from './models';
import {getModel} from './storage';
export type Turn = {role:'system'|'user'|'assistant'; content:string};
export type Generation = {text:string; speed:number};
export interface ModelProvider {
  generate(messages:Turn[], signal:AbortSignal):Promise<Generation>;
  dispose():Promise<void>;
}
export type AIOptions = {model:ModelId; mode:PerformanceMode; gpu:boolean; temperature:number; topP:number; maxTokens?:number};
export class BrowserModel implements ModelProvider {
  private engine?: import('@wllama/wllama').Wllama;
  constructor(private options:AIOptions) {}
  private async load(gpu:boolean) {
    const [{Wllama},{default:wasm},{default:compatWasm},{default:compatWorker}]=await Promise.all([
      import('@wllama/wllama'), import('@wllama/wllama/esm/wasm/wllama.wasm?url'),
      import('@wllama/wllama-compat/wasm/wllama.wasm?url'), import('@wllama/wllama-compat/wasm/wllama.js?url')
    ]);
    this.engine = new Wllama({default:wasm}, {allowOffline:true,suppressNativeLog:true});
    this.engine.setCompat({wasm:compatWasm,worker:new URL(compatWorker,location.href).href});
    const file = await getModel(this.options.model);
    await this.engine.loadModel([file], {
      n_ctx:profiles[this.options.mode].context, n_threads:1, n_batch:128,
      n_gpu_layers:gpu ? 99 : 0
    });
  }
  async generate(messages:Turn[], signal:AbortSignal) {
    try {
      return await this.complete(messages, signal, this.options.gpu);
    } catch (error) {
      await this.dispose().catch(() => {});
      signal.throwIfAborted();
      if (!this.options.gpu) throw error;
      this.options = {...this.options, gpu:false};
      try { return await this.complete(messages, signal, false); }
      catch (failure) { await this.dispose().catch(() => {}); throw failure; }
    }
  }
  private async complete(messages:Turn[], signal:AbortSignal, gpu:boolean) {
    signal.throwIfAborted();
    if (!this.engine) await this.load(gpu);
    signal.throwIfAborted();
    const started = performance.now();
    const result = await this.engine!.createChatCompletion({
      messages, max_tokens:Math.min(this.options.maxTokens ?? Infinity, profiles[this.options.mode].tokens),
      temperature:this.options.temperature, top_p:this.options.topP, abortSignal:signal, response_format:{type:'json_object'}
    });
    signal.throwIfAborted();
    return {text:result.choices[0]?.message.content ?? '',speed:(result.usage?.completion_tokens ?? 0) / Math.max(0.001,(performance.now()-started)/1000)};
  }
  async dispose() {
    const active = this.engine;
    this.engine = undefined;
    await active?.exit();
  }
}
