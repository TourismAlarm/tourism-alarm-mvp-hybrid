#!/bin/bash
# Script para descargar datos de IDESCAT en paralelo

# Extraer códigos de municipios
echo "📊 Extrayendo códigos de 947 municipios..."
cat /tmp/idescat_municipalities.json | grep -oE '"id":"[0-9]+"' | cut -d'"' -f4 > /tmp/muni_codes.txt

TOTAL=$(wc -l < /tmp/muni_codes.txt)
echo "✅ $TOTAL códigos extraídos"

# Crear directorio temporal
mkdir -p /tmp/idescat_data

# Función para descargar datos de un municipio
download_muni() {
    CODE=$1
    INDEX=$2
    TOTAL=$3

    OUTPUT="/tmp/idescat_data/${CODE}.json"

    # Solo descargar si no existe
    if [ ! -f "$OUTPUT" ]; then
        curl -s "https://api.idescat.cat/emex/v1/dades.json?id=${CODE}" > "$OUTPUT" 2>/dev/null

        # Log cada 50 municipios
        if (( $INDEX % 50 == 0 )); then
            echo "[$INDEX/$TOTAL] ✅ Descargando datos..."
        fi
    fi
}

export -f download_muni

# Descargar en paralelo (8 conexiones simultáneas para no sobrecargar la API)
echo "📡 Descargando datos de $TOTAL municipios en paralelo (8 workers)..."
echo "⏳ Esto tomará ~2-3 minutos..."

cat /tmp/muni_codes.txt | nl | parallel -j 8 --colsep '\t' download_muni {2} {1} $TOTAL

echo "✅ Descarga completada: $(ls /tmp/idescat_data/*.json 2>/dev/null | wc -l) archivos"
