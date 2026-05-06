# meteoWRF

Para llevar a cabo la instalación, es necesario descomprimir el archivo `meteowrf.zip` en el directorio del usuario o clonar este repositorio. Además, este usuario debe tener permisos de ejecución como administrador (`sudo usermod -aG sudo meteowrf`).
Al descomprimir el archivo, se crearán de forma automática las carpetas necesarias para la instalación del sistema (`pre_process`, `pos_process`, `web_viewer` y `configs`).

Este documento detalla la arquitectura, estructura y flujo de trabajo del proyecto `meteoWRF`, diseñado para el modelo meteorológico WRF.

## 1. Visión General
El proyecto "meteoWRF" es un sistema integral de predicción meteorológica basado en el modelo WRF, dividido funcionalmente en tres grandes áreas: `pre_process` (cálculo numérico y ejecución del modelo), `pos_process` (extracción de datos y generación de productos gráficos) y `web_viewer` (interfaz web interactiva para la visualización de los resultados).

### Estructura y Despliegue
El despliegue está automatizado mediante dos scripts de instalación que configuran los entornos necesarios:

1.  **`pre_install.sh`** (Entorno de Cálculo):
    *   **⛔ PELIGRO CRÍTICO:** NUNCA ejecutes este script con permisos de superusuario (`sudo ./pre_install.sh`). Debe ser lanzado **estrictamente** con tu usuario normal (`./pre_install.sh`). Si lo originas a través de `sudo` corromperás los permisos de tu directorio *home* y construirás las variables de entorno obligatorias atadas al usuario *root*, impidiendo el correcto funcionamiento y ejecución posterior de WRF.
    *   Instala compiladores y librerías de sistema (NetCDF-C/Fortran, MPICH, Jasper).
    *   Descarga, configura y compila **WRF** y **WPS**.
    *   Descarga los datos geográficos estáticos (`geog_data`).
    *   Prepara el entorno para la ejecución del modelo numérico.
    *   Auto-detecta la configuración del clúster y las variables de entorno para generar los archivos `namelist.input`, `namelist.wps` y el `config.ini` inicial de todo el sistema.
    *   **Totalmente Desatendida:** El script incorpora mecanismos de comprobación y aserción de estados de salida automatizados. Realiza los tests oficiales recomendados por UCAR (C/Fortran, NetCDF, MPI) de fondo y verifica su éxito. Si en algún momento la compilación falla críticamente o los binarios resultantes no se generan, el script se detendrá abruptamente emitiendo una señal de EXIT y bloqueando el sistema para prevenir errores fantasmas.
    *   **Advertencia Adicional:** Dado el ingente volumen de datos y código fuente que debe descargar de GitHub, se recomienda **hacer esta instalación en horarios de menor tráfico**. En momentos donde los servidores de GitHub se encuentren congestionados con alta carga, la bajada de librerías críticas para WRF es suspendida frecuentemente causando fallos en este paso que obligan a relanzar o continuar el script.

2.  **`pos_install.sh`** (Entorno de Post-Procesamiento):
    *   Configura un entorno virtual de Python 3.10 (`.env_py3_10`).
    *   Instala el stack científico: `wrf-python`, `cartopy`, `matplotlib`, `netcdf4` (v1.6.5).
    *   Instala herramientas para la generación web como **Playwright**.

El objetivo de esta integración de la arquitectura es permitir que el flujo de simulación avance de manera autónoma. Los archivos numéricos crudos (los `wrfout`) son leídos e interpretados por el `pos_process` para generar gráficos meteorológicos detallados (datos, meteogramas y sondeos) orientados al vuelo libre (focalizados en variables de tipo "DrJack"). Finalmente, todo este compendio de imágenes y reportes queda automáticamente indexado y disponible para la consulta interactiva de los usuarios a través del `web_viewer`.

## 2. Flujo de Trabajo Continuo (Continuous Running)

Para asegurar un entorno de producción robusto, se deben seguir las siguientes pautas:

