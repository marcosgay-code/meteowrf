# Informe: segundo lanzamiento WRF (18:15) — previsión días +1, +2 y +3

**Proyecto:** meteowrf  
**Fecha:** 21 de mayo de 2026  
**Asunto:** Ampliación del pipeline de previsión con una segunda ejecución diaria  

---

## 1. Situación actual

El sistema ejecuta WRF automáticamente vía **crontab**:

```bash
15 6 * * * MPI_PROCS=16 /home/meteo/meteowrf/pre_process/run_wrf_disjoint.sh $(date +%Y-%m-%d-00) >> /home/meteo/meteowrf/pre_process/run_wrf_disjoint.log 2>&1
```

**Qué hace:**

- Usa el ciclo GFS **00Z del día actual**.
- Simula **3 días** consecutivos (`DAYS_TO_RUN=3`, valor por defecto).
- Cada día cubre **13 horas**, franja **06:00–19:00 UTC** (~08:00–21:00 hora peninsular en verano / ~07:00–20:00 en invierno).

| Día simulado    | Offset respecto al ciclo GFS |
|-----------------|------------------------------|
| Hoy             | +0                           |
| Mañana          | +1                           |
| Pasado mañana   | +2                           |

El script `run_wrf_disjoint.sh` descarga GFS, ejecuta WPS (geogrid, ungrib, metgrid), lanza WRF y activa el post-procesado automático de salidas.

---

## 2. Necesidad

Añadir una **segunda ejecución diaria a las 18:15** que genere previsión para:

| Día simulado  | Offset |
|---------------|--------|
| Mañana        | +1     |
| Pasado mañana | +2     |
| +3 días       | +3     |

Misma franja horaria que la ejecución matinal (**06:00–19:00 UTC**, 13 h/día).

**Objetivo operativo:** actualizar la previsión de los próximos días con datos GFS más recientes y extender el horizonte hasta el día +3.

---

## 3. Limitaciones técnicas

### 3.1 Desplazamiento de inicio del bucle

El script **no permite** elegir desde qué día empieza el bucle. Siempre procesa offsets **0, 1 y 2**:

```bash
for DAY_OFFSET in $(seq 0 $MAX_DAY_OFFSET); do
```

**Consecuencia:** una segunda línea de crontab **sin modificar el script** seguiría simulando hoy + 2 días, no mañana + 2 días.

No es viable resolverlo solo cambiando la fecha en cron:

- Pasar la fecha de mañana (`tomorrow-00`) falla: el GFS de mañana 00Z **no existe** a las 18:15 de hoy.
- Los parámetros actuales del script (fecha GFS, horas/día, número de días) **no incluyen** un desplazamiento de inicio.

### 3.2 Fórmula de horas de previsión (ciclos GFS ≠ 00Z)

El cálculo de la hora de inicio de simulación **asume implícitamente** que el ciclo GFS es **00Z**:

```bash
F_START=$(( DAY_OFFSET * 24 + 6 ))
```

Con ciclo **12Z** y `DAY_OFFSET=1`, el script actual arrancaría a las **18:00 UTC**, no a las **06:00 UTC**:

| Ciclo GFS | DAY_OFFSET | F_START actual | Inicio real   | Esperado      |
|-----------|------------|----------------|---------------|---------------|
| 21-may 12Z | 1         | 30 h           | 22-may 18:00  | 22-may 06:00  |
| 21-may 12Z | 2         | 54 h           | 23-may 18:00  | 23-may 06:00  |
| 21-may 12Z | 3         | 78 h           | 24-may 18:00  | 24-may 06:00  |

**Consecuencia:** usar el ciclo 12Z en cron (más reciente que 00Z) **sin corregir `F_START`** desplaza la ventana horaria ~12 h. La ejecución vespertina no cumpliría la franja 06:00–19:00 UTC.

---

## 4. Solución propuesta

### 4.1 Modificación del script (obligatoria)

**Archivo:** `pre_process/run_wrf_disjoint.sh`  
**Alcance:** ~15–20 líneas. Sin impacto en la ejecución matinal (ciclo 00Z, `DAY_START_OFFSET=0` por defecto).

#### Cambio A: `DAY_START_OFFSET`

Introducir variable de entorno **`DAY_START_OFFSET`** (valor por defecto: `0`):

| Valor | Comportamiento                         |
|-------|----------------------------------------|
| `0`   | Actual: días +0, +1, +2 (sin cambios)  |
| `1`   | Nuevo: días +1, +2, +3                 |

