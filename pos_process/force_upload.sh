#!/bin/bash
# force_upload.sh - Sube los archivos generados a la web manualmente

FTP_URL="sftp://146.59.12.82"
FTP_USER="ubuntu"
FTP_PASS="DR7X33aUbyZA2026"
FTP_REMOTE="/var/www.app.meteonube.es"

echo "=========================================="
echo "Iniciando subida manual al servidor SFTP"
echo "=========================================="

echo "1. Subiendo manifest.json..."
curl -k --ftp-create-dirs -T /home/meteo/meteowrf/web_viewer/manifest.json \
  "${FTP_URL}${FTP_REMOTE}/manifest.json" \
  --user "${FTP_USER}:${FTP_PASS}" \
  --silent --show-error || echo "Error subiendo manifest"

echo "2. Subiendo gráficas de Galicia..."
cd /home/meteo/meteowrf/WRF_OUT/PLOTS

# Buscar archivos modificados en las últimas 24 horas y subirlos
find Galicia -type f \( -name "*.webp" -o -name "*.json" \) -mtime -1 | while read file; do
  echo "  -> Subiendo $file"
  # URL encodear los espacios si los hubiera, aunque los webp y json de meteowrf no suelen tener
  raw_path="${FTP_REMOTE}/PLOTS/${file}"
  curl -k --ftp-create-dirs -T "$file" \
    "${FTP_URL}${raw_path}" \
    --user "${FTP_USER}:${FTP_PASS}" \
    --silent --show-error || echo "  -> Error subiendo $file"
done

echo "=========================================="
echo "¡Subida manual completada!"
echo "=========================================="
