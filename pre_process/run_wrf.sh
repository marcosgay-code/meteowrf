#!/bin/bash
# =========================================================
# SCRIPT DE EJECUCIÓN WRF (run_wrf.sh)
# =========================================================
ulimit -s unlimited 
set -e
set -u
set -o pipefail # Si un comando falla en una tubería (pipe), detiene el script.

# Configuración de cron
# crontab -e
# TZ=UTC
# 0 5,11,17,23 * * * MPI_PROCS=4 /home/zalo/meteowrf/pre_process/run_wrf.sh 24 >> /home/zalo/meteowrf/pre_process/run_wrf.log 2>&1

show_usage() {
    local max_procs_info=$(nproc 2>/dev/null)
    if [ -n "$max_procs_info" ]; then
        local max_safe=$((max_procs_info - 2))
        if [ "$max_safe" -lt 1 ]; then max_safe=1; fi
        max_procs_info="Máximo sugerido: ${max_safe} (N-2)"
    else
        max_procs_info="No se pudo determinar (Default 1)"
    fi

    echo "Uso: [INT_SEC=n] [MPI_PROCS=n] $0 [SIM_DURATION_HOURS] [YYYY-MM-DD-HH]"
    echo ""
    echo "Parámetros (posicionales):"
    echo "  1. Duración horas (Defecto: 72)"
    echo "  2. Fecha inicio GFS (Defecto: Hoy en hora UTC más reciente 00, 06, 12 o 18)"
    echo ""
    echo "Variables de Entorno:"
    echo "  INT_SEC (Defecto: interval_seconds de namelist.wps). n deber ser multiplo de 3600"
    echo "  MPI_PROCS (Defecto: 1). ${max_procs_info}"
    exit 1
}

# Función única de limpieza
cleanup() {
    if $CLEANUP_CALLED; then
        return
    fi
    CLEANUP_CALLED=true
    echo ""
    echo "Limpiando..."
    echo ""
    # Solo 2 cosas esenciales:
    rm -f "$LOCKFILE" 2>/dev/null      # 1. Eliminar lockfile
    exec 200>&- 2>/dev/null            # 2. Cerrar descriptor
    
    # Signal wrfout_watcher.sh to stop
    if [ -d "$POS_DIR" ]; then
        echo "Creando archivo STOP"
        touch "$POS_DIR/STOP"
    else
        echo "ADVERTENCIA: No se encontró directorio $POS_DIR. No se pudo crear archivo STOP."
    fi
    exit 0
}