1. Documentar `DAY_START_OFFSET` en la ayuda del script (`show_usage`).
2. Tras el bloque de `DAYS_TO_RUN`, inicializar con valor por defecto seguro:
   ```bash
   DAY_START_OFFSET=${DAY_START_OFFSET:-0}
   ```
   Así la ejecución matinal (cron sin definir la variable) mantiene impacto nulo. Si la variable está vacía, también cae a `0`.
3. Validar que sea un entero ≥ 0 (mismo criterio que `DAYS_TO_RUN`). Si el valor es inválido, emitir error y abortar.
4. Sustituir el bucle:
   - **Antes:** `seq 0 .. (DAYS_TO_RUN - 1)`
   - **Después:** `seq DAY_START_OFFSET .. (DAY_START_OFFSET + DAYS_TO_RUN - 1)`

#### Cambio B: corregir `F_START` para cualquier ciclo GFS

Sustituir la fórmula fija por una que tenga en cuenta la hora del ciclo GFS. La variable `hour` se extrae del parámetro de fecha con `hour=$(echo "$date_input" | cut -d'-' -f4)` (valores válidos: `00`, `06`, `12`, `18`).

- **Antes:** `F_START=$(( DAY_OFFSET * 24 + 6 ))`
- **Después:** `F_START=$(( DAY_OFFSET * 24 + 6 - 10#$hour ))`

**Seguridad con números octales en Bash:** dentro de `$(( ... ))`, Bash interpreta los enteros con cero a la izquierda como octales (`06` → 6, pero `08` o `09` provocarían error de sintaxis). Aunque los ciclos GFS actuales no provocan fallo, conviene forzar base 10 con el prefijo `10#` en la operación aritmética para evitar errores ante formatos imprevistos.

Con `hour=00` (ejecución matinal) el resultado es idéntico al actual. Con `hour=12` (ejecución vespertina) los offsets +1, +2, +3 arrancan a las 06:00 UTC del día correspondiente.

**Verificación (GFS 21-may 12Z):**

| DAY_OFFSET | F_START | Inicio simulación |
|------------|---------|-------------------|
| 1          | 18 h    | 22-may 06:00 UTC  |
| 2          | 42 h    | 23-may 06:00 UTC  |
| 3          | 66 h    | 24-may 06:00 UTC  |

El resto del pipeline (descarga, namelists, WPS, WRF, post-proceso) **reutiliza `F_START` y `DAY_OFFSET`**; no requiere cambios adicionales una vez corregida la fórmula.

### 4.2 Configuración crontab (segunda línea)

```bash
15 18 * * * DAY_START_OFFSET=1 MPI_PROCS=16 /home/meteo/meteowrf/pre_process/run_wrf_disjoint.sh $(date +%Y-%m-%d-12) 13 3 >> /home/meteo/meteowrf/pre_process/run_wrf_disjoint_evening.log 2>&1
```

| Parámetro            | Valor | Motivo                                                              |
|----------------------|-------|---------------------------------------------------------------------|
| Hora                 | 18:15 | Segunda tanda diaria                                                |
| `DAY_START_OFFSET=1` | 1     | Saltar hoy; cubrir días +1, +2, +3                                  |
| Fecha GFS            | `...-12` | Ciclo 12Z del día actual; a las ~18:15 peninsular (~16:15 UTC en verano) ya suele estar disponible |
| `13 3`               | 13 h, 3 días | Misma franja y duración que la mañana (explícito; son los defaults) |
| Log                  | `run_wrf_disjoint_evening.log` | Separar trazabilidad de la ejecución matinal              |

**Redundancia positiva en el cron:** pasar `$(date +%Y-%m-%d-12)` de forma explícita mejora la legibilidad de las tareas programadas: quien lea el crontab ve el ciclo GFS sin abrir el script (igual que la mañana con `...-00`). Además evita ambigüedades de zona horaria: `date` en cron usa la TZ del sistema, mientras que la lógica interna del script trabaja en UTC.

Como referencia, la función `get_current_utc_date` del script ya asignaría el ciclo **12** automáticamente si la ejecución ocurre entre **16 y 21 UTC** y **no** se pasa fecha como argumento. A las ~18:15 peninsular en verano (~16:15 UTC) caería en esa franja. Aun así, conviene seguir pasando la fecha explícitamente: es coherente con el cron matinal, no depende de acertar con la hora exacta del cron y deja claro qué ciclo se usa aunque cambie la TZ del servidor.

**Ejecución matinal:** sin cambios.

---

## 5. Archivos implicados

