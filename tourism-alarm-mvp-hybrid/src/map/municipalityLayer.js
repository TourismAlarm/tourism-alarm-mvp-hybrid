import * as topojson from 'topojson-client';

export async function createMunicipalityLayer(map, municipalitiesData) {
  try {
    // Cargar TopoJSON
    const response = await fetch('/geojson/cat-municipis.json');
    const topoData = await response.json();
    
    // Convertir a GeoJSON
    const geojson = topojson.feature(topoData, topoData.objects.municipis);
    
    // Crear mapa de intensidades por código INE
    const intensityMap = {};
    municipalitiesData.forEach(m => {
      if (m.id) {
        intensityMap[m.id] = m.tourism_intensity || 0.5;
      }
    });
    
    // Función para obtener color según intensidad
    function getColor(intensity) {
      return intensity > 0.8 ? '#ff0000' :
             intensity > 0.6 ? '#ff8000' :
             intensity > 0.4 ? '#ffff00' :
             intensity > 0.2 ? '#66ff00' :
                               '#00ff60';
    }
    
    // Crear capa coroplética
    const choroLayer = L.geoJson(geojson, {
      style: function(feature) {
        const codigo = String(feature.id);
        const intensity = intensityMap[codigo] || 0.3;

        return {
          fillColor: getColor(intensity),
          weight: 0.5,        // Reducido de 1 para bordes más finos
          opacity: 0.8,       // Reducido de 1 para bordes semi-transparentes
          color: '#333333',   // Cambiado de 'white' a gris sutil
          fillOpacity: 0.3    // Reducido de 0.5 para mucha más transparencia
        };
      },
      onEachFeature: function(feature, layer) {
        const codigo = String(feature.id);
        const muni = municipalitiesData.find(m => m.id === codigo);
        
        if (muni) {
          const dataSource = muni.has_real_data ? '✅ Datos reales' : '📐 Estimado';
          const hotelInfo = muni.hotel_places > 0 ?
            `<br>Plazas hoteleras: ${muni.hotel_places.toLocaleString()}` : '';

          layer.bindPopup(`
            <strong>${muni.name}</strong><br>
            Intensidad turística: ${(muni.tourism_intensity * 100).toFixed(0)}%<br>
            Categoría: ${muni.categoria}<br>
            ${dataSource}${hotelInfo}${muni.population > 0 ? `<br>Población: ${muni.population.toLocaleString()}` : ''}
          `);
          
          layer.on('mouseover', function() {
            this.setStyle({ weight: 2, color: '#000' });  // Hover más sutil
          });

          layer.on('mouseout', function() {
            this.setStyle({ weight: 0.5, color: '#333333' });  // Volver al estilo original mejorado
          });
        }
      }
    });
    
    return choroLayer;
    
  } catch (error) {
    console.error('Error cargando mapa coroplético:', error);
    return null;
  }
}