import { assertAccessible } from './accessibility';
import {test,expect,type Page} from '@playwright/test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import pg from 'pg';

const suffix=crypto.randomBytes(5).toString('hex'),slug=`e2e-${suffix}`,other=`e2e-other-${suffix}`;
const password='e2e-test-owner-password',email=`${slug}@example.invalid`;
const origin='http://127.0.0.1:32200';
const legacy=JSON.stringify([{id:'legacy-e2e',name:'Cliente Legado E2E',phone:'11976543210',notes:'Prefere retirada',ordersCount:2,totalSpentCents:2500}],null,2);
let pool:pg.Pool,child:ChildProcess,session:any,adminSession:any,output='';
const analyticsOrderId=`ord_${crypto.randomUUID()}`,feedbackOrderId=`ord_${crypto.randomUUID()}`;
const tenant={id:slug,slug,name:'Restaurante E2E',phone:'5511999999999',address:'Rua de teste',primaryColor:'#EA580C',isOpen:true,deliveryFeeCents:0,minOrderCents:0,tablesCount:3,subscriptionStatus:'active',evolutionInstanceId:`instance_${slug}`,evolutionStatus:'disconnected'};
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{
  const connectionString=process.env.TEST_DATABASE_URL;
  if(!connectionString||!new URL(connectionString).pathname.endsWith('_test')) throw new Error('E2E exige TEST_DATABASE_URL de banco descartável com sufixo _test.');
  pool=new pg.Pool({connectionString});
  await pool.query(fs.readFileSync('database/easypanel-init.sql','utf8'));
  for(const file of fs.readdirSync('database').filter(name=>name.endsWith('.sql')&&name!=='easypanel-init.sql').sort()) await pool.query(fs.readFileSync(`database/${file}`,'utf8'));
  for(const name of [slug,other]) await pool.query("INSERT INTO tenants(id,name,slug,phone,subscription_status,subscription_access_until,tables_count) VALUES($1,$2,$1,$3,'active',NOW()+INTERVAL '90 days',3)",[name,name===slug?tenant.name:'Outro E2E',tenant.phone]);
  const salt=crypto.randomBytes(16).toString('hex'),hash=`scrypt$${salt}$${crypto.scryptSync(password,salt,64).toString('hex')}`;
  await pool.query(`INSERT INTO subscriber_users(id,name,email,password_hash,phone,role,tenant_id,tenant_slug,tenant_name,permissions) VALUES($1,'Owner E2E',$2,$3,$4,'TENANT_OWNER',$5,$5,$6,'["tenant:full_access","kds:manage_orders"]')`,[`owner-${suffix}`,email,hash,tenant.phone,slug,tenant.name]);
  for(const feature of ['menu_import','analytics','upsell','feedback']) await pool.query('INSERT INTO intelligence_features(tenant_slug,feature,released,enabled) VALUES($1,$2,true,true)',[slug,feature]);
  for(const [id,number,total,method,status] of [[analyticsOrderId,811,2450,'Pix','paid_online'],[feedbackOrderId,812,1000,'Dinheiro','pending']]) await pool.query("INSERT INTO orders(id,order_number,tenant_id,tenant_slug,customer_name,customer_phone,subtotal_cents,total_cents,status,payment_method,payment_status) VALUES($1,$2,$3,$3,'Cliente de teste E2E','5511988887777',$4,$4,'delivered',$5,$6)",[id,number,slug,total,method,status]);
  await pool.query("INSERT INTO pix_transactions(txid,order_id,tenant_slug,amount_cents,pix_copia_e_cola,status,paid_at,end_to_end_id) VALUES($1,$2,$3,2450,'e2e-test-static-payload','PAID',NOW(),$4)",[`PIX${suffix}`,analyticsOrderId,slug,`E2ESETTLED${suffix}`]);
  child=spawn(process.execPath,['--import','tsx','server.ts'],{env:{...process.env,NODE_ENV:'development',PORT:'32200',DATABASE_URL:connectionString,JWT_SECRET:'e2e-only-jwt-secret-at-least-32-characters',ADMIN_EMAIL:`admin-${suffix}@example.invalid`,ADMIN_PASSWORD:'e2e-only-admin-password',OUTBOX_WORKER_ENABLED:'false',DISABLE_HMR:'true',MENU_IMPORT_AI_ENABLED:'false',GEMINI_API_KEY:'',ASAAS_API_KEY:'',EVOLUTION_API_KEY:'',EVOLUTION_API_URL:'',IFOOD_CLIENT_SECRET:'',APP_URL:origin},stdio:['ignore','pipe','pipe']});
  child.stdout?.on('data',chunk=>output=(output+chunk).slice(-6000));child.stderr?.on('data',chunk=>output=(output+chunk).slice(-6000));
  let ready=false;
  for(let attempt=0;attempt<160;attempt++) {try {if((await fetch(`${origin}/api/v1/ready`)).ok){ready=true;break;}}catch{}if(child.exitCode!==null)break;await new Promise(resolve=>setTimeout(resolve,250));}
  expect(ready,output).toBe(true);
  const response=await fetch(`${origin}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  expect(response.ok).toBe(true);session=await response.json();expect(session.token).toBeTruthy();
  const adminLogin=await fetch(`${origin}/api/v1/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`admin-${suffix}@example.invalid`,password:'e2e-only-admin-password'})});
  expect(adminLogin.ok).toBe(true);adminSession=await adminLogin.json();expect(adminSession.user.role).toBe('SUPER_ADMIN');
});
test.afterAll(async()=>{
  if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
  if(pool){await pool.query('DELETE FROM auth_sessions WHERE user_id=$1 OR id=$2',[`owner-${suffix}`,adminSession?.claims?.jti||'unused']);await pool.query('DELETE FROM subscriber_users WHERE id=$1',[`owner-${suffix}`]);await pool.query('DELETE FROM pix_transactions WHERE tenant_slug=ANY($1::text[])',[[slug,other]]);await pool.query('DELETE FROM orders WHERE tenant_slug=ANY($1::text[])',[[slug,other]]);await pool.query('DELETE FROM products WHERE tenant_slug=ANY($1::text[])',[[slug,other]]);await pool.query('DELETE FROM categories WHERE tenant_slug=ANY($1::text[])',[[slug,other]]);await pool.query('DELETE FROM tenants WHERE slug=ANY($1::text[])',[[slug,other]]);await pool.end();}
});
async function enterPanel(page:Page){
  await page.route('**/*',route=>{const url=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(url.hostname)||['blob:','data:'].includes(url.protocol)?route.continue():route.abort();});
  await page.addInitScript(({auth,restaurant,cache})=>{localStorage.setItem('aladay_auth_session',JSON.stringify(auth));localStorage.setItem('aladay_prod_tenant_v2',JSON.stringify(restaurant));localStorage.setItem('aladay_prod_tenants_list_v2',JSON.stringify([restaurant]));localStorage.setItem('aladay_prod_customers_v2',cache);localStorage.setItem('aladay_cookie_consent_v1','denied');},{auth:session,restaurant:tenant,cache:legacy});
  await page.goto('/');
  await page.getByRole('button',{name:'Painel & KDS',exact:true}).filter({visible:true}).first().click();
  await page.getByRole('button',{name:'Inteligência',exact:true}).click();
  await expect(page.getByRole('region',{name:'Inteligência do restaurante'})).toBeVisible();
}
async function catalog(){return (await pool.query('SELECT id,name,price_cents FROM products WHERE tenant_slug=$1 ORDER BY id',[slug])).rows;}

