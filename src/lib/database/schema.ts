import {z} from 'zod';
export const characterLabels = {
  alias:'Псевдоним',age:'Возраст',location:'Место проживания',bio:'Биография профиля',history:'Подробная биография',
  appearance:'Внешность',personality:'Характер',habits:'Привычки',interests:'Интересы',values:'Ценности',fears:'Страхи',
  desires:'Желания',goals:'Цели',weaknesses:'Слабости',speech:'Манера речи',vocabulary:'Словарный запас',humor:'Юмор',
  emotions:'Эмоциональные особенности',userAttitude:'Отношение к пользователю',behavior:'Поведение в соцсетях',
  frequency:'Частота публикаций',initiative:'Инициатива в переписке',examples:'Примеры реплик',instructions:'Инструкции',
  secrets:'Скрытая информация',initialMemory:'Начальные воспоминания'
} as const;
export const worldLabels = {genre:'Жанр',era:'Исторический период',geography:'География',rules:'Правила мира',lore:'Лор',plot:'Сюжетная ситуация'};
export const feelings = ['mood','stress','fatigue','irritation','anxiety','resentment','interest','confidence','safety','activity'] as const;
export const ties = ['trust','attachment','liking','respect','romance','jealousy','dislike','rivalry','intimacy','conflicts'] as const;
const id = z.string().min(1).max(100);
const text = z.string().max(12000);
const ids = z.array(id).max(200);
const time = z.number().finite();
const row = z.object({id, universeId:id, at:time});
const metadata = <K extends string>(keys:K[]) => z.object(Object.fromEntries(keys.map(key=>[key,text.optional()])) as Record<K,z.ZodOptional<typeof text>>);
const numbers = <K extends string>(keys:readonly K[]) => z.object(Object.fromEntries(keys.map(key=>[key,z.number().min(-100).max(100).default(0)])) as Record<K,z.ZodDefault<z.ZodNumber>>);
export const worldSchema = row.extend({name:text.min(1), description:text, details:metadata(Object.keys(worldLabels) as (keyof typeof worldLabels)[]), cover:id.optional(), archived:z.boolean().default(false), demo:z.boolean().default(false), clock:time});
export const actorSchema = row.extend({name:text.min(1), handle:z.string().regex(/^[\p{L}\d_.]{1,32}$/u), avatar:id.optional(), banner:id.optional(), portrait:z.enum(['violet','amber','blue','green','rose']).default('amber'), pinned:id.optional(), details:metadata(Object.keys(characterLabels) as (keyof typeof characterLabels)[])});
export const schemas = {
  universes:worldSchema, user_personas:actorSchema, characters:actorSchema,
  character_states:row.extend({owner:id, values:numbers(feelings), goal:text.optional()}),
  relationships:row.extend({from:id,to:id,values:numbers(ties),note:text}),
  memories:row.extend({owner:id,source:id,participants:ids,kind:z.enum(['working','episode','semantic','emotional']), text, importance:z.number().min(0).max(1), valence:z.number().min(-1).max(1), confidence:z.number().min(0).max(1), privacy:z.enum(['private','world']), related:ids, pinned:z.boolean().default(false)}),
  posts:row.extend({author:id,text,media:ids,quote:id.optional(),edited:time.optional(),art:z.enum(['city','signal']).optional()}),
  comments:row.extend({author:id,post:id,parent:id.optional(),text}),
  reactions:row.extend({actor:id,target:id,kind:z.enum(['like','bookmark','repost','heart'])}),
  follows:row.extend({from:id,to:id}),
  conversations:row.extend({title:text,group:z.boolean(),pinned:z.boolean().default(false),read:time.default(0)}),
  conversation_members:row.extend({conversation:id,actor:id}),
  messages:row.extend({conversation:id,author:id,text,media:ids,reply:id.optional(),edited:time.optional()}),
  notifications:row.extend({actor:id,recipient:id,target:id,kind:z.enum(['message','comment','reply','like','follow','mention','repost','world']),read:z.boolean()}),
  world_events:row.extend({title:text,text,virtual:time}),
  simulation_jobs:row.extend({actor:id,seed:time,status:z.enum(['pending','running','done','failed']),target:id.optional()}),
  model_registry:z.object({id,at:time}),
  media_assets:row.extend({mime:z.enum(['image/webp','image/jpeg','image/png']),blob:z.instanceof(Blob)}),
  checkpoints:row.extend({label:text,backup:text.max(10000000)})
};
export type Actor = z.infer<typeof actorSchema>;
export type Universe = z.infer<typeof worldSchema>;
export type TableName = keyof typeof schemas;
export type Records = {[K in TableName]:z.infer<(typeof schemas)[K]>};
