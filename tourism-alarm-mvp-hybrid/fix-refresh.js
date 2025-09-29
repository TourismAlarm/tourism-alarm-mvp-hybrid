// 🔧 Fix botón refresh - Tourism Alarm Catalunya
console.log('🔄 Cargando fix botón refresh...');

document.addEventListener('DOMContentLoaded', () => {
  // Buscar botón por múltiples IDs posibles
  const refreshBtn = document.getElementById('btn-refresh') ||
                     document.getElementById('refreshBtn') ||
                     document.querySelector('[id*="refresh"]');

  if (refreshBtn) {
    console.log('✅ Botón refresh encontrado:', refreshBtn.id);

    // Event listener simple y funcional
    refreshBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      console.log('🔄 Refresh clickeado - recargando datos...');

      // Feedback visual inmediato
      const originalText = refreshBtn.textContent;
      refreshBtn.disabled = true;
      refreshBtn.textContent = '🔄 Actualizando...';
      refreshBtn.style.opacity = '0.6';

      try {
        // Opción 1: Forzar recarga de datos JSON
        const timestamp = Date.now();
        const response = await fetch(`/data/current.json?t=${timestamp}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });

        if (response.ok) {
          // Opción 2: Recargar página completa (más simple y seguro)
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        } else {
          throw new Error('Error cargando datos');
        }

      } catch (error) {
        console.error('Error refresh:', error);

        // Fallback: reload simple
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    });

    console.log('✅ Event listener refresh conectado exitosamente');
  } else {
    console.warn('⚠️ Botón refresh no encontrado - verificar HTML');

    // Debug: mostrar todos los botones disponibles
    const allButtons = document.querySelectorAll('button');
    console.log('Botones disponibles:', Array.from(allButtons).map(b => ({
      id: b.id,
      text: b.textContent,
      classes: b.className
    })));
  }
});

// Debug helper
setTimeout(() => {
  console.log('🔍 Estado botones después de 2 segundos:', {
    refresh_encontrado: !!document.getElementById('btn-refresh'),
    total_botones: document.querySelectorAll('button').length
  });
}, 2000);