test('CSV review requires saved revision and explicit publication confirmation',async({page})=>{
  await enterPanel(page);
  await page.getByLabel('Arquivo de origem (até 650 KB)').setInputFiles({name:'cardapio-e2e.csv',mimeType:'text/csv',buffer:Buffer.from('category,name,price\nPratos,Prato E2E,12.50\n')});
  await expect(page.getByRole('status').filter({hasText:'Rascunho criado'})).toBeVisible();
  const product=page.getByRole('group',{name:'Produto 1',exact:true});
  await expect(product.getByLabel('Nome',{exact:true})).toHaveValue('Prato E2E');
  const publish=page.getByRole('button',{name:'Publicar cardápio revisado',exact:true});
  await expect(publish).toBeDisabled();
  await product.getByLabel(/Preço \(R\$\)/).fill('15.90');
  await expect(publish).toBeDisabled();
  await page.getByRole('button',{name:'Salvar revisão e recalcular diferenças'}).click();
  await expect(page.getByRole('status').filter({hasText:'Revisão salva'})).toBeVisible();
  await expect(publish).toBeDisabled();
  const confirmation=page.getByLabel('Revisei o arquivo original, os candidatos e as diferenças. Confirmo a publicação no catálogo deste restaurante.');
  await confirmation.check();await expect(publish).toBeEnabled();
  await confirmation.uncheck();await expect(publish).toBeDisabled();
  expect(await catalog()).toHaveLength(0);
  await confirmation.check();await publish.click();
  await expect(page.getByRole('status').filter({hasText:'Cardápio publicado com sucesso'})).toBeVisible();
  await expect.poll(async()=>catalog()).toEqual([expect.objectContaining({name:'Prato E2E',price_cents:1590})]);
  expect(await page.evaluate(()=>localStorage.getItem('aladay_prod_customers_v2'))).toBe(legacy);
});

