#!/usr/bin/env node
// 🧪 Script de verificación de configuración del agente

import Anthropic from '@anthropic-ai/sdk';

async function testSetup() {
  console.log('🧪 VERIFICANDO CONFIGURACIÓN DEL AGENTE\n');
  console.log('='.repeat(70));

  // Test 1: API Key
  console.log('\n1️⃣  Verificando ANTHROPIC_API_KEY...');
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.log('   ❌ No configurada');
    console.log('\n💡 SOLUCIÓN:');
    console.log('   1. Ve a: https://console.anthropic.com/settings/keys');
    console.log('   2. Crea una API key');
    console.log('   3. Configúrala:');
    console.log('      export ANTHROPIC_API_KEY="sk-ant-api03-..."');
    console.log('   O crea archivo .env con:');
    console.log('      ANTHROPIC_API_KEY=sk-ant-api03-...\n');
    return false;
  }

  console.log(`   ✅ Configurada: ${apiKey.substring(0, 20)}...${apiKey.substring(apiKey.length - 4)}`);

  // Test 2: Conexión a Claude
  console.log('\n2️⃣  Verificando conexión con Claude API...');

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: 'Responde solo con "OK" si me recibes correctamente.'
      }]
    });

    const text = response.content[0].text.trim();

    if (text.includes('OK')) {
      console.log('   ✅ Conexión exitosa con Claude API');
      console.log(`   📊 Modelo usado: ${response.model}`);
      console.log(`   💰 Tokens usados: ${response.usage.input_tokens} input + ${response.usage.output_tokens} output`);
    } else {
      console.log('   ⚠️  Respuesta inesperada:', text);
    }

  } catch (error) {
    console.log('   ❌ Error de conexión:', error.message);

    if (error.status === 401) {
      console.log('\n💡 API key inválida. Verifica que:');
      console.log('   1. La copiaste correctamente (sin espacios)');
      console.log('   2. No ha expirado');
      console.log('   3. Tienes créditos en tu cuenta Anthropic\n');
    }

    return false;
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

  // Todo OK
  console.log('\n' + '='.repeat(70));
  console.log('✅ CONFIGURACIÓN COMPLETA Y FUNCIONANDO\n');
  console.log('🚀 Puedes ejecutar el agente con:');
  console.log('   npm run agent:test        # Test con 5 municipios');
  console.log('   npm run agent:scrape      # Procesar 50 municipios');
  console.log('   node agents/tourism-data-scraper.js --limit=100\n');

  return true;
}

testSetup().catch(error => {
  console.error('\n❌ Error fatal:', error);
  process.exit(1);
});
