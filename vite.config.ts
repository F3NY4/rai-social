import adapter from '@sveltejs/adapter-static';
import {sveltekit} from '@sveltejs/kit/vite';
import {defineConfig} from 'vite';
export default defineConfig({plugins:[sveltekit({
  adapter:adapter(),
  paths:{base:(process.env.BASE_PATH || '') as '' | `/${string}`},
  csp:{mode:'hash',directives:{
    'default-src':['self'], 'script-src':['self','wasm-unsafe-eval','blob:'], 'worker-src':['self','blob:'],
    'style-src':['self','unsafe-inline'], 'img-src':['self','blob:','data:'],
    'connect-src':['self','blob:','https://huggingface.co','https://*.hf.co','https://*.huggingface.co'],
    'object-src':['none'], 'base-uri':['self'], 'form-action':['self']
  }}
})]});