test('malformed import preserves published catalog and authenticated tenant boundaries',async({page,request})=>{
  const before=await catalog();await enterPanel(page);
  await page.getByLabel('Arquivo de origem (até 650 KB)').setInputFiles({name:'suspeito.csv',mimeType:'text/csv',buffer:Buffer.from('category,name,price\nPratos,=IMPORTXML("https://invalid"),1.00\n')});
  await expect(page.getByRole('alert')).toContainText(/Fórmulas|suspeito|inválid/i);
  expect(await catalog()).toEqual(before);
  const cross=await request.post(`/api/v1/tenants/${other}/menu-imports`,{headers:{Authorization:`Bearer ${session.token}`},data:{categories:[],products:[]}});
  expect(cross.status()).toBe(403);
});

test('legacy CRM preview and confirmed migration preserve original browser bytes and default consent false',async({page})=>{
  await enterPanel(page);await page.getByRole('button',{name:/^CRM & Clientes/}).click();
  const wizard=page.getByRole('region',{name:'Migração assistida de clientes'});
  await wizard.getByRole('button',{name:'Ler cadastro legado deste navegador'}).click();
  await expect(wizard.getByText('Sem consentimento',{exact:false})).toBeVisible();
  await wizard.getByRole('checkbox').filter({visible:true}).first().check();
  await wizard.getByLabel('Slug do restaurante de origem').fill(slug);
  await wizard.getByLabel('Retenção do registro de migração (dias)').fill('7');
  await wizard.getByRole('button',{name:'Gerar prévia de diferenças'}).click();
  await expect(wizard.getByRole('cell',{name:'Não autorizado → Não autorizado',exact:true})).toBeVisible();
  const confirm=wizard.getByRole('button',{name:'Confirmar migração revisada'});await expect(confirm).toBeDisabled();
  expect(await page.evaluate(()=>localStorage.getItem('aladay_prod_customers_v2'))).toBe(legacy);
  expect((await pool.query('SELECT count(*)::int AS count FROM crm_customers WHERE tenant_slug=$1',[slug])).rows[0].count).toBe(0);
  await wizard.getByLabel('Confirmo a origem, o destino, o prazo de retenção e as diferenças de telefone, notas e consentimento. Autorizo importar estes registros para este restaurante.').check();
  await confirm.click();await expect(page.getByText(/Migração concluída: 1 cadastro/)).toBeVisible();
  expect((await pool.query('SELECT marketing_consent FROM crm_customers WHERE tenant_slug=$1',[slug])).rows).toEqual([{marketing_consent:false}]);
  expect(await page.evaluate(()=>localStorage.getItem('aladay_prod_customers_v2'))).toBe(legacy);
});

