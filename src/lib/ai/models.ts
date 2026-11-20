const model = (name: string, revision: string, size: number, sha: string) => ({
  name, size, sha, license: 'Apache-2.0',
  url: `https://huggingface.co/bartowski/${name}-GGUF/resolve/${revision}/${name}-Q4_K_M.gguf`
});
export const models = {
  qwen: model('Qwen2.5-0.5B-Instruct','41ba88dbac95fed2528c92514c131d73eb5a174b',397808192,'6eb923e7d26e9cea28811e1a8e852009b21242fb157b26149d3b188f3a8c8653'),
  smol: model('SmolLM2-360M-Instruct','7be6f65f1db715fe5dc5a4634c0d459b4eed42ec',270590880,'2fa3f013dcdd7b99f9b237717fa0b12d75bbb89984cc1274be1471a465bac9c2'),
  qwenLarge: model('Qwen2.5-1.5B-Instruct','9eadc66189c7641e1ddd226b8267a9119b2ce2d4',986048768,'1adf0b11065d8ad2e8123ea110d1ec956dab4ab038eab665614adba04b6c3370')
};
export type ModelId = keyof typeof models;
export const profiles = {
  Eco: {context:1024, tokens:100, interval:150000},
  Balanced: {context:1536, tokens:150, interval:100000},
  Quality: {context:2048, tokens:210, interval:100000}
};
export type PerformanceMode = keyof typeof profiles;
