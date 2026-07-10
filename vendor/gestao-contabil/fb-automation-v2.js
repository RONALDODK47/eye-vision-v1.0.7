import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOTS_DIR = path.join(__dirname, 'fb-screenshots');

// Criar diretório de screenshots
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR);
}

async function saveScreenshot(page, name) {
    const filepath = path.join(SCREENSHOTS_DIR, `${name}.png`);
    await page.screenshot({ path: filepath, fullPage: true });
    console.log(`📸 Screenshot salvo: ${filepath}`);
    return filepath;
}

async function checkFacebookDevelopers() {
    let browser;
    
    try {
        console.log('🚀 Iniciando automação do Facebook Developers...\n');
        
        browser = await chromium.launch({
            headless: false,
            slowMo: 500,
            args: ['--start-maximized']
        });
        
        const context = await browser.newContext({
            viewport: null,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        const page = await context.newPage();
        
        // Passo 1: Acessar Facebook Developers
        console.log('📱 Acessando https://developers.facebook.com/apps/...');
        await page.goto('https://developers.facebook.com/apps/', { 
            waitUntil: 'domcontentloaded',
            timeout: 60000 
        });
        
        await page.waitForTimeout(3000);
        await saveScreenshot(page, '01-initial-page');
        
        // Verificar se precisa fazer login
        const needsLogin = await page.locator('input[type="email"], input[name="email"], button:has-text("Log In")').count() > 0;
        
        if (needsLogin) {
            console.log('\n🔐 PÁGINA DE LOGIN DETECTADA');
            console.log('⚠️  AÇÃO NECESSÁRIA: Por favor, faça login manualmente na janela do navegador');
            console.log('⏳ Aguardando login (timeout: 5 minutos)...\n');
            
            try {
                await page.waitForURL('**/apps/**', { timeout: 300000 });
                console.log('✅ Login bem-sucedido!\n');
                await page.waitForTimeout(3000);
                await saveScreenshot(page, '02-after-login');
            } catch (error) {
                console.log('❌ Timeout aguardando login. Continuando mesmo assim...\n');
            }
        }
        
        // Passo 2: Verificar apps existentes
        console.log('🔍 Verificando apps existentes...');
        await page.waitForTimeout(2000);
        
        const pageContent = await page.content();
        await saveScreenshot(page, '03-apps-dashboard');
        
        // Tentar encontrar apps de várias formas
        const appSelectors = [
            '[data-testid*="app"]',
            '.app-card',
            '[class*="appCard"]',
            '[class*="AppCard"]',
            'a[href*="/apps/"]',
            'div[role="article"]'
        ];
        
        let appElements = [];
        for (const selector of appSelectors) {
            const elements = await page.locator(selector).all();
            if (elements.length > 0) {
                console.log(`✅ Encontrados ${elements.length} elementos com seletor: ${selector}`);
                appElements = elements;
                break;
            }
        }
        
        console.log(`📱 Total de apps detectados: ${appElements.length}\n`);
        
        if (appElements.length > 0) {
            console.log('📋 Apps encontrados:');
            for (let i = 0; i < Math.min(appElements.length, 5); i++) {
                const text = await appElements[i].textContent();
                console.log(`   ${i + 1}. ${text.substring(0, 80).replace(/\n/g, ' ')}...`);
            }
            console.log('');
        }
        
        // Passo 3: Criar app se não existir
        const createAppButton = page.locator('button:has-text("Create App"), a:has-text("Create App"), button:has-text("Criar app")');
        const hasCreateButton = await createAppButton.count() > 0;
        
        console.log(`➕ Botão "Create App" encontrado: ${hasCreateButton}\n`);
        
        if (appElements.length === 0 && hasCreateButton) {
            console.log('🆕 Nenhum app encontrado. Iniciando criação de novo app...');
            
            await createAppButton.first().click();
            await page.waitForTimeout(2000);
            await saveScreenshot(page, '04-create-app-modal');
            
            // Procurar tipo Business
            const businessSelectors = [
                'text=/Business/i',
                '[data-testid*="business"]',
                'button:has-text("Business")',
                'div:has-text("Business")'
            ];
            
            let businessClicked = false;
            for (const selector of businessSelectors) {
                const businessOption = page.locator(selector);
                if (await businessOption.count() > 0) {
                    console.log(`✅ Opção Business encontrada com: ${selector}`);
                    await businessOption.first().click();
                    businessClicked = true;
                    await page.waitForTimeout(1500);
                    break;
                }
            }
            
            if (businessClicked) {
                await saveScreenshot(page, '05-business-selected');
                
                // Clicar em Next/Continue
                const nextButton = page.locator('button:has-text("Next"), button:has-text("Continue"), button:has-text("Próximo"), button:has-text("Continuar")');
                if (await nextButton.count() > 0) {
                    await nextButton.first().click();
                    await page.waitForTimeout(2000);
                    await saveScreenshot(page, '06-app-details-form');
                    
                    // Preencher nome do app
                    const appNameInput = page.locator('input[name*="name"], input[placeholder*="name"], input[type="text"]').first();
                    if (await appNameInput.count() > 0) {
                        await appNameInput.fill('Gestao Contabil WhatsApp');
                        console.log('✅ Nome do app preenchido: "Gestao Contabil WhatsApp"');
                        await page.waitForTimeout(1000);
                        
                        // Procurar e preencher email se necessário
                        const emailInput = page.locator('input[type="email"]');
                        if (await emailInput.count() > 0) {
                            console.log('⚠️  Campo de email detectado - pode ser necessário preencher');
                        }
                        
                        await saveScreenshot(page, '07-app-name-filled');
                        
                        // Clicar em criar
                        const createButton = page.locator('button:has-text("Create"), button:has-text("Criar"), button[type="submit"]');
                        if (await createButton.count() > 0) {
                            console.log('🔄 Criando app...');
                            await createButton.first().click();
                            await page.waitForTimeout(5000);
                            await saveScreenshot(page, '08-app-created');
                            console.log('✅ App criado com sucesso!\n');
                        }
                    }
                }
            }
        }
        
        // Passo 4: Entrar no app (se já existir ou foi criado)
        if (appElements.length > 0) {
            console.log('🔍 Entrando no primeiro app...');
            await appElements[0].click();
            await page.waitForTimeout(3000);
            await saveScreenshot(page, '09-inside-app');
        }
        
        // Passo 5: Procurar WhatsApp
        console.log('🔍 Procurando produto WhatsApp...');
        await page.waitForTimeout(2000);
        
        // Procurar link/botão do WhatsApp
        const whatsappSelectors = [
            'a:has-text("WhatsApp")',
            'button:has-text("WhatsApp")',
            'div:has-text("WhatsApp")',
            '[href*="whatsapp"]'
        ];
        
        let whatsappFound = false;
        for (const selector of whatsappSelectors) {
            const whatsappElement = page.locator(selector);
            if (await whatsappElement.count() > 0) {
                console.log(`✅ WhatsApp encontrado com: ${selector}`);
                await whatsappElement.first().click();
                whatsappFound = true;
                await page.waitForTimeout(3000);
                await saveScreenshot(page, '10-whatsapp-section');
                break;
            }
        }
        
        if (!whatsappFound) {
            console.log('⚠️  WhatsApp não encontrado. Procurando "Add Product"...');
            
            const addProductButton = page.locator('button:has-text("Add Product"), a:has-text("Add Product"), button:has-text("Adicionar produto")');
            if (await addProductButton.count() > 0) {
                console.log('✅ Botão "Add Product" encontrado');
                await addProductButton.first().click();
                await page.waitForTimeout(2000);
                await saveScreenshot(page, '11-add-product-modal');
                
                // Procurar WhatsApp na lista de produtos
                const whatsappProduct = page.locator('text=/WhatsApp/i');
                if (await whatsappProduct.count() > 0) {
                    console.log('✅ Produto WhatsApp encontrado na lista');
                    await whatsappProduct.first().click();
                    await page.waitForTimeout(2000);
                    
                    // Clicar em Set Up
                    const setupButton = page.locator('button:has-text("Set up"), button:has-text("Configurar")');
                    if (await setupButton.count() > 0) {
                        await setupButton.first().click();
                        await page.waitForTimeout(3000);
                        await saveScreenshot(page, '12-whatsapp-setup');
                        whatsappFound = true;
                    }
                }
            }
        }
        
        // Passo 6: Extrair Phone Number ID e Access Token
        if (whatsappFound) {
            console.log('\n🔍 Procurando Phone Number ID e Access Token...');
            await page.waitForTimeout(2000);
            
            const pageText = await page.textContent('body');
            const pageHTML = await page.content();
            
            // Procurar Phone Number ID (geralmente 15+ dígitos)
            const phoneNumberIdMatches = pageHTML.match(/\b\d{15,}\b/g);
            if (phoneNumberIdMatches && phoneNumberIdMatches.length > 0) {
                console.log('\n📞 PHONE NUMBER ID(s) ENCONTRADO(S):');
                const uniqueIds = [...new Set(phoneNumberIdMatches)];
                uniqueIds.slice(0, 5).forEach(id => {
                    console.log(`   ${id}`);
                });
            } else {
                console.log('\n⚠️  Phone Number ID não encontrado automaticamente');
            }
            
            // Procurar Access Token (geralmente começa com EAA)
            const tokenMatches = pageHTML.match(/EAA[a-zA-Z0-9_-]{100,}/g);
            if (tokenMatches && tokenMatches.length > 0) {
                console.log('\n🔑 ACCESS TOKEN(S) ENCONTRADO(S):');
                tokenMatches.forEach(token => {
                    console.log(`   ${token}`);
                });
            } else {
                console.log('\n⚠️  Access Token não encontrado automaticamente');
            }
            
            // Procurar por campos de input que possam conter esses valores
            const inputs = await page.locator('input[readonly], input[disabled], textarea[readonly]').all();
            console.log(`\n🔍 Campos de input somente leitura encontrados: ${inputs.length}`);
            
            for (let i = 0; i < inputs.length; i++) {
                const value = await inputs[i].inputValue().catch(() => '');
                if (value && value.length > 20) {
                    console.log(`   Input ${i + 1}: ${value.substring(0, 50)}...`);
                }
            }
            
            await saveScreenshot(page, '13-final-state');
        }
        
        // Salvar HTML completo para análise
        const htmlPath = path.join(SCREENSHOTS_DIR, 'page-content.html');
        const htmlContent = await page.content();
        fs.writeFileSync(htmlPath, htmlContent);
        console.log(`\n💾 HTML completo salvo em: ${htmlPath}`);
        
        console.log('\n✅ AUTOMAÇÃO CONCLUÍDA!');
        console.log(`📁 Screenshots salvos em: ${SCREENSHOTS_DIR}`);
        console.log('⏸️  Navegador permanecerá aberto por 5 minutos para inspeção manual');
        console.log('   Pressione Ctrl+C para fechar antes\n');
        
        // Manter navegador aberto
        await page.waitForTimeout(300000);
        
    } catch (error) {
        console.error('\n❌ ERRO DURANTE AUTOMAÇÃO:', error.message);
        console.error('Stack:', error.stack);
        
        if (browser) {
            const pages = await browser.contexts()[0]?.pages();
            if (pages && pages[0]) {
                await saveScreenshot(pages[0], 'error-screenshot');
            }
        }
        
        throw error;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Executar
checkFacebookDevelopers().catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
});
