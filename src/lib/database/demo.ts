import {db,row} from './db';
import {addCharacter,createWorld,conversation,message} from './social';
export async function seed() {
  const existing=await db.universes.filter(item=>item.demo).first();
  if(existing) {
    const persona = await db.user_personas.where('universeId').equals(existing.id).first();
    if(persona) return {world:existing,persona};
  }
  const result=await createWorld('Неоновый горизонт','Город будущего, где у каждого есть свой сигнал.',true);
  const {world,persona}=result;
  const start=Date.now();
  await db.universes.update(world.id,{details:{genre:'Киберпанк',era:'2147',geography:'Сектор 07',plot:'После заката город улавливает неизвестный сигнал.'},clock:Date.UTC(2147,10,15,22,45)});
  const [mira,kael,nova,ren]=await Promise.all([
    addCharacter(world.id,{name:'Мира Вейл',handle:'mira.vale',portrait:'violet',details:{bio:'Фотограф ночного города',personality:'Наблюдательная, тихая, чувствительная к атмосфере.',speech:'Короткие образы и тёплая ирония.'}}),
    addCharacter(world.id,{name:'Каэл Роу',handle:'kael.row',portrait:'amber',details:{bio:'Инженер и радиолюбитель',personality:'Упрямый инженер, проверяет слухи до публикации.'}}),
    addCharacter(world.id,{name:'Нова Ким',handle:'nova.kim',portrait:'blue',details:{bio:'Городская исследовательница',personality:'Любопытная, общительная, любит загадки.'}}),
    addCharacter(world.id,{name:'Рен Сато',handle:'ren.sato',portrait:'green',details:{bio:'Музыкант и архивариус',personality:'Меланхоличный музыкант, собирает звуки города.'}})
  ]);
  const posts = [
    {...row(world.id,start-14*60000),author:mira.id,art:'signal' as const,text:'На крыше, над линией метро, город наконец замолкает. Успела поймать этот свет, пока всё снова не заговорило.\n\n#НочнойГород #Сектор07',media:[]},
    {...row(world.id,start-46*60000),author:kael.id,text:'Кто-нибудь ещё слышал этот сигнал на 88.4 прошлой ночью? Три коротких, один длинный. Я уже начинаю думать, что это была не помеха.',media:[]},
    {...row(world.id,start-2*3600000),author:nova.id,text:'Ночной рынок сегодня переехал под старую эстакаду. Если потеряетесь, идите на запах жасминового чая.',media:[]}
  ];
  await db.posts.bulkPut(posts);
  await db.comments.add({...row(world.id),author:ren.id,post:posts[0].id,text:'В этом свете узнаётся весь город.'});
  await db.reactions.bulkAdd([kael,nova,ren].map(actor=>({...row(world.id),actor:actor.id,target:posts[0].id,kind:'like' as const})));
  await db.follows.add({...row(world.id),from:persona.id,to:mira.id});
  const chat=await conversation(world.id,[persona.id,nova.id]);
  await message(world.id,chat.id,nova.id,'Привет, Алекс! Если будешь в Секторе 07, загляни на ночной рынок.');
  await db.world_events.add({...row(world.id),title:'Сигнал на 88.4',text:'Несколько жителей сообщают о загадочном радиосигнале.',virtual:Date.UTC(2147,10,15,22,45)});
  return result;
}