1.  **Entorno**: Uso de **`pre_install.sh`** y **`pos_install.sh`** para compilar el modelo de predicción y crear un entorno Python estandarizado. No requiere Conda. Asegurar que los scripts se completen sin errores.
2.  **Punto de Entrada Primario (Cron)**: El sistema general se arranca programando una tarea iterativa en *crontab* del script principal del modelo:
    ```bash
    00 5,17 * * * MPI_PROCS=4 INT_SEC=3600 /home/meteo/meteowrf/pre_process/run_wrf.sh 72 >> /home/meteo/meteowrf/pre_process/run_wrf.log 2>&1
    ```
    *   **`La ruta (/home/meteo/meteowrf)`**: Indica la ruta absoluta al directorio de instalación elegido libremente durante el despliegue. Este valor se almacena en tu `config.ini` principal, bajo la variable `[paths] run_dir = /local/path`.
    *   **`MPI_PROCS=4`**: Opcional. Sobrescribe el valor configurado internamente en `run_wrf.sh` (defecto: `1`) forzando la computación paralela con 4 núcleos en MPI.
    *   **`INT_SEC=3600`**: Opcional. Sobrescribe el intervalo heredado de `namelist.wps` dictaminando una inyección de condiciones fronterizas de 3600 segundos (1 hora).
    *   **`72`**: Opcional. Argumento posicional numérico para programar un horizonte explícito (ej: predecir 72h hacia el futuro omitiendo las 24h por defecto).
    *   **Desglose Operacional**: `run_wrf.sh` se encarga de descargar GFS y lanzar todo el modelo. Al arrancar las descargas iniciales, invoca por background (vía `nohup`) al analizador reactivo del post-procesado `run_out.sh`.
3.  **Procesamiento Reactivo**: `run_out.sh` en background entra en vigilia sobre el directorio de salidas observando los archivos `wrfout_d0*`. Cuando WRF termina de escupir una hora nueva válida, automáticamente interrumpe el bucle y recarga/dispara `run_postprocess.py`.
4.  **Mantenimiento y Purga**: Al llegar a las horas nocturnas o límite del modelo, el sistema finalizará realizando limpiezas automáticas usando `cleanup_meteo.py`, el cual erradica archivos obsoletos basándose en la cantidad de días de retención establecidos manualmente en `config.ini`.
5.  **Monitorización Centralizada**: La lectura y revisión de los logs es esencial (`run_wrf.log` y `run_out.log`). Adicionalmente, se provee de la enorme herramienta interactiva visual `edit_config.py` para inspeccionar dichos logs y configurar tus variables generales (balizas geo-localizadas, límites espaciales y dominios) directamente desde una GUI gráfica funcional con mapas.

La automatización de todos los post-procesos (mapas, sondajes, subidas FTP) se gestiona a través de `run_out.sh`.

## 3. Arquitectura del Sistema

El sistema funciona como un pipeline continuo. 

Despues de la instalacion la estructura del código es la siguiente:

```text
config.ini
namelist.wps
namelist.input
pre_install.sh
pos_install.sh
edit_config.py
pre_process/
  ├── run_wrf.sh
  
configs
  ├── soundings_d0*.csv
  ├── cities.csv
  ├── takeoffs.csv
  ├── stations_d0*.csv   # Definición de balizas reales web
  ├── plots.ini          # variables color scales
  └── zooms.ini          # Regions limits to frame plots

pos_process/
  ├── run_out.sh
  │       Orquestador principal y demonio en loop que detecta en caliente
  │       los WRF generados en las carpetas base e invoca al post-procesado.
  ├── run_postprocess.py
  │       Main code for post-processing wrfout files. The flow of the process:
  │        - read wrfout file into a CalcData class
  │        - plot background layers (terrains, rivers, cities, takeoffs...)
  │        - plot 2d scalar maps (wind speed, wstar, wblmaxmin, ...)
  │        - plot 2d vector maps (wind direction, streamlines and wind barbs)
  │        - plot soundings and meteograms
  ├── download_stations_data.py
  │       Decarga automatizada de observaciones reales por APIs y posterior
  │       dibujado de gráficas contiguas para contrastar asimetrías de predicción reales vs modelo.
  ├── gen_manifest.py
  │       Compilación final del día y generador JSON para dar de comer al
  │       frontend y al visor mapa web en JS de la web final.
  ├── cleanup_meteo.py
  │       Gestor de límite de espacio que expurga wrfout pasados o GFS obsoletos.
  ├── calc_data.py
  │       Contains the definition of CalcData. It's purpose is to deal with
  │        the WRF interface, calculate DrJack variables and other derived quantities
  ├── extract_wrf.py
  │       Contains three main functions
  │        - wrfout_info: read metadata and general fields from wrfout
  │        - wrf_vars: read WRF "explicit" variables using mainly `wrf-python`
  │        - drjack_vars: calculate DrJack's variables particularly useful for
  │                       paragliding diagnostics.
  ├── drjack_interface.py
  │       Python-Fortran wrappers for using DrJack's subroutines
  ├── drjack_num.cpython-310-x86_64-linux-gnu.so
  │       DrJack's functions compiled via f2py for python use
  ├── derived_quantities.py
  │       Custom functions for point vertical profiles, cloud base/top...
  ├── meteogram_writer.py
  │       Helper functions to store meteogram data for the day without the need
  │       to load each wrfout each time a new data point appears
  ├── utils.py
  │       Helper functions: parse file names for domain/date,
  │       load config files (config.ini universal config object).
  ├── plots/
  │   ├── web.py             (Manejador de geometría y generación capa web)
  │   ├── geography.py       (Cartopy y Matplotlib details para plots)
  │   └── ... 
  └── terrain_tif/
      ├── gebco_08_rev_elev_B1_grey_geo.tif
      └── ...

web_viewer/
  ├── index.html
  ├── style.css
  └── script.js
  ├── run_server.sh
```

## 4. Componentes Principales

### A. Orquestación y Automatización
- **`run_out.sh`**: Orquestador principal y demonio de monitoreo continuo que gobierna todo el bloque del `pos_process`. Sus tareas clave de ingeniería incluyen:
    - **Lector Transaccional Atómico**: No rastrea las salidas WRF en bruto por mero tamaño. En su lugar, observa en caliente la creación definitiva de los semáforos/indicadores (`wrfoutReady_d*`) soltados orgánicamente por el código de Fortran.
    - **Ahorro de Cómputo (Filtro Horario)**: Verifica que el timestamp contenido extraído de la etiqueta concuerde con el marco horario estipulado en tu `config.ini` (`SCHEDULE_START` a `SCHEDULE_END`). Ignora por completo horas ajenas o puramente nocturnas.
    - **Procesamiento Distribuido**: Puede arrancar en modo secuencial para servidores modestos, o disparar cargas de trabajo completamente paralelas dividiendo los variados dominios (procesando archivos `d01`, `d02`, `d03` independientemente pero todos a la vez con timeouts). Esta característica es configurable tanto manualmente en `config.ini` como visualmente desde la propia interfaz de `edit_config.py`.
    - **Alta Disponibilidad de Red (FTP Retries)**: Centraliza la ejecución obligada de `gen_manifest.py` para construir el visor web y asume coordinar toda la subida iterativa vía FTP (el cual también se configura, habilita o deshabilita a placer en `config.ini` o gráficamente en `edit_config.py`). Incorpora inteligentemente una cola persistente de reintentos (`upload_queue.txt`) y banderas antipánico para no perder ni bloquear ningún fotograma gráfico del día si se detectan intermitencias o caídas de red externas.
- **`run_postprocess.py`**: El script matricial intermedio. Lanzado rígidamente por `run_out.sh` en base hora-a-hora, es el encargado de parsear el archivo con la librería WRF-Python nativa, instanciar las clases numéricas pesadas (`CalcData`) y efectuar secuencialmente de forma asíncrona la docena de funciones de dibujo sobre los submódulos de mapa.