test('owner edits an upsell rule and consumer explicitly requests and chooses a complement',async({page,request,browser})=>{
  const existing=(await pool.query('SELECT id,category_id FROM products WHERE tenant_slug=$1 AND name=$2',[slug,'Prato E2E'])).rows[0];expect(existing).toBeTruthy();
  const complementId=`complement-${suffix}`;
  await pool.query("INSERT INTO products(id,tenant_id,tenant_slug,category_id,name,description,price_cents,is_available) VALUES($1,$2,$2,$3,'Complemento E2E','Complemento de teste',350,true)",[complementId,slug,existing.category_id]);
  const rule=await request.post(`/api/v1/tenants/${slug}/upsell/rules`,{headers:{Authorization:`Bearer ${session.token}`},data:{name:'Regra E2E',enabled:true,priority:0,triggerProductIds:[existing.id],triggerCategoryIds:[],suggestedProductIds:[complementId],minSubtotalCents:0,maxSubtotalCents:null,weekdays:[0,1,2,3,4,5,6],startTime:'00:00',endTime:'00:00',timezone:'UTC',maxImpressionsPerSession:3}});expect(rule.ok()).toBe(true);
  await enterPanel(page);
  const editor=page.getByRole('region',{name:'Sugestões de complementos',exact:true});
  await editor.getByRole('button',{name:'Carregar regras',exact:true}).click();await expect(editor.getByText('Regra E2E',{exact:true})).toBeVisible();
  await editor.getByRole('button',{name:'Editar',exact:true}).click();await editor.getByLabel('Prioridade',{exact:true}).fill('7');
  await editor.getByRole('button',{name:'Salvar regra',exact:true}).click();await expect(editor.getByRole('status').filter({hasText:'Regra salva.'})).toBeVisible();
  expect((await pool.query('SELECT priority FROM upsell_rules WHERE tenant_slug=$1',[slug])).rows[0].priority).toBe(7);
  const publicContext=await browser.newContext({viewport:{width:1440,height:1100}});
  try {
    await publicContext.addInitScript(()=>localStorage.setItem('aladay_cookie_consent_v1','granted'));
    await publicContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const consumer=await publicContext.newPage();await consumer.goto(`${origin}/?loja=${slug}`);
    expect(await consumer.evaluate(()=>localStorage.getItem('aladay_auth_session'))).toBeNull();
    await consumer.getByRole('heading',{name:'Prato E2E',exact:true}).click();
    await consumer.getByRole('button',{name:'Adicionar à Sacola',exact:false}).click();
    await consumer.getByRole('button',{name:/Ver Sacola e Finalizar/}).click();
    await expect(consumer.getByText('1. Sua Sacola de Compras',{exact:true})).toBeVisible();
    await expect(consumer.getByRole('button',{name:'Personalizar e adicionar',exact:true})).toHaveCount(0);
    await consumer.getByRole('button',{name:'Mostrar sugestões',exact:true}).click();
    await expect(consumer.getByRole('button',{name:'Personalizar e adicionar',exact:true})).toBeVisible();
    await expect(consumer.getByText('Itens na sacola (1)',{exact:true})).toBeVisible();
    await consumer.getByRole('button',{name:'Personalizar e adicionar',exact:true}).click();
    await expect(consumer.getByRole('heading',{name:'Complemento E2E',exact:true}).filter({visible:true}).last()).toBeVisible();
    await consumer.getByRole('button',{name:'Adicionar à Sacola',exact:false}).click();
    await consumer.getByRole('button',{name:/Ver Sacola e Finalizar/}).click();
    await expect(consumer.getByText('Itens na sacola (2)',{exact:true})).toBeVisible();
  } finally {await publicContext.close();}
});

