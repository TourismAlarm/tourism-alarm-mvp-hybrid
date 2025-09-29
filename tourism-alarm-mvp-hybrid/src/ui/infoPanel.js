export function updateInfoPanel(statusText, stats) {
  const statusEl = document.getElementById('status');
  const statsEl = document.getElementById('stats');

  if (statusEl) {
    statusEl.textContent = statusText;
  }

  if (statsEl && stats) {
    statsEl.innerHTML = `
      📊 ${stats.municipalities} municipios<br>
      🎯 ${stats.realCoords} coords exactas<br>
      🗺️ ${stats.points} puntos heatmap
    `;
  } else if (statsEl) {
    statsEl.innerHTML = '';
  }
}