### B. Gestión de Datos (`CalcData` & `extract_wrf.py`)
- **`calc_data.py`**: Define la clase `CalcData`, que encapsula toda la información de un paso de tiempo (timestep) del modelo. Realiza validaciones de metadatos y asegura coherencia espacial.
- **`extract_wrf.py`**: Responsable de la extracción "cruda" de variables del NetCDF del WRF.
- **`drjack_interface.py`**: Wrapper para código Fortran (`drjack_num.f90` / `.so`). Esto indica que los cálculos pesados de índices térmicos se realizan en código nativo compilado para eficiencia.

### C. Visualización (`plots/`)
El paquete `plots` está modularizado:
- **`web.py`**: Genera los mapas escalares (temperatura, nubes) y vectoriales (viento). Utiliza `cartopy` para proyecciones geográficas.
- **`sounding.py`**: Genera diagramas Skew-T utilizando `metpy`.
- **`meteogram.py`**: Genera series temporales para puntos específicos.

### D. Comparación y Verificación de Estaciones (Balizas en vivo)
Se ha implementado un subsistema robusto para comparar las predicciones del modelo con observaciones reales de estaciones meteorológicas:

1.  **Descarga Periódica (Cron de Estaciones)**: Desacoplado de la simulación continua, se recomienda configurar una tarea recurrente rápida en *crontab* programada para inyectar telemetría real al pos-proceso cada hora en punto:
    ```bash
    5 * * * * /home/zalo/meteo/pos_process/stations_downloader.sh
    ```
    *   Este orquestador secundario no solo ejecuta rígidamente la descarga; utiliza sistemas de bloqueo (lock files) internos que garantizan que nunca se solapen descargas estancadas de forma simultánea, y dispara automáticamente por background al extractor `download_stations_data.py`. Estas tareas se conectan a APIs externas reales (como OpenWeatherMap) logrando descargar y acumular las observaciones instrumentales reales.

2.  **Gestión Inteligente de Metadatos de Estaciones**:
    *   **Autogeneración**: Si los archivos de configuración de estaciones (`stations_d*.csv`) no existen, `run_postprocess.py` los genera automáticamente utilizando los centros de las zonas definidas en tus `zooms.ini`.
    *   **Normalización API**: Tras su creación inicial, el script `update_station_coords.py` consulta la API de OpenWeatherMap de nuevo para obtener el nombre oficial y actualizar las coordenadas a una métrica de precisión.
    *   **Validación Espacial**: Se comprueba automáticamente que cada estación definida en los CSV esté contenida dentro de al menos una de las zonas y emite alertas si hay balizas "huérfanas" inservibles.

3.  **Flujo Crítico de Cómputo (Validación Real vs Modelo)**:
    *   **Predicción**: `run_postprocess.py` extrae series temporales simuladas locales para cada estación validada. Además, **detecta en caliente** si el archivo numérico que está procesando colinda con la hora actual del sistema. Si es así, lo toma y lo inyecta a la matriz general de la comparativa probabilística.
    *   **Observación (Acumulativa)**: La cron-tarea horaria descarga datos de OpenWeatherMap redondeando su timestamp a la hora exacta (`XX:00:00`). Todo su registro es fusionado (`merge`) de forma inteligente con la base de datos previa e históricas para evitar lagunas y dar continuidad de trazado.
    *   **Visualización Factual (`plots/baliza.py`)**: Este módulo subyacente cruza finalmente las dos fuentes antagónicas del dato: toma las descargas puras acaudaladas de la estación del punto (1) y la simulación cruda del wrfout del punto anterior. Produce gráficos de solapamiento analíticos emitiendo meteogramas continuos `.webp` y reportes `.txt` detallados.

4.  **Publicación Global del Visor (`gen_manifest.py`)**: Como culmen del flujo total del día, independientemente de los mapas, se condensan y registran jerárquicamente todos los metadatos y ficheros generados usando este binario final nativo; emitiendo un index vital en formato `.json` (`manifest.json`) capaz de conectar velozmente y dar de comer de forma ágil a todo el *front-end* final servido en tu ruta de `web_viewer`. Adicionalmente, todo el entorno es catapultado y publicado a un servidor local o remoto usando el FTP Automático configurado en los parámetros de acceso en `config.ini`.