test('catalog publication refreshes the draft and native cancel prevents catalog sync',async({page})=>{
  await enterPanel(page);
  const importer=page.getByRole('region',{name:'Inteligência do restaurante'});
  await importer.getByLabel('Arquivo de origem (até 650 KB)').setInputFiles({name:'atualizacao-e2e.csv',mimeType:'text/csv',buffer:Buffer.from('category,name,price\nNova categoria E2E,Novo prato sincronizado E2E,9.90\n')});
  await expect(importer.getByRole('status').filter({hasText:'Rascunho criado'})).toBeVisible();
  await assertAccessible(page, 'section[aria-label="Inteligência do restaurante"]');
  await importer.getByLabel('Revisei o arquivo original, os candidatos e as diferenças. Confirmo a publicação no catálogo deste restaurante.').check();
  await importer.getByRole('button',{name:'Publicar cardápio revisado',exact:true}).click();
  await expect(importer.getByRole('status').filter({hasText:'Cardápio publicado com sucesso'})).toBeVisible();
  await page.getByRole('button',{name:/^Cardápio, Produtos & Categorias/}).click();
  await expect(page.getByText('Novo prato sincronizado E2E',{exact:true}).first()).toBeVisible();
  const before=await catalog();const syncRequests:any[]=[];
  page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith(`/tenants/${slug}/catalog/sync`))syncRequests.push(request.postDataJSON());});
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'Salvar catálogo',exact:true}).click();
  await expect(page.getByText('Publicação cancelada. Rascunho preservado.',{exact:true})).toBeVisible();
  expect(syncRequests).toHaveLength(0);expect(await catalog()).toEqual(before);
  page.once('dialog',dialog=>dialog.accept());
  const response=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith(`/tenants/${slug}/catalog/sync`));
  await page.getByRole('button',{name:'Salvar catálogo',exact:true}).click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByText('Catálogo publicado com sucesso.',{exact:true})).toBeVisible();
  expect(syncRequests).toHaveLength(1);expect(syncRequests[0].confirmed).toBe(true);expect(syncRequests[0].catalogHash).toMatch(/^[a-f0-9]{64}$/);
  expect(syncRequests[0].products).toEqual(expect.arrayContaining([expect.objectContaining({name:'Prato E2E'}),expect.objectContaining({name:'Novo prato sincronizado E2E'})]));
  expect(await catalog()).toEqual(before);
});

test('owner reads real analytics aggregates after authenticated superadmin rebuild',async({page,request})=>{
  const today=new Date().toISOString().slice(0,10),period={from:today,to:today,timezone:'UTC'};
  const ownerAttempt=await request.post(`/api/v1/tenants/${slug}/analytics/rebuild`,{headers:{Authorization:`Bearer ${session.token}`},data:period});expect(ownerAttempt.status()).toBe(403);
  const rebuilt=await request.post(`/api/v1/tenants/${slug}/analytics/rebuild`,{headers:{Authorization:`Bearer ${adminSession.token}`},data:period});expect(rebuilt.ok()).toBe(true);
  const summary=await request.get(`/api/v1/tenants/${slug}/analytics/summary?${new URLSearchParams(period)}`,{headers:{Authorization:`Bearer ${session.token}`}});expect(summary.ok()).toBe(true);const data=await summary.json();expect(data.pending).toBe(false);expect(data.metrics.confirmedRevenueCents).toBe(2450);expect(data.metrics.paidOrdersCount).toBe(1);
  await enterPanel(page);const analytics=page.getByRole('region',{name:'Analytics persistente',exact:true});
  await analytics.getByLabel('Início',{exact:true}).fill(today);await analytics.getByLabel('Fim',{exact:true}).fill(today);await analytics.getByLabel('Fuso horário',{exact:true}).selectOption('UTC');
  await analytics.getByRole('button',{name:'Consultar período',exact:true}).click();
  await expect(analytics.getByText(/Agregados disponíveis\./)).toBeVisible();
  await expect(analytics.getByText('Receita comprovada',{exact:true}).first().locator('..')).toContainText(/24,50/);
  await assertAccessible(page, 'section[aria-label="Analytics persistente"]');
  await expect(analytics.getByText('Pagamentos liquidados',{exact:true}).locator('..')).toContainText('1');
  const cross=await request.get(`/api/v1/tenants/${other}/analytics/summary?${new URLSearchParams(period)}`,{headers:{Authorization:`Bearer ${session.token}`}});expect(cross.status()).toBe(403);
});

