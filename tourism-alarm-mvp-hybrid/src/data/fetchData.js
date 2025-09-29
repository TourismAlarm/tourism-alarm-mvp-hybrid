export async function fetchDataWithFallback(primaryUrl, fallbackUrl) {
  try {
    const response = await fetch(primaryUrl, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.points || !Array.isArray(data.points)) {
      throw new Error('Formato de datos inválido');
    }

    return data;

  } catch (error) {
    console.warn('⚠️ Fallback a datos de respaldo:', error.message);

    try {
      const fallbackResponse = await fetch(fallbackUrl);
      if (fallbackResponse.ok) {
        return await fallbackResponse.json();
      }
    } catch (fallbackError) {
      console.error('❌ Fallback falló:', fallbackError.message);
    }

    // Último recurso: datos mínimos
    return {
      updated_at: new Date().toISOString(),
      municipalities_count: 3,
      real_coordinates_count: 3,
      points: [
        [41.3851, 2.1734, 0.8], // Barcelona
        [41.9794, 2.8214, 0.4], // Girona
        [41.1189, 1.2445, 0.6]  // Tarragona
      ]
    };
  }
}