| Archivo                              | Acción                                                                 |
|--------------------------------------|------------------------------------------------------------------------|
| `pre_process/run_wrf_disjoint.sh`    | **Modificar** (`DAY_START_OFFSET` + corrección de `F_START`)           |
| `crontab`                            | **Añadir** segunda entrada                                             |
| `config.ini`                         | Sin cambios (rutas, dominio, post-proceso)                             |
| `namelist.wps` / `namelist.input`    | Sin cambios (los actualiza el script en runtime)                       |
| `pos_process/run_out.sh` + watcher   | Sin cambios (mismo flujo reactivo)                                     |
| Logs                                 | Nuevo: `run_wrf_disjoint_evening.log`                                  |

---

## 6. Resultado operativo esperado

**Ejemplo (hoy = 21 de mayo, servidor en hora peninsular):**

| Ejecución  | Hora  | Ciclo GFS   | Días simulados | Ventana diaria |
|------------|-------|-------------|----------------|----------------|
| Matinal    | 06:15 | 21-may 00Z  | 21, 22, 23     | 06–19 UTC      |
| Vespertina | 18:15 | 21-may 12Z  | 22, 23, 24     | 06–19 UTC      |

La ejecución vespertina **actualiza** la previsión de los días 22 y 23 (ya calculados por la mañana, pero con GFS más reciente) y **añade** el día 24.

---

## 7. Riesgos y consideraciones

| Riesgo              | Descripción                                                                 | Mitigación                                                                 |
|---------------------|-----------------------------------------------------------------------------|----------------------------------------------------------------------------|
| Bloqueo mutuo       | Ambas ejecuciones usan `/tmp/run_wrf.lock`; solo una corre a la vez         | Monitorizar duración de la corrida matinal; si supera ~12 h, la vespertina abortará |
| Solapamiento de salidas | Los `wrfout` de mismas fechas/horas se sobrescriben                    | Comportamiento deseado (previsión actualizada)                             |
| Zona horaria cron   | 6:15 y 18:15 dependen de la TZ del sistema; la franja UTC varía en invierno/verano | Confirmar TZ del servidor (peninsular) o fijar `TZ=` en crontab     |
| Disponibilidad GFS 12Z | El ciclo 12Z puede tardar en publicarse (~4 h tras la hora de ciclo) | Monitorizar la descarga en la primera semana; reintentos ya implementados |
| Carga de cómputo    | Segunda corrida completa (3 días × WRF con 16 procesos)                     | Verificar que el hardware aguanta dos tandas/día                           |

---

## 8. Alternativas descartadas

| Alternativa                         | Motivo de descarte                                      |
|-------------------------------------|---------------------------------------------------------|
| Solo añadir cron, sin tocar script  | No cumple el requisito (seguiría simulando el día 0)    |
| Copiar el script entero             | Duplicación de mantenimiento                            |
| Tres llamadas independientes al script | Repite geogrid/descarga; mucho más lento              |
| Fecha GFS de mañana en cron         | Datos inexistentes a las 18:15                          |
| Vespertina con GFS 00Z + `DAY_START_OFFSET=1` | Funciona con la fórmula actual, pero **no actualiza** con datos más recientes; solo extiende al día +3 |
| Vespertina con GFS 12Z sin corregir `F_START` | Desplaza la ventana a ~18:00–07:00 UTC; no cumple el requisito horario |

---

## 9. Plan de implementación

1. Modificar `run_wrf_disjoint.sh`: `DAY_START_OFFSET` y fórmula `F_START = DAY_OFFSET * 24 + 6 - 10#hour`.
2. Probar manualmente: `DAY_START_OFFSET=1 MPI_PROCS=16 ./run_wrf_disjoint.sh $(date +%Y-%m-%d-12) 13 3`.
3. Verificar en log:
   - Procesa días +1, +2, +3 (no +0).
   - Cada día arranca a **06:00 UTC** y termina a **19:00 UTC** (comprobar líneas `Inicio:` / `Fin:` del script).
4. Añadir línea en crontab.
5. Monitorizar primera semana: tiempos de ejecución, conflictos de lock, salidas en `wrfout_folder`.

**Esfuerzo estimado:** bajo (dos cambios acotados en un script + una línea de cron).  
**Impacto en la ejecución matinal:** nulo (`DAY_START_OFFSET=0`, `10#hour=0` → misma fórmula que hoy).

---

## 10. Conclusión

La ampliación requiere **dos cambios mínimos en `run_wrf_disjoint.sh`**: desplazamiento del bucle de días (`DAY_START_OFFSET`) y corrección de la hora de inicio de previsión (`F_START`) para soportar ciclos GFS distintos de 00Z. Más **una segunda entrada en crontab** con ciclo 12Z. No hay cambios en configuración de dominio, namelists ni post-procesado. La solución reutiliza toda la infraestructura existente y permite una segunda tanda diaria con datos GFS más recientes y horizonte extendido hasta el día +3, manteniendo la franja 06:00–19:00 UTC.