test('manual feedback invite, public consent and human approval publish only the reviewed text',async({page,context,request})=>{
  await enterPanel(page);const feedback=page.getByRole('region',{name:'Feedback e avaliações',exact:true});
  await expect(feedback.getByLabel('Pedido entregue',{exact:true}).locator(`option[value="${feedbackOrderId}"]`)).toHaveCount(1);
  await feedback.getByLabel('Pedido entregue',{exact:true}).selectOption(feedbackOrderId);
  await feedback.getByRole('button',{name:'Gerar link de avaliação',exact:true}).click();
  await expect(feedback.getByRole('status').filter({hasText:'Convite gerado.'})).toBeVisible();
  const link=await feedback.getByLabel('Link de uso único',{exact:true}).inputValue();expect(link).toContain('?feedback=');
  const publicPage=await context.newPage();
  await publicPage.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await publicPage.goto(link);await expect(publicPage.getByRole('heading',{name:'Como foi seu pedido?',exact:true})).toBeVisible();
  await expect(publicPage.getByRole('button',{name:'Enviar avaliação',exact:true})).toBeDisabled();
  const consent=publicPage.getByRole('checkbox');await expect(consent).not.toBeChecked();
  await publicPage.getByRole('radio',{name:'5 ★',exact:true}).check();await publicPage.getByRole('textbox').fill('Experiência E2E revisada');
  await consent.check();await publicPage.getByRole('button',{name:'Enviar avaliação',exact:true}).click();
  await expect(publicPage.getByRole('heading',{name:'Avaliação recebida',exact:true})).toBeVisible();
  const pending=await request.get(`/api/v1/tenants/${slug}/feedback/public`);expect(pending.ok()).toBe(true);expect((await pending.json()).data).toHaveLength(0);
  await feedback.getByRole('button',{name:'Consultar avaliações',exact:true}).click();await expect(feedback.getByText('Experiência E2E revisada',{exact:true})).toBeVisible();
  await feedback.getByRole('button',{name:'Aprovar',exact:true}).click();await expect(feedback.getByRole('status').filter({hasText:'Moderação salva.'})).toBeVisible();
  const approved=await request.get(`/api/v1/tenants/${slug}/feedback/public`);expect((await approved.json()).data).toEqual([expect.objectContaining({rating:5,comment:'Experiência E2E revisada'})]);
  expect((await pool.query('SELECT status FROM orders WHERE id=$1',[feedbackOrderId])).rows[0].status).toBe('delivered');
  const token=new URL(link).searchParams.get('feedback');
  const reuse=await request.post('/api/v1/public/feedback',{data:{token,rating:1,publicConsent:false}});expect(reuse.status()).toBe(410);
  await publicPage.close();
});

test('KDS moves an operational order without changing its financial state', async ({ page }) => {
  const orderId = 'ord_' + crypto.randomUUID();
  await pool.query(
    "INSERT INTO orders(id,order_number,tenant_id,tenant_slug,customer_name,customer_phone,subtotal_cents,total_cents,status,payment_method,payment_status) VALUES($1,813,$2,$2,'Cliente KDS E2E','5511988887777',2500,2500,'received','Dinheiro','pending')",
    [orderId, slug],
  );
  await enterPanel(page);
  await page.getByRole('button', { name: 'Gestão de Pedidos (KDS)' }).click();
  await expect(page.getByRole('heading', { name: 'Pedidos da cozinha' })).toBeVisible();
  await expect(page.getByText('Recebidos (1)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar Pedido', exact: true }).click();
  await expect(page.getByText('Em Preparo (1)', { exact: true })).toBeVisible();
  await expect(page.getByText('Recebidos (0)', { exact: true })).toBeVisible();
  const result = await pool.query('SELECT status,payment_status FROM orders WHERE id=$1', [orderId]);
  expect(result.rows[0]).toEqual({ status: 'confirmed', payment_status: 'pending' });
});