# Función mejorada para leer INI (Soporta = y :, ignora comentarios #, resuelve ${var})
get_config_value() {
    local section="$1"
    local key="$2" 
    
    # 1. Extraer valor crudo (soporta = y :)
    local line=$(sed -n "/^\[$section\]/,/^\[/p" "$CONFIG_FILE" | \
                 grep -E "^[[:space:]]*$key[[:space:]]*[=:]" | \
                 grep -v "^[[:space:]]*#" | \
                 head -1)
    
    if [ -z "$line" ]; then
        echo ""
        return
    fi

    # Limpiar clave y separador, espacios y comillas
    local value=$(echo "$line" | sed -E 's/^[^=:]*[=:][[:space:]]*//' | \
                  sed -e 's/[[:space:]]*$//' | \
                  sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//')
    
    # 2. Resolver interpolación ${variable} recursivamente
    local loop_count=0
    # Iterar mientras haya patrón ${...} (max 10 pasadas para seguridad)
    while [[ "$value" =~ \$\{([a-zA-Z0-9_]+)\} ]] && [ $loop_count -lt 10 ]; do
        local var_name="${BASH_REMATCH[1]}"
        local var_val=""
        
        # Buscar en el mismo INI (misma sección)
        if [ "$var_name" != "$key" ]; then
             var_val=$(get_config_value "$section" "$var_name")
        fi
        
        # Si no, buscar en variables de entorno
        if [ -z "$var_val" ]; then
            var_val="${!var_name:-}"
        fi
        
        if [ -n "$var_val" ]; then
            # Reemplazar si se encuentra valor
            value="${value//\$\{$var_name\}/$var_val}"
        else
            # Si no se encuentra (está comentada o no existe), IGNORARLA (preservarla).
            # Cambiamos temporalmente a marcas << >> para evitar bucle infinito en el regex
            value="${value//\$\{$var_name\}/<<${var_name}>>}"
        fi
        ((loop_count++))
    done
    
    # Restaurar variables no resueltas (<<var>> -> ${var})
    value=$(echo "$value" | sed -E 's/<<([a-zA-Z0-9_]+)>>/${\1}/g')
    
    echo "$value"
}

# =====================================================
# 1. PROCESAR PARÁMETROS POSICIONALES (Duración, Fecha)
# =====================================================

# Cambio importante: Usar "${1-}" para manejar parámetros no establecidos
# Esto evita el error cuando no se proporcionan parámetros

# Verificar si el primer parámetro existe (sin error si no existe)
if [ "${1-}" = "-h" ] || [ "${1-}" = "--help" ]; then
    show_usage
fi

# Si hay más de 3 parámetros (contando el parámetro 0 que es el script)
if [ $# -gt 2 ]; then
    echo "Error: Demasiados argumentos."
    show_usage
fi

# Si se ejecuta desde cron se necesita:
USERNAME=${USER:-$(whoami)}
RUN_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
cd $RUN_DIR

CONFIG_FILE="$(realpath "$RUN_DIR/../config.ini" 2>/dev/null || echo "$RUN_DIR/../config.ini")"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Archivo de configuración no encontrado: $CONFIG_FILE"
    exit 1
fi

source "/home/$USERNAME/.wrf_env"

# ===================================================================
# MANEJO DE SEÑALES Y LIMPIEZA BÁSICA
# ===================================================================
LOCKFILE="/tmp/run_wrf.lock"
# Evitar solapamientos con flock
exec 200>"$LOCKFILE"
flock -n 200 || {
    echo ""
    echo "[$(date -u)] Otro proceso WRF está en ejecución (bloqueo activo). Abortando."
    echo ""
    exit 1
}

CLEANUP_CALLED=false
# Capturar salida normal también
trap cleanup EXIT
# Capturar Ctrl+C y errores
trap cleanup INT TERM ERR

# Leer ruta base de namelists desde config.ini
NAMELIST_BASE_PATH=$(get_config_value "paths" "namelist_path")
[ -z "$NAMELIST_BASE_PATH" ] && NAMELIST_BASE_PATH="$RUN_DIR/../"

# Definir rutas completas a los archivos namelist
NAMELIST_WPS="${NAMELIST_BASE_PATH}/namelist.wps"
NAMELIST_INPUT="${NAMELIST_BASE_PATH}/namelist.input"

LEFT_LON=$(get_config_value "domain_bounds" "left_lon")
RIGHT_LON=$(get_config_value "domain_bounds" "right_lon")
TOP_LAT=$(get_config_value "domain_bounds" "top_lat")
BOTTOM_LAT=$(get_config_value "domain_bounds" "bottom_lat")

# Fallback a valores por defecto si no están en config
[ -z "$LEFT_LON" ] && LEFT_LON="-17"
[ -z "$RIGHT_LON" ] && RIGHT_LON="8"
[ -z "$TOP_LAT" ] && TOP_LAT="48"
[ -z "$BOTTOM_LAT" ] && BOTTOM_LAT="30"

DIR_R_WRF="$(get_config_value "paths" "wrf_run_dir")"
[ -z "$DIR_R_WRF" ] && { echo "No se encontró wrf_run_dir en config.ini"; exit 1; }

WRFOUT_FOLDER=$(get_config_value "paths" "wrfout_folder")
[ -z "$WRFOUT_FOLDER" ] && { echo "No se encontró wrfout_folder en config.ini"; exit 1; }

POS_DIR="$(get_config_value "paths" "wrf_pos_dir")" 
[ -z "$POS_DIR" ] && { echo "No se encontró wrf_pos_dir en config.ini"; exit 1; }

POS_SCRIPT="$(get_config_value "processing" "pos_script")"
[ -z "$POS_SCRIPT" ] && { echo "No se encontró pos_script en config.ini"; exit 1; }


WATCHER_SCRIPT="$POS_DIR/$POS_SCRIPT"

echo "$(date): Chequeando $POS_SCRIPT..."

# Find existing instances
if pgrep -f "$POS_SCRIPT" > /dev/null; then
    echo "  -> Instancia de $POS_SCRIPT activa."
    # Verificar que no esté zombie
    if ps -o stat= -p $(pgrep -f "$POS_SCRIPT") | grep -q "Z"; then
        echo "  -> ⚠️  Proceso zombie detectado, terminando..."
        pkill -f "$POS_SCRIPT"
        sleep 2
        echo "  -> Relanzando $WATCHER_SCRIPT..."
        nohup "$WATCHER_SCRIPT" > /dev/null 2>&1 &
    fi
else
    echo "  -> No hay instancia activa. Lanzando $WATCHER_SCRIPT..."
    nohup "$WATCHER_SCRIPT" > /dev/null 2>&1 &
fi
# ------------------------------------------------------------------

# =========================================================
# FUNCIONES DE UTILIDAD Y CRONOMETRAJE
# =========================================================

# Función para obtener fecha actual en formato AAAA-MM-DD-HH con la hora UTC más reciente (00, 06, 12, 18)
get_current_utc_date() {
    local current_hour=$(TZ=UTC date +"%H")
    local current_date=$(TZ=UTC date +"%Y-%m-%d")

    # 0–3 UTC → usar ciclo 18 del día anterior
    if [ "$current_hour" -lt 4 ]; then
        local prev_date=$(TZ=UTC date -d "$current_date -1 day" +"%Y-%m-%d")
        echo "${prev_date}-18"

    # 4–9 UTC → ciclo 00
    elif [ "$current_hour" -lt 10 ]; then
        echo "${current_date}-00"

    # 10–15 UTC → ciclo 06
    elif [ "$current_hour" -lt 16 ]; then
        echo "${current_date}-06"

    # 16–21 UTC → ciclo 12
    elif [ "$current_hour" -lt 22 ]; then
        echo "${current_date}-12"

    # 22–23 UTC → ciclo 18
    else
        echo "${current_date}-18"
    fi
}

# Función para iniciar el cronometraje de un comando
start_timer() {
    COMMAND_START_TIME=$(date +%s%N)
}

# Función para detener el cronometraje y reportar el tiempo con formato inteligente
end_timer() {
    local command_name="$1"
    local end_time=$(date +%s%N)

    # Cálculo en nanosegundos
    local duration_ns=$((end_time - COMMAND_START_TIME))

    # Convertir a segundos (enteros)
    local duration_sec=$((duration_ns / 1000000000))

    # Formatear la duración de forma inteligente
    local formatted_duration=""

    # Si es menos de 1 segundo, mostrar en milisegundos
    if [ $duration_sec -eq 0 ]; then
        local duration_ms=$((duration_ns / 1000000))
        formatted_duration="${duration_ms} ms"

    # Si es entre 1 y 59 segundos, mostrar en segundos
    elif [ $duration_sec -lt 60 ]; then
        formatted_duration="${duration_sec} segundos"

    # Si es 60 segundos o más, convertir a minutos y segundos
    else
        local minutes=$((duration_sec / 60))
        local seconds=$((duration_sec % 60))

        if [ $seconds -eq 0 ]; then
            formatted_duration="${minutes} minutos"
        else
            formatted_duration="${minutes} minutos y ${seconds} segundos"
        fi

        # Opcional: mostrar también en horas si es muy largo
        if [ $minutes -ge 60 ]; then
            local hours=$((minutes / 60))
            local remaining_minutes=$((minutes % 60))

            if [ $remaining_minutes -eq 0 ] && [ $seconds -eq 0 ]; then
                formatted_duration="${hours} horas"
            elif [ $seconds -eq 0 ]; then
                formatted_duration="${hours} horas y ${remaining_minutes} minutos"
            else
                formatted_duration="${hours} horas, ${remaining_minutes} minutos y ${seconds} segundos"
            fi
        fi
    fi

    echo "⏱️ Duración de $command_name: $formatted_duration"
    echo ""
}

# Función auxiliar para generar una lista de valores separados por coma
# Uso: generate_list_string <valor> <dominio> [con_comillas]
generate_list_string() {
    local value="$1"
    local count=$2
    local quote="$3"
    local list=""
    for ((i=1; i<=$count; i++)); do
        if [ "$quote" = "quoted" ]; then
            list+="'${value}',"
        else
            list+="${value},"
        fi
    done
    # Eliminar la coma final para que solo la añada el comando sed
    echo "${list%,}"
}

# Uso:
#   update_param "archivo" "clave" "valor"
# Ejemplo:
#   update_param "$RUN_DIR/namelist.input" "dx" "3000.0"

update_param() {
    local file="$1"
    local key="$2"
    local value="$3"

    # Reemplaza el valor completo, incluyendo fechas, comillas, guiones y puntos
    sed -i -E "s|(^[[:space:]]*${key}[[:space:]]*=[[:space:]]*).*|\1${value}|" "$file"
}

# Función para validar fecha
validate_date() {
    local date_str="$1"

    # Verificar formato AAAA-MM-DD-HH
    if ! [[ "$date_str" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{2}$ ]]; then
        echo "Error: Formato de fecha inválido. Debe ser AAAA-MM-DD-HH"
        return 1
    fi

    # Extraer componentes
    year=$(echo "$date_str" | cut -d'-' -f1)
    month=$(echo "$date_str" | cut -d'-' -f2)
    day=$(echo "$date_str" | cut -d'-' -f3)
    hour=$(echo "$date_str" | cut -d'-' -f4)

    # Validación de rangos básicos (la comprobación completa de 30/31 días es compleja y se omite aquí)
    if [ "$month" -lt 1 ] || [ "$month" -gt 12 ]; then
        echo "Error: Mes inválido. Debe estar entre 01 y 12"
        return 1
    fi
    if [ "$day" -lt 1 ] || [ "$day" -gt 31 ]; then
        echo "Error: Día inválido. Debe estar entre 01 y 31"
        return 1
    fi
    # Validar hora (sólo GFS 00, 06, 12, 18)
    if [ "$hour" -ne 00 ] && [ "$hour" -ne 06 ] && [ "$hour" -ne 12 ] && [ "$hour" -ne 18 ]; then
        echo "Error: Hora inválida. Debe ser 00, 06, 12 o 18"
        return 1
    fi

    return 0
}

# =========================================================
# FUNCIÓN PARA DESCARGA GFS CON FILTRADO REGIONAL
# =========================================================
download_gfs_region() {
    local year="$1"
    local month="$2"
    local day="$3"
    local hour="$4"
    local duration_hours="$5"
    local interval_hours="$6"
    local leftlon="$7"
    local rightlon="$8"
    local toplat="$9"
    local bottomlat="${10}"
    local output_dir="${11}"
    local max_retries="${12:-3}"
    
    cd "$output_dir" || return 1
    
    local batch_date="${year}${month}${day}"
    local batch_hour="${hour}"
    local remote_folder="gfs.${batch_date}/${batch_hour}"
    local base_url="https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
    
    echo "🚀 Descarga GFS con filtrado regional"
    echo "   Fecha: ${year}-${month}-${day} ${hour}:00 UTC"
    echo "   Duración: ${duration_hours}h, Intervalo: ${interval_hours}h"
    echo "   Región: lon [$leftlon, $rightlon], lat [$bottomlat, $toplat]"
    
    # Generar URLs y nombres de archivo
    declare -a urls=()
    declare -a filenames=()
    
    for (( i=0; i<=duration_hours; i+=interval_hours )); do
        local forecast_hour=$(printf "%03d" $i)
        local fname="gfs.t${batch_hour}z.pgrb2.0p25.f${forecast_hour}"
        
        # Construir URL con filtros de región
        local url="${base_url}?"
        url+="file=${fname}"
        url+="&all_lev=on&all_var=on"
        url+="&subregion="
        url+="&leftlon=${leftlon}"
        url+="&rightlon=${rightlon}"
        url+="&toplat=${toplat}"
        url+="&bottomlat=${bottomlat}"
        url+="&dir=/${remote_folder}/atmos"
        
        urls+=("$url")
        filenames+=("${fname}")
    done
    
    echo "   Archivos a descargar: ${#urls[@]}"
    
    # Función interna de descarga
    download_single_file() {
        local url="$1"
        local output="$2"
        local attempt="$3"
        
        # Delay aleatorio para evitar baneo (0-5 segundos)
        sleep $(( RANDOM % 5 ))
        
        # Intentar descarga con curl
        if curl -f -s -S --connect-timeout 30 --max-time 300 -o "$output" "$url" 2>/dev/null; then
            if [ -f "$output" ] && [ -s "$output" ]; then
                local size=$(stat -c%s "$output" 2>/dev/null || echo 0)
                local size_mb=$(echo "scale=1; $size / 1048576" | bc 2>/dev/null || echo "?")
                echo "  ✅ Descargado: $output (${size_mb} MB)"
                return 0
            else
                echo "  ❌ Archivo vacío: $output"
                rm -f "$output"
                return 1
            fi
        else
            echo "  ❌ Fallo descarga: $output (intento $attempt)"
            rm -f "$output"
            return 1
        fi
    }
    
    # Descarga paralela con reintentos
    local max_parallel=5
    local successful=0
    local failed=0
    
    echo "   Iniciando descarga con hasta ${max_parallel} procesos paralelos"
    
    for attempt in $(seq 1 $max_retries); do
        echo ""
        echo "   === Intento ${attempt}/${max_retries} ==="
        
        # Crear lista de archivos pendientes
        declare -a pending_urls=()
        declare -a pending_files=()
        
        for idx in "${!urls[@]}"; do
            local url="${urls[$idx]}"
            local file="${filenames[$idx]}"
            
            # Solo descargar si no existe o está vacío
            if [ ! -f "$file" ] || [ ! -s "$file" ]; then
                pending_urls+=("$url")
                pending_files+=("$file")
            fi
        done
        
        if [ ${#pending_urls[@]} -eq 0 ]; then
            echo "   ✅ Todos los archivos ya descargados"
            break
        fi
        
        echo "   Archivos pendientes: ${#pending_urls[@]}"
        
        # Descargar en paralelo usando background jobs
        declare -a pids=()
        
        for idx in "${!pending_urls[@]}"; do
            local url="${pending_urls[$idx]}"
            local file="${pending_files[$idx]}"
            
            # Esperar si hay demasiados procesos en paralelo
            while [ ${#pids[@]} -ge $max_parallel ]; do
                for pid_idx in "${!pids[@]}"; do
                    local pid="${pids[$pid_idx]}"
                    if ! kill -0 "$pid" 2>/dev/null; then
                        wait "$pid" || true
                        unset 'pids[$pid_idx]'
                    fi
                done
                pids=("${pids[@]}")  # Reindexar array
                sleep 0.5
            done

            # Lanzar descarga en background
            download_single_file "$url" "$file" "$attempt" &
            pids+=($!)
        done
        
        # Esperar a que terminen todos los procesos
        for pid in "${pids[@]}"; do
            wait "$pid" || true
        done
        
        echo "   Intento ${attempt} completado"
        
        # Pequeña pausa entre intentos
        if [ $attempt -lt $max_retries ]; then
            sleep 10
        fi
    done
    
    # Resumen final
    echo ""
    echo "   === RESUMEN DE DESCARGA ==="
    
    for file in "${filenames[@]}"; do
        if [ -f "$file" ] && [ -s "$file" ]; then
            successful=$((successful + 1))
        else
            failed=$((failed + 1))
            echo "   ❌ Faltante: $file"
        fi
    done
    
    echo "   Archivos descargados: ${successful}/${#filenames[@]}"
    echo "   Archivos fallidos: ${failed}"
    
    if [ $failed -eq 0 ]; then
        echo "   ✅ ¡Todas las descargas completadas exitosamente!"
        return 0
    else
        echo "   ⚠️ ${failed} archivos fallaron después de ${max_retries} intentos"
        return 1
    fi
}

# Variable para almacenar el tiempo total de inicio del script
TOTAL_START_TIME=$(date +%s)
COMMAND_START_TIME=0

# Fecha de inicio de la simulación.
date_input=""

# Parámetro 2: Fecha de inicio (Opcional, Default: fecha UTC actual en hora más reciente 00, 06, 12 o 18)
if [ -n "${2-}" ]; then
    date_input="$2"
else
    # Si no hay fecha, usar el valor por defecto (hora UTC más reciente)
    date_input=$(get_current_utc_date)
fi

# Validar fecha
if ! validate_date "$date_input"; then
    exit 1
fi

# Extraer componentes de la fecha
year=$(echo "$date_input" | cut -d'-' -f1)
month=$(echo "$date_input" | cut -d'-' -f2)
day=$(echo "$date_input" | cut -d'-' -f3)
hour=$(echo "$date_input" | cut -d'-' -f4)

# Nombre de este script
SCRIPT_NAME=$(basename "$0" .sh)

# Si la hora es 0, crea copia con fecha del día anterior
if [ "$hour" -eq 0 ]; then
    # Obtener fecha de ayer para el nombre del archivo
    YESTERDAY=$(TZ=UTC date -d "yesterday" +"%Y%m%d")
    BACKUP_FILE="$RUN_DIR/${SCRIPT_NAME}_${YESTERDAY}.log"

    # Crear copia si el archivo actual existe y no está vacío
    if [ -f "$RUN_DIR/${SCRIPT_NAME}.log" ] && [ -s "$RUN_DIR/${SCRIPT_NAME}.log" ]; then
        cp "$RUN_DIR/${SCRIPT_NAME}.log" "$BACKUP_FILE"
        echo "Copia de seguridad diaria creada: $BACKUP_FILE"
    fi

    # Mantenemos solo los últimos 3 archivos de backup antiguos del log 
    # (encuentra los que encajen en el patrón y elimina los que sobran de más de 3 días)
    find "$RUN_DIR" -maxdepth 1 -name "${SCRIPT_NAME}_*.log" -type f -mtime +3 -exec rm -f {} \;

    # Ahora vacía el archivo
    : > "$RUN_DIR/${SCRIPT_NAME}.log"
    echo "Inicializando ${SCRIPT_NAME}.log (nueva tanda diaria)"
    echo ""
fi

# Añade cabecera para cada ejecución
{
    echo "=== EJECUCIÓN WRF ==="
    echo "==========================="
    echo "$(date)"
    echo "==========================="
    echo ""
}

if [ -n "${2-}" ]; then
    echo "Usando hora proporcionada por el usuario: $date_input"
else
    echo "No se proporcionó fecha, usando hora UTC más reciente: $date_input"
fi

# Duración de la simulación WRF (por defecto 24 horas)
SIM_DURATION_HOURS=24
# Parámetro 1: SIM_DURATION_HOURS (Opcional, Default: 72)
if [ -n "${1-}" ]; then
    if [[ "${1}" =~ ^[0-9]+$ ]]; then
        SIM_DURATION_HOURS="$1"
    else
        echo "AVISO: SIM_DURATION_HOURS inválido ($1). Usando el valor por defecto: ${SIM_DURATION_HOURS}"
    fi
fi

# MPI_PROCS: Lee de variable de entorno o usa 1 como default. La validación se hace después.
MPI_PROCS=${MPI_PROCS:-1}

MAX_PROCS_ALLOWED=$(nproc 2>/dev/null)
if [ -n "$MAX_PROCS_ALLOWED" ]; then
    # El máximo permitido es (N - 2), si N >= 3. Si N < 3, solo 1.
    MAX_PROCS_SAFE=$((MAX_PROCS_ALLOWED - 2))
    if [ "$MAX_PROCS_SAFE" -lt 1 ]; then
        MAX_PROCS_SAFE=1
    fi

    if [ "$MPI_PROCS" -gt "$MAX_PROCS_SAFE" ]; then
        echo "AVISO: MPI_PROCS ($MPI_PROCS) es mayor que el máximo seguro ($MAX_PROCS_SAFE)."
        echo "Usando MPI_PROCS=$MAX_PROCS_SAFE para evitar sobrecarga o fallos."
        MPI_PROCS="$MAX_PROCS_SAFE"
    fi
    echo "⚙️ Configuración: MPI_PROCS establecido en ${MPI_PROCS} (Máx. seguro: ${MAX_PROCS_SAFE})"
else
    echo "AVISO: No se pudo determinar el número de procesadores. Usando MPI_PROCS=$MPI_PROCS por defecto."
fi

# INT_SEC: lee de variable de entorno o usa 0 como default
INT_SEC=${INT_SEC:-0}

# Validación: debe ser entero y múltiplo de 3600
if ! [[ "$INT_SEC" =~ ^[0-9]+$ ]]; then
    echo "INT_SEC debe ser un número entero. Se tomará el establecido en $RUN_DIR/namelist.wps"
    INT_SEC=0
fi

if (( INT_SEC % 3600 != 0 )); then
    echo "INT_SEC ($INT_SEC) debe ser un múltiplo de 3600. Se tomará el establecido en $RUN_DIR/namelist.wps"
    INT_SEC=0
fi
   
# Extraer valores numéricos desde el archivo empleando regex de perl -P mostrando solo lo que coincide -o
# Leer parámetros de dominios y geografía
# Se asume que namelist.wps existe y contiene 'max_dom'

MAX_DOM=$(grep -E 'max_dom' "$NAMELIST_WPS" | sed -E 's/.*max_dom *= *([0-9]+).*/\1/')

# Si no se especificó o es invalido de se toma el e namelist.wps
if [ "$INT_SEC" -eq 0 ]; then
    INT_SEC=$(grep -E 'interval_seconds' "$NAMELIST_WPS" | sed -E 's/.*interval_seconds *= *([0-9]+).*/\1/')
else
    sed -i -E "s|(interval_seconds\s*=\s*)([0-9]+)|\1${INT_SEC}|" "$NAMELIST_WPS"
fi

# Convertir INT_SEC a horas
INT_HOURS=$(( INT_SEC / 3600 ))

if [ $((SIM_DURATION_HOURS % INT_HOURS)) -ne 0 ]; then
    new_val=$(( (SIM_DURATION_HOURS / INT_HOURS + 1) * INT_HOURS ))
    echo "⚠️ Ajustando SIM_DURATION_HOURS de $SIM_DURATION_HOURS a $new_val para que sea múltiplo de INT_HOURS=$INT_HOURS (interval_seconds=$INT_SEC) "
    SIM_DURATION_HOURS=$new_val
fi

DX=$(grep -E 'dx' "$NAMELIST_WPS" | sed -E 's/.*dx *= *([0-9]+).*/\1/')
DY=$(grep -E 'dy' "$NAMELIST_WPS" | sed -E 's/.*dy *= *([0-9]+).*/\1/')

E_WE=$(grep e_we "$NAMELIST_WPS" | sed -E 's/.*= *([^!]+).*/\1/')
E_SN=$(grep e_sn "$NAMELIST_WPS" | sed -E 's/.*= *([^!]+).*/\1/')

PARENT_ID=$(grep parent_id "$NAMELIST_WPS" | sed -E 's/.*= *([^!]+).*/\1/')
I_PARENT_START=$(grep i_parent_start "$NAMELIST_WPS" | sed -E 's/.*= *([^!]+).*/\1/')
J_PARENT_START=$(grep j_parent_start "$NAMELIST_WPS" | sed -E 's/.*= *([^!]+).*/\1/')
PARENT_GRID_RATIO=$(grep parent_grid_ratio "$NAMELIST_WPS" | sed -E 's/.*= *([^!]+).*/\1/')

# Calcular time_step recomendado: 6 × dx[km]
TIME_STEP=$(( (DX / 1000) * 6 ))

echo ""
echo "--> Calculando fechas y actualizando namelists..."

# Fecha base del GFS (ya en UTC)
GFS_INIT_STR="${year}-${month}-${day} ${hour}:00 UTC"

# Calcular Inicio Real Simulación
# FIX: Se añade TZ=UTC para forzar el cálculo y la extracción de la hora en UTC.
START_DATE_OBJ=$(TZ=UTC date -d "$GFS_INIT_STR" +"%Y-%m-%d %H")
S_Y=$(echo $START_DATE_OBJ | cut -d'-' -f1)
S_M=$(echo $START_DATE_OBJ | cut -d'-' -f2)
S_D_TMP=$(echo $START_DATE_OBJ | cut -d'-' -f3)
S_D=$(echo $S_D_TMP | cut -d' ' -f1)
S_H=$(echo $START_DATE_OBJ | cut -d' ' -f2)

# Calcular Fin Real Simulación
# FIX: Se añade TZ=UTC para asegurar que la hora de fin también se calcule en UTC.
END_DATE_OBJ=$(TZ=UTC date -d "$GFS_INIT_STR + $SIM_DURATION_HOURS hours" +"%Y-%m-%d %H")
E_Y=$(echo $END_DATE_OBJ | cut -d'-' -f1)
E_M=$(echo $END_DATE_OBJ | cut -d'-' -f2)
E_D_TMP=$(echo $END_DATE_OBJ | cut -d'-' -f3)
E_D=$(echo $E_D_TMP | cut -d' ' -f1)
E_H=$(echo $END_DATE_OBJ | cut -d' ' -f2)

# Calcular Duración en Días/Horas para run_days/run_hours
RUN_DAYS=$((SIM_DURATION_HOURS / 24))
RUN_HOURS=$((SIM_DURATION_HOURS % 24))

# 2. Generar listas de fechas dinámicas basadas en MAX_DOM
START_DATE_TIME_LIST=$(generate_list_string "${S_Y}-${S_M}-${S_D}_${S_H}:00:00" $MAX_DOM "quoted")
END_DATE_TIME_LIST=$(generate_list_string "${E_Y}-${E_M}-${E_D}_${E_H}:00:00" $MAX_DOM "quoted")

START_YEAR_LIST=$(generate_list_string $S_Y $MAX_DOM 0)
START_MONTH_LIST=$(generate_list_string $S_M $MAX_DOM 0)
START_DAY_LIST=$(generate_list_string $S_D $MAX_DOM 0)
START_HOUR_LIST=$(generate_list_string $S_H $MAX_DOM 0)

END_YEAR_LIST=$(generate_list_string $E_Y $MAX_DOM 0)
END_MONTH_LIST=$(generate_list_string $E_M $MAX_DOM 0)
END_DAY_LIST=$(generate_list_string $E_D $MAX_DOM 0)
END_HOUR_LIST=$(generate_list_string $E_H $MAX_DOM 0)

HIST_INT_LIST=$(generate_list_string $((INT_HOURS * 60)) $MAX_DOM 0)

echo "   Inicio: $S_Y-$S_M-$S_D ${S_H}:00:00"
echo "   Fin:    $E_Y-$E_M-$E_D ${E_H}:00:00"
echo "   Duración Namelist: $RUN_DAYS días, $RUN_HOURS horas"

# --- ACTUALIZAR NAMELIST.WPS ---
# Usamos las listas dinámicas con las comillas ya incluidas
update_param "$NAMELIST_WPS" "start_date" "$START_DATE_TIME_LIST"
update_param "$NAMELIST_WPS" "end_date" "$END_DATE_TIME_LIST"

# --- ACTUALIZAR NAMELIST.INPUT ---
# Directorio de salida
update_param "$NAMELIST_INPUT" "history_outname" "\"$WRFOUT_FOLDER/wrfout_d<domain>_<date>\""
update_param "$NAMELIST_INPUT" "output_ready_flag" ".true."

# Duración (sigue igual, no depende de max_dom)
update_param "$NAMELIST_INPUT" "run_days" "$RUN_DAYS"
update_param "$NAMELIST_INPUT" "run_hours" "$RUN_HOURS"

# Fecha Inicio (Usamos las listas dinámicas)
update_param "$NAMELIST_INPUT" "start_year" "$START_YEAR_LIST"
update_param "$NAMELIST_INPUT" "start_month" "$START_MONTH_LIST"
update_param "$NAMELIST_INPUT" "start_day" "$START_DAY_LIST"
update_param "$NAMELIST_INPUT" "start_hour" "$START_HOUR_LIST"

# Fecha Fin (Usamos las listas dinámicas)
update_param "$NAMELIST_INPUT" "end_year" "$END_YEAR_LIST"
update_param "$NAMELIST_INPUT" "end_month" "$END_MONTH_LIST"
update_param "$NAMELIST_INPUT" "end_day" "$END_DAY_LIST"
update_param "$NAMELIST_INPUT" "end_hour" "$END_HOUR_LIST"

update_param "$NAMELIST_INPUT" "interval_seconds" "$INT_SEC"
update_param "$NAMELIST_INPUT" "history_interval" "$HIST_INT_LIST"

# Dominios

update_param "$NAMELIST_INPUT" "max_dom" "$MAX_DOM"

update_param "$NAMELIST_INPUT" "dx" "${DX}.0"
update_param "$NAMELIST_INPUT" "dy" "${DY}.0"
update_param "$NAMELIST_INPUT" "e_we" "$E_WE"
update_param "$NAMELIST_INPUT" "e_sn" "$E_SN"
update_param "$NAMELIST_INPUT" "parent_id" "$PARENT_ID"
update_param "$NAMELIST_INPUT" "i_parent_start" "$I_PARENT_START"
update_param "$NAMELIST_INPUT" "j_parent_start" "$J_PARENT_START"
update_param "$NAMELIST_INPUT" "parent_grid_ratio" "$PARENT_GRID_RATIO"
update_param "$NAMELIST_INPUT" "time_step" "$TIME_STEP"

# =======================================================
# AJUSTE DE NPROCX y NPROCY (Multi-Dominio + Validación)
# =======================================================

HAS_NPROCX=false
HAS_NPROCY=false

if grep -Eq '^\s*nproc_x\s*=' "$NAMELIST_INPUT"; then
    HAS_NPROCX=true
fi

if grep -Eq '^\s*nproc_y\s*=' "$NAMELIST_INPUT"; then
    HAS_NPROCY=true
fi

if [ "$HAS_NPROCX" = true ] && [ "$HAS_NPROCY" = true ]; then

    CURRENT_NPROCX=$(grep -E '^\s*nproc_x\s*=' "$NAMELIST_INPUT" | sed -E 's/.*=\s*([0-9]+).*/\1/')
    CURRENT_NPROCY=$(grep -E '^\s*nproc_y\s*=' "$NAMELIST_INPUT" | sed -E 's/.*=\s*([0-9]+).*/\1/')

    CURRENT_MPI=$(( CURRENT_NPROCX * CURRENT_NPROCY ))

    if [ "$CURRENT_MPI" -ne "$MPI_PROCS" ]; then
        echo ""
        echo "⚠️  nproc_x * nproc_y ≠ MPI_PROCS"
        echo "    Recalculando partición MPI… nproc_x y nproc_y (Óptimo)"
        echo ""

        # Convertir a arrays la listas de e_we y e_sn
        IFS=',' read -r -a E_WE_ARRAY <<< "$E_WE"
        IFS=',' read -r -a E_SN_ARRAY <<< "$E_SN"

        BEST_SCORE=999999999
        FOUND_VALID=false
        BEST_PX=1
        BEST_PY=1

        # Explorar todas las factorizaciones de MPI_PROCS
        for ((px=1; px<=MPI_PROCS; px++)); do
            if (( MPI_PROCS % px != 0 )); then
                continue
            fi

            py=$((MPI_PROCS / px))
            VALID=true
            SCORE=0

            # Validar TODOS los dominios
            for ((d=0; d<MAX_DOM; d++)); do
                WE=${E_WE_ARRAY[$d]// /}
                SN=${E_SN_ARRAY[$d]// /}

                # Regla WRF: dividir (e_we - 1), (e_sn - 1)
                SUB_X=$(( (WE - 1) / px ))
                SUB_Y=$(( (SN - 1) / py ))

                # Regla de estabilidad WRF (mínimo razonable)
                if (( SUB_X < 10 || SUB_Y < 10 )); then
                    VALID=false
                    break
                fi

                # Score geométrico (sin flotantes)
                DIFF=$(( px * SN - py * WE ))
                SCORE=$(( SCORE + DIFF * DIFF ))
            done

            # Seleccionar la mejor solución válida
            if [ "$VALID" = true ] && [ "$SCORE" -lt "$BEST_SCORE" ]; then
                BEST_SCORE=$SCORE
                BEST_PX=$px
                BEST_PY=$py
                FOUND_VALID=true
            fi
        done

        # =======================================================
        # FALLBACK SEGURO
        # =======================================================

        if [ "$FOUND_VALID" = false ]; then
            echo "⚠️  No se encontró una partición MPI válida para los dominios."
            echo "⚠️  Forzando modo seguro: MPI_PROCS=1, nproc_x=1, nproc_y=1"

            MPI_PROCS=1
            BEST_PX=1
            BEST_PY=1
        else
            echo "✅ Partición MPI válida encontrada:"
            echo "   MPI_PROCS      = $MPI_PROCS"
            echo "   nproc_x/y      = $BEST_PX / $BEST_PY"
        fi

        # Actualizar namelist.input con la configuración óptima
        update_param "$NAMELIST_INPUT" "nproc_x" "$BEST_PX"
        update_param "$NAMELIST_INPUT" "nproc_y" "$BEST_PY"

        echo ""
        echo "✓ nproc_x ($BEST_PX) y nproc_y ($BEST_PY) actualizados en namelist.input."
    else
        echo ""
        echo "✓ Partición MPI ya coherente (nproc_x * nproc_y = $MPI_PROCS)"
    fi
else
    echo "ℹ️  nproc_x / nproc_y no definidos en namelist.input."
    echo "ℹ️  Se mantiene paralelización automática de WRF."
fi

echo ""
echo "✓ Namelists actualizados."

rm -f namelist.* 2>/dev/null

# download folder
cd $RUN_DIR/Build_WRF/DATA || exit

echo "Iniciando descarga..."
echo ""

# clean previous downloads
rm -rf gfs.* 2>/dev/null

start_timer

# Ejecutar descarga con download_gfs_region
if [ -n "$LEFT_LON" ] && [ -n "$RIGHT_LON" ] && [ -n "$TOP_LAT" ] && [ -n "$BOTTOM_LAT" ]; then
    if download_gfs_region "$year" "$month" "$day" "$hour" \
        "$SIM_DURATION_HOURS" "$INT_HOURS" \
        "$LEFT_LON" "$RIGHT_LON" "$TOP_LAT" "$BOTTOM_LAT" \
        "$RUN_DIR/Build_WRF/DATA" 3; then

        echo "✅ Descarga GFS completada exitosamente"
        success_count=$(ls gfs.* 2>/dev/null | wc -l)
        fail_count=0
    else
        echo "❌ Descarga GFS falló"
        success_count=$(ls gfs.* 2>/dev/null | wc -l)
        fail_count=$(( (SIM_DURATION_HOURS / INT_HOURS + 1) - success_count ))
    fi
else
    echo "❌ ERROR: Coordenadas no configuradas"
    echo "   Verifique que las coordenadas están en config.ini [domain_bounds]"
    exit 1
fi

end_timer "Descarga GFS Completa"

# Mostrar tamaño total descargado
if [ $success_count -gt 0 ]; then
    total_size=$(du -sh . 2>/dev/null | cut -f1 || echo "N/A")
    avg_size=$(du -sh gfs.* 2>/dev/null | awk '{sum+=$1} END {if (NR>0) printf "%.1f", sum/NR}')
    echo "📦 Tamaño total: $total_size (promedio: ${avg_size}K por archivo)"
fi

# Mostrar archivos descargados
echo ""
echo "Archivos en el directorio:"
ls -lha gfs.t${hour}z.pgrb2.0p25.f* 2>/dev/null | head -10
file_count=$(ls gfs.t${hour}z.pgrb2.0p25.f* 2>/dev/null | wc -l)
if [ $file_count -gt 10 ]; then
    echo "... y $((file_count - 10)) más"
fi

echo ""
echo "====================================="
echo " INICIANDO PROCESO WPS AUTOMATIZADO "
echo "====================================="

cd $RUN_DIR/WPS

echo ""
echo "Eliminando archivos anteriores"

rm -f FILE:* PFILE:* GRIBFILE.* geo_em.* met_em.* *.log namelist.wps 2>/dev/null

# Crear enlace a namelist.wps 
ln -sf "$NAMELIST_WPS" .

#=====================
# Ejecutar geogrid.exe
#=====================
echo ""
echo "== Ejecutando geogrid.exe =="

start_timer
./geogrid.exe > /dev/null 2>&1

# Verificar mensaje de éxito en el log
if ! tail -n 3 geogrid.log | grep -q "Successful completion of program geogrid.exe"; then
    echo "ERROR: geogrid.exe no reportó finalización exitosa en el log."
    tail -n 20 geogrid.log
    exit 1
fi

echo ""
tail -n 1 geogrid.log

echo ""
echo "✓ geogrid.exe completado"
end_timer "geogrid.exe"

#==============================
# ungrib: enlazar GRIB + Vtable
#==============================

echo "Enlazando datos GFS..."

./link_grib.csh $RUN_DIR/Build_WRF/DATA/gfs.t${hour}z.pgrb2.0p25.f*

echo ""
echo "Enlazando Vtable..."
ln -sf ungrib/Variable_Tables/Vtable.GFS Vtable

echo ""
echo "Ejecutando ungrib.exe..."

start_timer
./ungrib.exe > /dev/null 2>&1
# Verificar mensaje de éxito en el log
if ! tail -n 3 ungrib.log | grep -q "Successful completion of program ungrib.exe"; then
    echo "ERROR: ungrib.exe no reportó finalización exitosa en el log."
    tail -n 20 ungrib.log
    exit 1
fi


echo ""
tail -n 1 ungrib.log

echo ""
echo "✓ ungrib.exe completado"
end_timer "ungrib.exe"

# =======================
# Comprobar archivos FILE
# =======================
echo "== Comprobando archivos FILE =="

start_timer

# Buscar TODOS los archivos FILE generados
FILE_LIST=$(ls -1 FILE:* 2>/dev/null)

if [ -z "$FILE_LIST" ]; then
    echo "❌ ERROR: No se han generado archivos FILE."
    exit 1
fi

# Contar archivos encontrados
FILE_COUNT=$(echo "$FILE_LIST" | wc -l)
echo "Se encontraron $FILE_COUNT archivo(s). Comprobando integridad ..."

# Variables para seguimiento
VALID_COUNT=0
INVALID_COUNT=0
TOTAL_SIZE=0

# Comprobar cada archivo individualmente
for FILE in $FILE_LIST; do
    echo -n "  • $FILE: "

    # Verificar si el archivo existe y tiene tamaño
    if [ ! -f "$FILE" ]; then
        echo "❌ NO EXISTE"
        INVALID_COUNT=$((INVALID_COUNT + 1))
        continue
    fi

    # Obtener tamaño del archivo
    FILE_SIZE=$(stat -c%s "$FILE" 2>/dev/null || stat -f%z "$FILE" 2>/dev/null)
    if [ -z "$FILE_SIZE" ]; then
        FILE_SIZE=$(du -b "$FILE" | cut -f1)
    fi
    TOTAL_SIZE=$((TOTAL_SIZE + FILE_SIZE))

    # Comprobar integridad con rd_intermediate
    if util/rd_intermediate.exe "$FILE" >/dev/null 2>&1; then
        echo "✓ VÁLIDO ($(numfmt --to=iec-i --suffix=B $FILE_SIZE 2>/dev/null || echo "${FILE_SIZE}B"))"
        VALID_COUNT=$((VALID_COUNT + 1))
    else
        echo "❌ INVÁLIDO ($(numfmt --to=iec-i --suffix=B $FILE_SIZE 2>/dev/null || echo "${FILE_SIZE}B"))"
        INVALID_COUNT=$((INVALID_COUNT + 1))
    fi
done

echo ""
echo "═══════════════════════════════════════════════"
echo "  RESUMEN DE VERIFICACIÓN"
echo "═══════════════════════════════════════════════"
echo "  Archivos encontrados: $FILE_COUNT"
echo "  Archivos válidos:     $VALID_COUNT ✓"
echo "  Archivos inválidos:   $INVALID_COUNT ✗"

if [ $INVALID_COUNT -gt 0 ]; then
    echo ""
    echo "⚠ ADVERTENCIA: Se encontraron $INVALID_COUNT archivo(s) inválido(s)"

    # Mostrar solo los archivos inválidos
    echo "  Archivos problemáticos:"
    for FILE in $FILE_LIST; do
        if ! util/rd_intermediate.exe "$FILE" >/dev/null 2>&1; then
            echo "    - $FILE"
        fi
    done
else
    echo ""
    echo "✅ TODOS los archivos FILE son válidos"
    echo "  Tamaño total: $(numfmt --to=iec-i --suffix=B $TOTAL_SIZE 2>/dev/null || echo "${TOTAL_SIZE}B")"

    # Borrar archivos gfs (en mi caso, por espacio en disco)
    rm -rf $RUN_DIR/Build_WRF/DATA/gfs.* 2>/dev/null
fi

end_timer "comprobación completa de $FILE_COUNT archivos FILE"

echo "-> Ejecutando metgrid.exe (salida en WPS)"

start_timer
./metgrid.exe >/dev/null 2>&1 || true
# Verificar mensaje de éxito en el log
if ! tail -n 3 metgrid.log | grep -q "Successful completion of program metgrid.exe"; then
    echo "ERROR: metgrid.exe no reportó finalización exitosa en el log."
    if [ -f metgrid.log ]; then
        tail -n 20 metgrid.log
    fi
    exit 1
fi

echo ""
tail -n 1 metgrid.log

echo ""
echo "✓ metgrid.exe completado"
end_timer "metgrid.exe"

# Mostrar archivos met_em*
echo "Archivos met_em* generados:"
ls -lah "$RUN_DIR/WPS"/met_em* 2>/dev/null | head -n 5 || true
met_em_count=$(ls "$RUN_DIR/WPS"/met_em* 2>/dev/null | wc -l || true)
if [ "$met_em_count" -gt 5 ]; then
    echo "... y $((met_em_count - 5)) más"
fi

# Borro archivos que ya no son necesarios (en mi caso, por espacio en disco)
rm -f FILE:* 2>/dev/null

# Ahora pasar a WRF
cd $DIR_R_WRF || { echo "ERROR: $DIR_R_WRF"; exit 1; }

# Borrar ejecuciones anteriores
rm -f rsl.* wrfout* wrfinput_d* met_em* *.log namelist.input 2>/dev/null

# Enlazar namelist
ln -sf "$NAMELIST_INPUT" .

# Enlazar met_em* (si no lo están)
echo ""
echo "Enlazando met_em* desde WPS (relativa)"
ln -sf $RUN_DIR/WPS/met_em* .

echo ""
echo "================================"
echo " Ejecutando real / wrf"
echo " Settings: MPI_PROCS=$MPI_PROCS"
echo "================================"

# Ejecutar real.exe con MPI limitado.

echo ""
echo "-> Ejecutando real.exe con mpirun -np ${MPI_PROCS}"

start_timer
# Ejecuta mpirun en otro proceso que pueda morir sin matar el script principal:
(
  mpirun -np "${MPI_PROCS}" ./real.exe < /dev/null 2>&1
) || true


if [ ! -f rsl.error.0000 ]; then
    echo "ERROR: rsl.error.0000 no existe"
    exit 1
fi

if grep -E "FATAL CALLED|MPI_ABORT|ERROR" rsl.error.0000; then
    echo "ERROR: real.exe falló"
    tail -n 10 rsl.error.0000
    exit 1
fi

if ! grep -q "SUCCESS COMPLETE REAL_EM INIT" rsl.error.0000; then
    echo "ERROR: real.exe no completó correctamente"
    tail -n 10 rsl.error.0000
    exit 1
fi

echo "✓ real.exe completado correctamente"
end_timer "real.exe"

# Comprobar rsl logs (últimas líneas)
echo "Última línea de rsl.error.0000 (si existe):"
[ -f rsl.error.0000 ] && tail -n 1 rsl.error.0000 || echo "rsl.error.0000 no encontrado"

echo ""
echo "-> Ejecutando wrf.exe con mpirun -np ${MPI_PROCS}"
echo ""
echo "Seguir logs en tiempo real (en otra terminal):"
echo "tail -f $DIR_R_WRF/rsl.error.0000 rsl.out.0000"
echo ""

start_timer
(
    mpirun -np "${MPI_PROCS}" ./wrf.exe < /dev/null 2>&1
) || true

if [ ! -f rsl.error.0000 ]; then
    echo "ERROR: rsl.error.0000 no existe"
    exit 1
fi

if grep -E "FATAL CALLED|MPI_ABORT|ERROR" rsl.error.0000; then
    echo "ERROR: wrf.exe falló"
    tail -n 10 rsl.error.0000
    exit 1
fi

if ! grep -q "SUCCESS COMPLETE WRF" rsl.error.0000; then
    echo "ERROR: wrf.exe no completó correctamente"
    tail -n 10 rsl.error.0000
    exit 1
fi

echo "✓ wrf.exe finalizado"
end_timer "wrf.exe"

echo "Revisando rsl.error.0000..."
[ -f rsl.error.0000 ] && tail -n 1 rsl.error.0000 || echo "rsl.error.0000 no encontrado"

if grep -q "SUCCESS COMPLETE WRF" rsl.error.0000; then
    echo ""
    echo "========================"
    echo "  EJECUCIÓN COMPLETADA  "
    echo "========================"
else
    echo "ADVERTENCIA: No se encontró mensaje SUCCESS en rsl.error.0000"
fi

# =========================================================
# CALCULAR Y MOSTRAR TIEMPO TOTAL
# =========================================================
TOTAL_END_TIME=$(date +%s)
TOTAL_DURATION=$((TOTAL_END_TIME - TOTAL_START_TIME))
TOTAL_HOURS=$((TOTAL_DURATION / 3600))
TOTAL_MINUTES=$(((TOTAL_DURATION % 3600) / 60))
TOTAL_SECONDS=$((TOTAL_DURATION % 60))

echo ""
echo "=================================================="
echo "    TIEMPO TOTAL DE EJECUCIÓN DEL SCRIPT    "
echo "=================================================="
echo "Tiempo Total: ${TOTAL_HOURS}h ${TOTAL_MINUTES}m ${TOTAL_SECONDS}s"
echo "=================================================="

exit 0
