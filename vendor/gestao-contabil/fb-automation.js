import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkFacebookDevelopers() {
    const browser = await chromium.launch({
        headless: false,
        slowMo: 1000
    });
    
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    
    try {
        console.log('📱 Acessando Facebook Developers...');
        await page.goto('https://developers.facebook.com/apps/', { 
            waitUntil: 'networkidle',
            timeout: 60000 
        });
        
        await page.waitForTimeout(3000);
        
        // Tirar screenshot inicial
        const screenshotPath = path.join(__dirname, 'step1-initial.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`✅ Screenshot inicial salvo: ${screenshotPath}`);
        
        // Verificar se está na página de login
        const isLoginPage = await page.locator('input[type="email"], input[name="email"]').count() > 0;
        
        if (isLoginPage) {
            console.log('🔐 Página de login detectada');
            console.log('⚠️  AÇÃO NECESSÁRIA: Usuário precisa fazer login manualmente');
            
            // Aguardar até que o usuário faça login (detectar mudança de URL)
            console.log('⏳ Aguardando login do usuário...');
            console.log('   Por favor, faça login na janela do navegador que foi aberta.');
            
            await page.waitForURL('**/apps/**', { timeout: 300000 }); // 5 minutos
            console.log('✅ Login detectado! Continuando...');
            
            await page.waitForTimeout(3000);
            await page.screenshot({ path: 'step2-after-login.png', fullPage: true });
        }
        
        // Verificar se há apps existentes
        console.log('🔍 Verificando apps existentes...');
        await page.waitForTimeout(2000);
        
        const hasApps = await page.locator('[role="main"]').count() > 0;
        const createAppButton = page.locator('button:has-text("Create App"), a:has-text("Create App")').first();
        const createAppExists = await createAppButton.count() > 0;
        
        console.log(`📊 Apps existentes detectados: ${hasApps}`);
        console.log(`➕ Botão criar app encontrado: ${createAppExists}`);
        
        await page.screenshot({ path: 'step3-apps-page.png', fullPage: true });
        
        // Listar apps existentes
        const appCards = await page.locator('[data-testid*="app"], .app-card, [class*="appCard"]').all();
        console.log(`📱 Número de apps encontrados: ${appCards.length}`);
        
        if (appCards.length > 0) {
            console.log('📋 Apps existentes:');
            for (let i = 0; i < appCards.length; i++) {
                const appText = await appCards[i].textContent();
                console.log(`   ${i + 1}. ${appText.substring(0, 100)}...`);
            }
        }
        
        // Se não houver apps, criar um novo
        if (appCards.length === 0 && createAppExists) {
            console.log('🆕 Nenhum app encontrado. Iniciando criação...');
            
            await createAppButton.click();
            await page.waitForTimeout(2000);
            await page.screenshot({ path: 'step4-create-app-modal.png', fullPage: true });
            
            // Procurar opção Business
            const businessOption = page.locator('text=/Business/i, [data-testid*="business"]').first();
            if (await businessOption.count() > 0) {
                console.log('✅ Opção Business encontrada');
                await businessOption.click();
                await page.waitForTimeout(1000);
                
                // Clicar em Next/Continue
                const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Próximo")').first();
                if (await nextButton.count() > 0) {
                    await nextButton.click();
                    await page.waitForTimeout(2000);
                    await page.screenshot({ path: 'step5-app-details.png', fullPage: true });
                    
                    // Preencher nome do app
                    const appNameInput = page.locator('input[name*="name"], input[placeholder*="name"]').first();
                    if (await appNameInput.count() > 0) {
                        await appNameInput.fill('Gestao Contabil WhatsApp');
                        console.log('✅ Nome do app preenchido');
                        await page.waitForTimeout(1000);
                        
                        // Clicar em criar
                        const createButton = page.locator('button:has-text("Create"), button:has-text("Criar")').first();
                        if (await createButton.count() > 0) {
                            await createButton.click();
                            console.log('⏳ Criando app...');
                            await page.waitForTimeout(5000);
                            await page.screenshot({ path: 'step6-app-created.png', fullPage: true });
                        }
                    }
                }
            }
        }
        
        // Se já existir app, entrar no primeiro
        if (appCards.length > 0) {
            console.log('🔍 Entrando no primeiro app...');
            await appCards[0].click();
            await page.waitForTimeout(3000);
            await page.screenshot({ path: 'step7-inside-app.png', fullPage: true });
        }
        
        // Procurar WhatsApp na dashboard
        console.log('🔍 Procurando configuração do WhatsApp...');
        const whatsappLink = page.locator('text=/WhatsApp/i').first();
        
        if (await whatsappLink.count() > 0) {
            console.log('✅ WhatsApp encontrado, clicando...');
            await whatsappLink.click();
            await page.waitForTimeout(3000);
            await page.screenshot({ path: 'step8-whatsapp-section.png', fullPage: true });
            
            // Procurar Phone Number ID e Token
            console.log('🔍 Procurando Phone Number ID e Access Token...');
            
            const pageContent = await page.content();
            
            // Procurar padrões de Phone Number ID (geralmente números longos)
            const phoneNumberIdMatch = pageContent.match(/\b\d{15,}\b/);
            if (phoneNumberIdMatch) {
                console.log(`📞 Phone Number ID encontrado: ${phoneNumberIdMatch[0]}`);
            }
            
            // Procurar token (geralmente começa com EAA)
            const tokenMatch = pageContent.match(/EAA[a-zA-Z0-9]{100,}/);
            if (tokenMatch) {
                console.log(`🔑 Access Token encontrado: ${tokenMatch[0]}`);
            }
            
            await page.screenshot({ path: 'step9-final.png', fullPage: true });
        } else {
            console.log('⚠️  WhatsApp não encontrado no app');
            console.log('🔍 Procurando botão "Add Product"...');
            
            const addProductButton = page.locator('button:has-text("Add Product"), a:has-text("Add Product")').first();
            if (await addProductButton.count() > 0) {
                console.log('✅ Botão Add Product encontrado');
                await addProductButton.click();
                await page.waitForTimeout(2000);
                await page.screenshot({ path: 'step10-add-product.png', fullPage: true });
            }
        }
        
        console.log('\n✅ Automação concluída!');
        console.log('📸 Screenshots salvos na pasta do projeto');
        console.log('⏸️  Navegador permanecerá aberto para inspeção manual');
        console.log('   Pressione Ctrl+C para fechar');
        
        // Manter navegador aberto
        await page.waitForTimeout(300000); // 5 minutos
        
    } catch (error) {
        console.error('❌ Erro durante automação:', error.message);
        await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
        throw error;
    } finally {
        await browser.close();
    }
}

checkFacebookDevelopers().catch(console.error);