test('mobile navigation opens a drawer and returns focus after selection', async ({ page }) => {
  await enterPanel(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const intelligenceNav = page.getByRole('navigation', { name: 'Áreas de Inteligência' });
  await intelligenceNav.getByRole('button', { name: 'Avaliações' }).press('Enter');
  const feedback = page.getByRole('region', { name: 'Feedback e avaliações', exact: true });
  await expect(feedback).toBeFocused();
  await expect(feedback).toBeInViewport();
  const trigger = page.getByRole('button', { name: 'Seções', exact: true });
  await trigger.click();
  const drawer = page.getByRole('dialog', { name: 'Aladay' });
  await expect(drawer.getByRole('button', { name: 'Inteligência' })).toHaveAttribute('aria-current', 'page');
  await drawer.getByRole('button', { name: 'Gestão de Pedidos (KDS)' }).click();
  await expect(drawer).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByText('Gestão de Pedidos (KDS)', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await trigger.click();
  await drawer.getByRole('button', { name: 'Mesas & Garçom (Salão)' }).click();
  await expect(page.getByRole('link', { name: 'Abrir aplicativo Garçom' })).toHaveAttribute('href', '/app/garcom/');
});

test('Garçom signs in, opens a tab and refreshes after reconnecting', async ({ page, context, request }) => {
  const flag = await request.put('/api/v1/tenants/' + slug + '/garcom/settings', {
    headers: { Authorization: 'Bearer ' + adminSession.token }, data: { enabled: true },
  });
  expect(flag.ok()).toBe(true);
  const category = 'garcom-cat-' + suffix;
  const product = 'garcom-product-' + suffix;
  await pool.query('INSERT INTO categories(id,tenant_id,tenant_slug,name) VALUES($1,$2,$2,$3)', [category, slug, 'Salão']);
  await pool.query('INSERT INTO products(id,tenant_id,tenant_slug,category_id,name,price_cents,option_groups) VALUES($1,$2,$2,$3,$4,2500,$5)',
    [product, slug, category, 'Prato do salão', JSON.stringify([{ id: 'side', name: 'Acompanhamento', required: true, minSelections: 1, maxSelections: 1, items: [{ id: 'rice', name: 'Arroz', priceCents: 300 }] }])]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto('/app/garcom');
  await expect(page).toHaveURL(origin + '/app/garcom/');
  await page.getByRole('button', { name: 'Código via WhatsApp' }).click();
  await expect(page.getByLabel('Seu WhatsApp (Com DDD)')).toHaveAttribute('autocomplete', 'tel');
  await page.getByRole('button', { name: 'E-mail e Senha' }).click();
  await page.getByLabel('E-mail de Acesso').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar no Painel' }).click();
  const table = page.getByRole('button', { name: /Mesa 1 Livre/ });
  await table.focus();
  await table.press('Enter');
  await expect(page.getByRole('heading', { name: 'Mesa 1', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await assertAccessible(page, '.garcom');
  await page.setViewportSize({ width: 390, height: 844 });

  await context.setOffline(true);
  await expect(page.getByText(/Sem conexão/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir comanda' })).toBeDisabled();
  const reconnect = page.waitForResponse(response => response.url().endsWith('/garcom/tables') && response.ok());
  await context.setOffline(false);
  await reconnect;

  const open = page.getByRole('button', { name: 'Abrir comanda' });
  await open.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  await expect(page.getByRole('button', { name: /Mesa 1 Ocupada/ })).toBeVisible();
  const result = await pool.query("SELECT count(*)::int AS total FROM garcom_tabs WHERE tenant_id=$1 AND table_number=1", [slug]);
  expect(result.rows[0].total).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: /Mesa 1 Ocupada/ }).click();
  await page.getByLabel('Produto').selectOption(product);
  await expect(page.getByRole('button', { name: 'Adicionar à comanda' })).toBeDisabled();
  await assertAccessible(page, '.garcom');
  await page.getByRole('checkbox', { name: /Arroz/ }).check();
  await page.getByLabel('Quantidade').fill('2');
  await page.getByLabel('Observações').fill('Sem cebola');
  await page.getByRole('button', { name: 'Adicionar à comanda' }).click();
  await expect(page.getByText('Sem cebola', { exact: true })).toBeVisible();
  const send = page.getByRole('button', { name: 'Enviar à cozinha' });
  const sent = page.waitForResponse(response => response.url().endsWith('/submit') && response.ok());
  await send.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
  const data = await (await sent).json();
  const order = await pool.query('SELECT total_cents,payment_status FROM orders WHERE id=$1 AND tenant_id=$2', [data.data.orderId, slug]);
  expect(order.rows).toEqual([{ total_cents: 5600, payment_status: 'pending' }]);
  const status = await request.patch('/api/v1/orders/' + data.data.orderId + '/status', {
    headers: { Authorization: 'Bearer ' + session.token },
    data: { status: 'confirmed' },
  });
  expect(status.ok()).toBe(true);
  const events = await pool.query('SELECT count(*)::int AS total FROM outbox_events WHERE aggregate_id=$1', [data.data.orderId]);
  expect(events.rows[0].total).toBe(0);
  await page.getByRole('button', { name: 'Atualizar', exact: true }).click();
  await expect(page.getByText('Confirmado', { exact: true })).toBeVisible();
});
