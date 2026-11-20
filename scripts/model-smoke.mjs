import {chromium,webkit} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const data=await mkdtemp(join(tmpdir(),'rai-test-browser-'));
const useWebKit=process.env.RAI_BROWSER==='webkit';
const context=await (useWebKit?webkit:chromium).launchPersistentContext(data,{ignoreHTTPSErrors:true,serviceWorkers:'allow',args:useWebKit?[]:['--ignore-certificate-errors']});
const page=await context.newPage();
page.on('console',text=>{if(text.type()==='error') console.log('[console]',text.text().slice(0,600));});
page.on('pageerror',error=>console.log('[page]',error.message));
page.on('requestfailed',request=>console.log('[request]',request.failure()?.errorText,request.url().slice(0,170)));
try {
  await page.goto(process.env.RAI_TEST_URL || 'http://localhost:4173/');
  await page.getByRole('heading',{name:'Неоновый горизонт'}).waitFor();
  await page.getByRole('button',{name:'Открыть вселенную'}).click();
  await page.getByRole('button',{name:'Новая вселенная'}).click();
  await page.getByLabel('Название',{exact:true}).fill('Проверка модели');
  await page.getByLabel('Имя',{exact:true}).fill('Алекс');
  await page.getByLabel('Username',{exact:true}).first().fill('alex');
  await page.getByText('Добавить первого персонажа',{exact:true}).click();
  await page.getByLabel('Имя персонажа').fill('Илья');
  await page.getByLabel('Username',{exact:true}).last().fill('ilya');
  await page.getByLabel('Характер',{exact:true}).fill('Машинист метро. Отзывчивый, даёт короткие практичные ответы.');
  await page.getByRole('button',{name:'Создать вселенную'}).click();
  await page.getByRole('heading',{name:'Нейросеть',exact:true}).waitFor();
  await page.locator('.diagnostic-line').first().waitFor();
  console.log('diagnostic:',await page.locator('.diagnostic-line').allTextContents(),await page.evaluate(()=>navigator.storage.estimate()));
  const card=page.locator('section').filter({has:page.getByRole('heading',{name:'Qwen2.5-0.5B-Instruct',exact:true})});
  await card.getByRole('button',{name:'Скачать / продолжить'}).click();
  const downloader=setInterval(async()=>console.log('download:',(await card.innerText().catch(()=>'' )).slice(-180),await page.locator('.toast').allTextContents().catch(()=>[])),10000);
  try{await card.getByText('Выбрана',{exact:true}).waitFor({timeout:240000});}finally{clearInterval(downloader);}
  console.log('download verified');
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await context.setOffline(true);
  await page.locator('.sidebar').getByRole('button',{name:'Главная',exact:true}).click();
  await page.getByRole('textbox',{name:'Текст публикации'}).fill('Метро ещё открыто? Где ближайший вход?');
  await page.getByRole('button',{name:'Опубликовать',exact:true}).click();
  await page.getByRole('button',{name:'Комментарии',exact:true}).click();
  await Promise.race([page.locator('.comment-line').first().waitFor({timeout:180000}), page.locator('.toast.error').waitFor({timeout:180000}).then(async()=>{throw Error(await page.locator('.toast.error').innerText());})]);
  console.log('OFFLINE QWEN REPLY:',await page.locator('.comment-line').first().innerText());
} catch(error) {
  console.log('toast:',await page.locator('.toast').allTextContents());
  throw error;
} finally {await context.close();await rm(data,{recursive:true,force:true});}
