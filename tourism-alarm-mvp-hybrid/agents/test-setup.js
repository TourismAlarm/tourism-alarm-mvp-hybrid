#!/usr/bin/env node
// 🧪 Script de verificación de configuración del agente (Universal: Gemini + Claude)

import 'dotenv/config';

async function testSetup() {
  console.log('🧪 VERIFICANDO CONFIGURACIÓN DEL AGENTE UNIVERSAL\n');
  console.log('='.repeat(70));

  let hasValidAPI = false;

  // Test 1: Gemini API Key
  console.log('\n1️⃣  Verificando GEMINI_API_KEY...');
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (geminiKey && !geminiKey.includes('your-') && geminiKey.length > 10) {
    console.log(`   ✅ Configurada: ${geminiKey.substring(0, 15)}...`);

    // Test conexión Gemini
    console.log('\n   📡 Probando conexión con Gemini...');
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

      const result = await model.generateContent('Responde solo "OK"');
      const response = await result.response;
      const text = response.text();

      if (text.includes('OK')) {
        console.log('   ✅ Conexión exitosa con Gemini API');
        hasValidAPI = true;
      } else {
        console.log('   ✅ Gemini responde:', text.substring(0, 50));
        hasValidAPI = true;
      }
    } catch (error) {
      console.log('   ❌ Error de conexión Gemini:', error.message);
    }
  } else {
    console.log('   ⚪ No configurada (opcional si tienes Claude)');
    console.log('   💡 Obtén tu key gratis en: https://aistudio.google.com/apikey');
  }

  // Test 2: Anthropic API Key
  console.log('\n2️⃣  Verificando ANTHROPIC_API_KEY...');
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (anthropicKey && !anthropicKey.includes('your-') && anthropicKey.length > 10) {
    console.log(`   ✅ Configurada: ${anthropicKey.substring(0, 20)}...`);

    // Test conexión Claude
    console.log('\n   📡 Probando conexión con Claude...');
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client = new Anthropic({ apiKey: anthropicKey });

      const response = await client.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: 'Responde solo con "OK"'
        }]
      });

      const text = response.content[0].text.trim();
      console.log('   ✅ Conexión exitosa con Claude API');
      console.log(`   📊 Modelo: ${response.model}`);
      console.log(`   💰 Tokens: ${response.usage.input_tokens} in + ${response.usage.output_tokens} out`);
      hasValidAPI = true;

    } catch (error) {
      console.log('   ❌ Error de conexión Claude:', error.message);
      if (error.status === 401) {
        console.log('   💡 API key inválida - verifica que no ha expirado');
      }
    }
  } else {
    console.log('   ⚪ No configurada (opcional si tienes Gemini)');
    console.log('   💡 Obtén tu key en: https://console.anthropic.com/settings/keys');
  }

  // Test 3: Archivos necesarios
  console.log('\n3️⃣  Verificando archivos necesarios...');

  try {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');

    await readFile(resolve('public/geojson/cat-municipis.json'), 'utf-8');
    console.log('   ✅ cat-municipis.json encontrado');

    await readFile(resolve('data/real-tourism-data.js'), 'utf-8');
    console.log('   ✅ real-tourism-data.js encontrado');

  } catch (error) {
    console.log('   ❌ Error leyendo archivos:', error.message);
    return false;
  }

  // Resultado final
  console.log('\n' + '='.repeat(70));

  if (hasValidAPI) {
    console.log('✅ CONFIGURACIÓN COMPLETA Y FUNCIONANDO\n');
    console.log('🚀 Puedes ejecutar el agente con:');
    console.log('   npm run agent:test        # Test con 5 municipios');
    console.log('   npm run agent:scrape      # Procesar 50 municipios');
    console.log('   npm run agent:big         # Procesar 100 municipios\n');
    return true;
  } else {
    console.log('❌ NO HAY API KEYS VÁLIDAS CONFIGURADAS\n');
    console.log('💡 SOLUCIÓN:');
    console.log('   1. Crea archivo .env en la raíz del proyecto');
    console.log('   2. Copia desde .env.example');
    console.log('   3. Añade al menos una API key:\n');
    console.log('   # Gemini (GRATIS - Recomendado)');
    console.log('   GEMINI_API_KEY=AIzaSy...\n');
    console.log('   # O Claude (De pago)');
    console.log('   ANTHROPIC_API_KEY=sk-ant-...\n');
    return false;
  }
}

testSetup().catch(error => {
  console.error('\n❌ Error fatal:', error);
  process.exit(1);
});
