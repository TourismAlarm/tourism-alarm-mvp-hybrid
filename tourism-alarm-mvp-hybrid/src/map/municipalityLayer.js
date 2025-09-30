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
        const codigo = feature.properties.MUNICIPI;
        const intensity = intensityMap[codigo] || 0.3;
        
        return {
          fillColor: getColor(intensity),
          weight: 1,
          opacity: 1,
          color: 'white',
          fillOpacity: 0.7
        };
      },
      onEachFeature: function(feature, layer) {
        const codigo = feature.properties.MUNICIPI;
        const muni = municipalitiesData.find(m => m.id === codigo);
        
        if (muni) {
          layer.bindPopup(`
            <strong>${muni.name}</strong><br>
            Intensidad: ${(muni.tourism_intensity * 100).toFixed(0)}%<br>
            Población: ${muni.population?.toLocaleString() || 'N/A'}
          `);
          
          layer.on('mouseover', function() {
            this.setStyle({ weight: 3, color: '#666' });
          });
          
          layer.on('mouseout', function() {
            this.setStyle({ weight: 1, color: 'white' });
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