## 6. Configuración
El proyecto es altamente configurable sin tocar código. Todos los archivos de configuración y metadatos pueden editarse **independientemente** y de forma manual (con un editor de textos plano), pero también te puedes servir del asistente visual **`edit_config.py`** para modificarlos en su interfaz y mapa integrado:
- **`config.ini`**: Archivo maestro autogenerado que controla el flujo global, horas de proceso, cronogramas de retención, límites geográficos y el servidor FTP.
- **`configs/plots.ini`**: Define qué variables plotear, sus rangos (vmin, vmax), conversiones de unidades y mapas de colores.
- **`configs/zooms.ini`**: Define sub-regiones geográficas para generar mapas de detalle. Actúa también como fuente semántica para descubrir puntos de interés (estaciones) si no están explícitamente definidos.
- **`configs/stations_d*.csv`**: Listas de estaciones para validación. Pueden ser editados manualmente o generados/curados automáticamente por el sistema.
- **`configs/*.csv`**: Otras listas de puntos de interés (ciudades, puntos para sondeos).

## 7. Observaciones Técnicas
- **Lenguaje Mixto**: Python para la lógica y orquestación, Fortran (vía f2py) para cálculo numérico intensivo.
- **Librerías Clave**: 
    - `wrf-python`: Interfaz estándar para datos WRF.
    - `matplotlib` / `cartopy`: Stack gráfico.
    - `pandas`: Manejo de metadatos de estaciones/puntos.
- **Estado**: El proyecto parece maduro para producción, con gestión de logs (`log_help.py`), manejo de memoria (`gc.collect`) y recuperación de errores.

## 8. Problemas Conocidos (Known Issues)

### Incompatibilidad `netCDF4` >= 1.7.0 y `wrf-python`
Se ha detectado que versiones recientes de la librería `netCDF4` (>= 1.7.0) introducen cambios que hacen que los objetos `Dataset` no sean "picklable" (serializables). `wrf-python` (v1.3.4.1) intenta realizar copias de estos objetos internamente, lo que provoca errores críticos (`NotImplementedError: Dataset is not picklable`) al intentar extraer variables (`wrf.getvar`) o metadatos (`wrf.geo_bounds`).

**Solución Recomendada**:
Downgrade de `netCDF4` a la versión 1.6.5:
```bash
pip install "netcdf4<1.7"
```

## 9. Web Viewer (Visor de Mapas)

Para facilitar la visualización de los productos generados sin navegar por el sistema de ficheros, se incluye una aplicación web estática bajo `web_viewer`.

### Ejecución del Servidor Web
Debido a políticas de seguridad de los navegadores (CORS), la aplicación no funciona correctamente abriendo el archivo `index.html` directamente (protocolo `file://`). Se requiere un entorno servidor que sirva el visor y proporcione acceso al interior del directorio de gráficas originadas en pos-proceso.

Para ello, el proyecto dispone de un script de control dedicado que evalúa automáticamente la configuración, genera enlaces simbólicos vitales hacia tus directorios en `PLOTS` y levanta el servicio en segundo plano:

**Usando el script de control:**
```bash
cd /home/zalo/meteo/web_viewer
./run_server.sh start
```
*   **Acceso**: Abrir `http://localhost:8000` en el navegador.

### Reinicio y Mantenimiento
*   **Gestión del Servicio**: Al levantarse mediante este script, el servidor queda ejecutándose de manera resiliente en background. Puedes gestionar su ciclo de vida cómodamente con:
    ```bash
    ./run_server.sh status
    ./run_server.sh stop
    ./run_server.sh restart
    ```
*   **Actualización de Datos**: No es necesario reiniciar el servidor para ver nuevos mapas generados. El script `gen_manifest.py` (ejecutado por el orquestador principal del proyecto al terminar los cálculos diarios) actualiza dinámicamente el archivo enlazado `manifest.json`. Un simple refresco de la solapa de tu navegador web (F5) bastará para cargar instantáneamente la línea temporal de los nuevos datos.
