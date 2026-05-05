#!/bin/bash
set -e
set -u
set -o pipefail # Si un comando falla en una tubería (pipe), detiene el script.

# ============================================================================
# VERIFICACIÓN DE PERMISOS
# ============================================================================
if [ "$EUID" -eq 0 ]; then
  echo "❌ No ejecutes este script como root o con sudo."
  echo "   El script instalará las variables de entorno en el directorio home equivocado,"
  echo "   corromperá el árbol de permisos de tu usuario y WRF no funcionará posteriormente."
  echo "   Uso correcto: ./pre_install.sh"
  exit 1
fi

# Función auxiliar para la descarga condicional
descarga_condicional() {
    local URL=$1
    local NOMBRE_ARCHIVO=$2
    if [ ! -f "$NOMBRE_ARCHIVO" ]; then
        echo "   -> Descargando $NOMBRE_ARCHIVO..."
        # Usamos-O para asegurar el nombre del archivo si la URL no lo da.
        wget -q "$URL" -O "$NOMBRE_ARCHIVO"
    else
        echo "   -> $NOMBRE_ARCHIVO ya existe. Omitiendo descarga."
    fi
    echo ""
}

echo "Instalando paquetes de sistema. Te pedirá contraseña si hace falta."

sudo apt-get update -y

sudo apt-get install -y build-essential gcc g++ gfortran m4 csh cpp

# Directorio base del proyecto
BASE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
DIR_INSTALL="$BASE_DIR/pre_process"

echo "=== Creando directorios ==="
mkdir -p "$DIR_INSTALL"

cd "$DIR_INSTALL"
mkdir -p dependencias_wrf Build_WRF Build_WRF/DATA TESTS

echo "=== Haciendo test ==="
cd TESTS
ARCHIVO_TESTS="Fortran_C_tests.tar"
descarga_condicional "https://www2.mmm.ucar.edu/wrf/OnLineTutorial/compile_tutorial/tar_files/$ARCHIVO_TESTS" $ARCHIVO_TESTS
tar -xf $ARCHIVO_TESTS

echo " -> Test 1: gfortran (fixed)"
gfortran TEST_1_fortran_only_fixed.f
if ! ./a.out > /dev/null 2>&1; then echo "❌ ERROR: Falló test_1 (gfortran fixed)"; exit 1; fi

echo " -> Test 2: gfortran (free)"
gfortran TEST_2_fortran_only_free.f90
if ! ./a.out > /dev/null 2>&1; then echo "❌ ERROR: Falló test_2 (gfortran free)"; exit 1; fi

echo " -> Test 3: gcc"
gcc TEST_3_c_only.c
if ! ./a.out > /dev/null 2>&1; then echo "❌ ERROR: Falló test_3 (gcc)"; exit 1; fi

echo " -> Test 4: Integración C/Fortran"
gcc -c -m64 TEST_4_fortran+c_c.c
gfortran -c -m64 TEST_4_fortran+c_f.f90
gfortran -m64 TEST_4_fortran+c_f.o TEST_4_fortran+c_c.o
if ! ./a.out > /dev/null 2>&1; then echo "❌ ERROR: Falló test_4 (Integración C y Fortran)"; exit 1; fi

echo " -> Tests de scripting base"
if ! ./TEST_csh.csh >/dev/null 2>&1; then echo "❌ ERROR: csh falló"; exit 1; fi
if ! ./TEST_perl.pl >/dev/null 2>&1; then echo "❌ ERROR: perl falló"; exit 1; fi
if ! ./TEST_sh.sh >/dev/null 2>&1; then echo "❌ ERROR: sh falló"; exit 1; fi

echo "✅ Todos los tests básicos de validación del sistema superados con éxito."

# Limpiamos los archivos temporales de los tests pero mantenemos el .tar
rm -f TEST_*.f TEST_*.f90 TEST_*.c TEST_*.o a.out *.csh *.pl *.sh || true

cd $DIR_INSTALL
DIR=$DIR_INSTALL/dependencias_wrf

echo "=== Estableciendo variables de entorno para dependencias ==="
export NETCDF=$DIR/netcdf
export LD_LIBRARY_PATH=$NETCDF/lib:$DIR/grib2/lib
export PATH=$NETCDF/bin:$DIR/mpich/bin:${PATH}
export JASPERLIB=$DIR/grib2/lib
export JASPERINC=$DIR/grib2/include

export CC=gcc
export CXX=g++
export FC=gfortran
export F77=gfortran
export FCFLAGS="-m64 -fallow-argument-mismatch"
export FFLAGS="-m64 -fallow-argument-mismatch"
export LDFLAGS="-L$NETCDF/lib -L$DIR/grib2/lib"
export CPPFLAGS="-I$NETCDF/include -I$DIR/grib2/include -fcommon"

cd dependencias_wrf

##################################################
# ZLIB
###################################################
echo "=== Instalando zlib ==="
ARCHIVO_TAR="zlib-1.2.11.tar.gz"
descarga_condicional "https://www2.mmm.ucar.edu/wrf/OnLineTutorial/compile_tutorial/tar_files/$ARCHIVO_TAR" $ARCHIVO_TAR
tar xzvf $ARCHIVO_TAR
cd zlib-1.2.11
./configure --prefix=$DIR/grib2
make -j 4
make install
cd ..
rm -rf zlib-1.2.11 # Limpieza: solo la carpeta

###################################################
# HDF5
###################################################
echo "=== Instalando HDF5 ==="
ARCHIVO_TAR="hdf5-1_10_5.tar.gz"
URL="https://github.com/HDFGroup/hdf5/archive/$ARCHIVO_TAR"
descarga_condicional "$URL" "$ARCHIVO_TAR"

if ! tar xzvf "$ARCHIVO_TAR"; then
    echo "⚠️ Error al descomprimir $ARCHIVO_TAR. Archivo corrupto. Descargando de nuevo..."
    rm -f "$ARCHIVO_TAR"
    descarga_condicional "$URL" "$ARCHIVO_TAR"
    if ! tar xzvf "$ARCHIVO_TAR"; then
        echo "⚠️ Error al descomprimir $ARCHIVO_TAR. Intentálo en otro horario..."
        rm -f "$ARCHIVO_TAR"
        exit 1
    fi
fi
# Lógica de cambio de directorio
if [ -d "hdf5-hdf5-1_10_5" ]; then cd hdf5-hdf5-1_10_5; else cd hdf5-1.10.5 || true; fi

./configure --prefix=$DIR/netcdf --with-zlib=$DIR/grib2 --enable-fortran --enable-shared
make -j 4
make install
cd ..
# Limpieza: solo las carpetas, cubriendo posibles nombres
rm -rf hdf5-hdf5-1_10_5 hdf5-1.10.5 || true

###################################################
# NETCDF-C
###################################################

echo "=== Instalando NetCDF-C ==="
ARCHIVO_TAR="v4.7.2.tar.gz"
URL="https://github.com/Unidata/netcdf-c/archive/$ARCHIVO_TAR"
descarga_condicional "$URL" "$ARCHIVO_TAR"

if ! tar xzvf "$ARCHIVO_TAR"; then
    echo "⚠️ Error al descomprimir $ARCHIVO_TAR. Archivo corrupto. Descargando de nuevo..."
    rm -f "$ARCHIVO_TAR"
    descarga_condicional "$URL" "$ARCHIVO_TAR"
    if ! tar xzvf "$ARCHIVO_TAR"; then
        echo "⚠️ Error al descomprimir $ARCHIVO_TAR. Intentálo en otro horario..."
        rm -f "$ARCHIVO_TAR"
        exit 1
    fi
fi
cd netcdf-c-4.7.2
./configure --prefix=$DIR/netcdf --disable-dap --enable-netcdf4 --enable-hdf5 --enable-shared
make -j 4
make install
cd ..
rm -rf netcdf-c-4.7.2

###################################################
# NETCDF FORTRAN
###################################################
echo "=== Instalando netcdf-fortran ==="

export LIBS="-lnetcdf -lz" # LIBS necesaria para Fortran

ARCHIVO_TAR="v4.5.2.tar.gz"
descarga_condicional "https://github.com/Unidata/netcdf-fortran/archive/$ARCHIVO_TAR" $ARCHIVO_TAR
tar xzvf $ARCHIVO_TAR
cd netcdf-fortran-4.5.2
./configure --prefix=$DIR/netcdf --disable-hdf5 --enable-shared
make -j 4
make install
cd ..
rm -rf netcdf-fortran-4.5.2 # Limpieza: solo la carpeta
unset LIBS # Desactivar LIBS tras su uso

###################################################
# MPICH
###################################################
echo "=== Instalando mpich ==="
ARCHIVO_TAR="mpich-3.0.4.tar.gz"
descarga_condicional "https://www2.mmm.ucar.edu/wrf/OnLineTutorial/compile_tutorial/tar_files/$ARCHIVO_TAR" $ARCHIVO_TAR
tar xzvf $ARCHIVO_TAR
cd mpich-3.0.4
./configure --prefix=$DIR/mpich
make -j 4 2>&1
make install
cd ..
rm -rf mpich-3.0.4

###################################################
# LIBPNG
###################################################
echo "=== Instalando libpng ==="
ARCHIVO_TAR="libpng-1.2.50.tar.gz"
descarga_condicional "https://www2.mmm.ucar.edu/wrf/OnLineTutorial/compile_tutorial/tar_files/$ARCHIVO_TAR" $ARCHIVO_TAR
tar xzvf $ARCHIVO_TAR
cd libpng-1.2.50
./configure --prefix=$DIR/grib2
make -j 4
make install
cd ..
rm -rf libpng-1.2.50

###################################################
# JASPER
###################################################
echo "=== Instalando jasper ==="
ARCHIVO_TAR="jasper-1.900.1.tar.gz"
descarga_condicional "https://www2.mmm.ucar.edu/wrf/OnLineTutorial/compile_tutorial/tar_files/$ARCHIVO_TAR" $ARCHIVO_TAR
tar xzvf $ARCHIVO_TAR
cd jasper-1.900.1
./configure --prefix=$DIR/grib2
make -j 4
make install
cd ..
rm -rf jasper-1.900.1

echo "Se van a ejecutar los tests de compatibilidad de dependencias de NetCDF Mpi..."
echo "Referencia: https://www2.mmm.ucar.edu/wrf/OnLineTutorial/compilation_tutorial.php#STEP3"
echo ""

cd $DIR_INSTALL/TESTS

ARCHIVO_TAR="Fortran_C_NETCDF_MPI_tests.tar"
descarga_condicional "https://www2.mmm.ucar.edu/wrf/OnLineTutorial/compile_tutorial/tar_files/$ARCHIVO_TAR" $ARCHIVO_TAR

## Test 1 Fortran + C + NetCDF
tar -xf $ARCHIVO_TAR

echo " -> Test C + Fortran + NetCDF"
cp ${NETCDF}/include/netcdf.inc .
gfortran -c 01_fortran+c+netcdf_f.f
gcc -c 01_fortran+c+netcdf_c.c
gfortran 01_fortran+c+netcdf_f.o 01_fortran+c+netcdf_c.o -L${NETCDF}/lib -lnetcdff -lnetcdf
if ! ./a.out > /dev/null 2>&1; then echo "❌ ERROR: Falló test NetCDF+C+Fortran"; exit 1; fi

## Test 2 Fortran + C + NetCDF + MPI
echo " -> Test C + Fortran + NetCDF + MPI"
cp ${NETCDF}/include/netcdf.inc .
mpif90 -c 02_fortran+c+netcdf+mpi_f.f
mpicc -c 02_fortran+c+netcdf+mpi_c.c
mpif90 02_fortran+c+netcdf+mpi_f.o 02_fortran+c+netcdf+mpi_c.o -L${NETCDF}/lib -lnetcdff -lnetcdf
if ! mpirun -np 2 ./a.out > /dev/null 2>&1 < /dev/null; then echo "❌ ERROR: Falló test MPI+NetCDF"; exit 1; fi

echo "✅ Todos los tests de NetCDF y paralelismo superados."

# Limpieza de binarios de tests de NetCDF/MPI
rm -f 01_fortran+c+netcdf_f.f 01_fortran+c+netcdf_c.c 01_fortran+c+netcdf_f.o 01_fortran+c+netcdf_c.o 02_fortran+c+netcdf+mpi_f.f 02_fortran+c+netcdf+mpi_c.c 02_fortran+c+netcdf+mpi_f.o 02_fortran+c+netcdf+mpi_c.o a.out netcdf.inc

cd $DIR_INSTALL

echo "=================================================="
echo "CONFIGURACIÓN DE VARIABLES DE ENTORNO"
echo "=================================================="

# Crear script para configurar variables de entorno permanentemente
cat > ~/.wrf_env << EOF
# WRF Environment Variables
export NETCDF=$DIR/netcdf
export LD_LIBRARY_PATH=\$NETCDF/lib:$DIR/grib2/lib
export PATH=\$NETCDF/bin:$DIR/mpich/bin:\${PATH}
export JASPERLIB=$DIR/grib2/lib
export JASPERINC=$DIR/grib2/include
EOF

# Agregar source al .bashrc si no existe
if ! grep -q "source ~/.wrf_env" ~/.bashrc; then
    echo "source ~/.wrf_env" >> ~/.bashrc
fi

# Cargar variables inmediatamente
source ~/.wrf_env

echo "✓ Variables de entorno configuradas en ~/.wrf_env"
echo "✓ ~/.bashrc actualizado para cargar automáticamente las variables"

echo ""
echo "Instalación ncview"

sudo apt-get install -y libnetcdf-dev libhdf5-dev libudunits2-dev libpng-dev libx11-dev libxt-dev libxaw7-dev
sudo apt-get install ncview

echo ""
echo "=================================================="
echo "INSTALACIÓN DE WRF"
echo "=================================================="

# Configurar Git para clonar WRF. Aumentar el buffer de HTTP para evitar errores de clonación
git config --global http.postBuffer 524288000

# Clonar WRF
if [ ! -d "WRF" ]; then
    echo "Clonando WRF desde GitHub..."
    git clone --recurse-submodules https://github.com/wrf-model/WRF.git
    cd WRF/share
    mv landread.c landread.c.original
    cp landread.c.dist landread.c
else
    echo "✓ Directorio WRF ya existe, omitiendo clonación"
fi

cd $DIR_INSTALL/WRF
./clean -a

echo ""
echo "=================================================="
echo "CONFIGURACIÓN DE WRF"
echo "=================================================="
echo "Seleccionando automáticamente:"
echo "  - Opción 34 (GNU gcc/gfortran)"
echo "  - Nesting 1 (basic)"
echo ""

printf "34\n1\n" | ./configure

echo ""
echo "=================================================="
echo "COMPILANDO WRF (esto puede tomar 30+ minutos)..."
echo "=================================================="
echo ""
./compile em_real -j 4 >& log.compile

echo ""
echo "Verificando compilación de WRF..."
if [ -f "main/ndown.exe" ] && [ -f "main/real.exe" ] && [ -f "main/wrf.exe" ]; then
    echo "✓ WRF compilado exitosamente"
    echo "  Ejecutables encontrados: real.exe, wrf.exe, ndown.exe"
else
    echo "✗ ERROR: La compilación de WRF puede haber fallado"
    echo "  Revisa el archivo log.compile para más detalles"
    exit 1
fi

echo ""
echo "=================================================="
echo "INSTALACIÓN DE WPS"
echo "=================================================="

cd ..

# Clonar WPS
if [ ! -d "WPS" ]; then
    echo "Clonando WPS desde GitHub..."
    git clone https://github.com/wrf-model/WPS.git
else
    echo "✓ Directorio WPS ya existe, omitiendo clonación"
fi

cd WPS

# Configurar WRF_DIR
export WRF_DIR=../WRF

echo ""
echo "=================================================="
echo "CONFIGURACIÓN DE WPS"
echo "=================================================="
echo "Seleccionando automáticamente la opción 1 (GNU gcc/gfortran)"
echo ""

printf "1\n" | ./configure

echo ""
echo "=================================================="
echo "COMPILANDO WPS (esto puede tomar varios minutos)..."
echo "=================================================="
./compile >& log.compile

echo "Verificando compilación de WPS..."
if [ -f "geogrid.exe" ] && [ -f "ungrib.exe" ] && [ -f "metgrid.exe" ]; then
    echo "✓ WPS compilado exitosamente"
    echo "  Ejecutables encontrados: geogrid.exe, ungrib.exe, metgrid.exe"
else
    echo "✗ ERROR: La compilación de WPS puede haber fallado"
    echo "  Revisa el archivo log.compile para más detalles"
    exit 1
fi

echo ""
echo "===================================="
echo "INSTALACIÓN COMPLETADA EXITOSAMENTE!"
echo "===================================="
echo ""
echo "RESUMEN:"
echo "✓ Todas las dependencias instaladas en: $DIR"
echo "✓ WRF instalado en: $DIR_INSTALL/WRF"
echo "✓ WPS instalado en: $DIR_INSTALL/WPS"
echo ""
echo "VARIABLES DE ENTORNO CONFIGURADAS:"
echo "  NETCDF: $NETCDF"
echo "  PATH: $PATH"
echo "  LD_LIBRARY_PATH: $LD_LIBRARY_PATH"
echo "  JASPERLIB: $JASPERLIB"
echo "  JASPERINC: $JASPERINC"
echo ""
echo "=================================================="
echo "    VALIDANDO EJECUTABLES COMPILADOS...           "
echo "=================================================="

# Verificación automatizada de ejecutables clave
echo " -> Verificando binarios de WRF..."
if [ ! -f "$DIR_INSTALL/WRF/main/ndown.exe" ] || [ ! -f "$DIR_INSTALL/WRF/main/real.exe" ] || [ ! -f "$DIR_INSTALL/WRF/main/tc.exe" ] || [ ! -f "$DIR_INSTALL/WRF/main/wrf.exe" ]; then
    echo "❌ ERROR FATAL: Faltan binarios principales de WRF (*.exe en WRF/main/). La compilación de WRF falló."
    exit 1
fi
echo "✅ WRF compilado correctamente."

echo " -> Verificando binarios de WPS..."
if [ ! -f "$DIR_INSTALL/WPS/geogrid.exe" ] || [ ! -f "$DIR_INSTALL/WPS/metgrid.exe" ] || [ ! -f "$DIR_INSTALL/WPS/ungrib.exe" ]; then
    echo "❌ ERROR FATAL: Faltan ejecutables clave de WPS. La compilación de WPS falló."
    exit 1
fi
echo "✅ WPS compilado correctamente."
echo ""

echo "Descargando datos geográficos estáticos en $DIR_INSTALL/Build_WRF/WPS_GEOG"
echo ""
echo "La información del directorio se da al programa geogrid en el archivo $BASE_DIR/namelist.wps en la sección &geogrid:"

echo "    geog_data_path = '$DIR_INSTALL/Build_WRF/WPS_GEOG/'"

echo "Nota: WPS no expande variables de entorno ($HOME) ni ~, por lo que tendrás que usar la ruta absoluta o asegurarte de que la variable se expanda antes de pasársela al programa."

cd $DIR_INSTALL/Build_WRF

echo ""

echo "Descargando datos geográficos..."
# Descargar si no existe
if [ ! -f "geog_high_res_mandatory.tar.gz" ]; then
    wget https://www2.mmm.ucar.edu/wrf/src/wps_files/geog_high_res_mandatory.tar.gz
    if [ $? -ne 0 ]; then
        echo "ERROR: Descarga falló"
        exit 1
    fi
    echo "✓ Datos descargados"
else
    echo "✓ Archivo ya existe"
fi

# Verificar archivo
if [ ! -s "geog_high_res_mandatory.tar.gz" ]; then
    echo "ERROR: Archivo corrupto o vacío"
    exit 1
fi
echo "✓ Archivo verificado"

echo ""
echo "Descomprimiendo datos..."

tar -xzf geog_high_res_mandatory.tar.gz
if [ $? -ne 0 ]; then
    echo "ERROR: Descompresión falló"
    rm -f geog_high_res_mandatory.tar.gz
    exit 1
fi
echo "✓ Datos descomprimidos"

echo ""
echo "Verificando resultados..."

if [ -d "WPS_GEOG" ]; then
    echo "✓ WPS_GEOG creado"
else
    echo "ERROR: WPS_GEOG no existe"
    exit 1
fi

cd $DIR_INSTALL

# Crear namelist.wps
echo "📝 Generando namelist.wps..."
cat > "$BASE_DIR/namelist.wps" <<EOF
&share
 wrf_core = 'ARW',
 max_dom = 2,
 start_date = '2026-02-22_00:00:00','2026-02-22_00:00:00'
 end_date   = '2026-02-22_01:00:00','2026-02-22_01:00:00'
 interval_seconds = 3600,
 io_form_geogrid = 2,
 opt_output_from_geogrid_path = './',
 debug_level = 0,
/

&geogrid
 parent_id            = 1, 1,
 parent_grid_ratio    = 1, 5,
 i_parent_start       = 1, 34,
 j_parent_start       = 1, 33,
 e_we                 = 108, 196,
 e_sn                 = 98, 136,
 geog_data_res        = '30s', '30s',
 dx                   = 6000,
 dy                   = 6000,
 map_proj             = 'lambert',
 ref_lat              = 42.407,
 ref_lon              = -8.100,
 truelat1             = 40.049,
 truelat2             = 40.049,
 stand_lon            = -3.278,
 geog_data_path       = '$DIR_INSTALL/Build_WRF/WPS_GEOG',
 opt_geogrid_tbl_path = '$DIR_INSTALL/Build_WRF',
/

&ungrib
 out_format = 'WPS',
 prefix = 'FILE',
/

&metgrid
 fg_name = 'FILE',
 io_form_metgrid = 2,
 opt_output_from_metgrid_path = './',
 opt_metgrid_tbl_path = '$DIR_INSTALL/Build_WRF/',
/

&mod_levs
 press_pa = 201300 , 200100 , 100000 ,
             95000 ,  90000 ,
             85000 ,  80000 ,
             75000 ,  70000 ,
             65000 ,  60000 ,
             55000 ,  50000 ,
             45000 ,  40000 ,
             35000 ,  30000 ,
             25000 ,  20000 ,
             15000 ,  10000 ,
              5000 ,   1000
 /

EOF

# Crear namelist.input
echo "📝 Generando namelist.input..."
cat > "$BASE_DIR/namelist.input" <<EOF
&time_control
 history_outname          = '$BASE_DIR/WRF_OUT/wrfout_d<domain>_<date>'
 run_days                 = 0
 run_hours                = 1
 run_minutes              = 0,
 run_seconds              = 0,
 start_year               = 2026,2026
 start_month              = 02,02
 start_day                = 22,22
 start_hour               = 00,00
 start_minute             = 00,   00,
 start_second             = 00,   00,
 end_year                 = 2026,2026
 end_month                = 02,02
 end_day                  = 22,22
 end_hour                 = 01,01
 end_minute               = 00,   00,
 end_second               = 00,   00,
 interval_seconds         = 3600
 input_from_file          = .true., .true.,
 history_interval         = 60,60
 frames_per_outfile       = 1,   1,
 restart                  = .false.
 restart_interval         = 6000
 rst_outname              = '$BASE_DIR/WRF_OUT/restarts/wrfrst_d<domain>_<date>'
 rst_inname               = '$BASE_DIR/WRF_OUT/restarts/wrfrst_d<domain>_<date>'
 io_form_history          = 2,
 io_form_restart          = 2,
 io_form_input            = 2,
 io_form_boundary         = 2,
 debug_level              = 50,
 output_ready_flag        = .true.
/

&domains
 use_adaptive_time_step   = .true.,
 step_to_output_time      = .true.,
 target_cfl               = 1.2, 1.2,
 target_hcfl              = 0.84, 0.84,
 max_step_increase_pct    = 5, 5,
 starting_time_step       = 36, 10,
 max_time_step            = 108, 35,
 min_time_step            = 18, 10,
 adaptation_domain        = 1,
 time_step                = 36
 time_step_fract_num      = 0,
 time_step_fract_den      = 1,
 eta_levels               = 1.000, 0.9963, 0.9926, 0.9888, 0.9851,
                            0.9815, 0.9778, 0.9739, 0.9698, 0.9654,
                            0.9608, 0.9558, 0.9504, 0.9446, 0.9383,
                            0.9314, 0.9239, 0.9158, 0.9069, 0.8971,
                            0.8864, 0.8747, 0.8619, 0.848, 0.8327,
                            0.8161, 0.7982, 0.7788, 0.7579, 0.7355,
                            0.7117, 0.6866, 0.6601, 0.6324, 0.6037,
                            0.5741, 0.5438, 0.5131, 0.4821, 0.4511,
                            0.4202, 0.3898, 0.36, 0.3309, 0.3027,
                            0.2756, 0.2497, 0.225, 0.2016, 0.1771,
                            0.1565, 0.1374, 0.12, 0.104, 0.0894,
                            0.0761, 0.064, 0.053, 0.043, 0.0339,
                            0.0257, 0.0183, 0.0115, 0.0055, 0.000,
! Horizontal
 max_dom                  = 2
 e_we                     = 108, 196,
 e_sn                     = 98, 136,
 e_vert                   = 65,  	65,
 p_top_requested          = 5000,
 num_metgrid_levels       = 34,
 num_metgrid_soil_levels  = 4,
 dx                       = 6000.0
 dy                       = 6000.0
 grid_id                  = 1,  	2,
 parent_id                = 1, 1,
 i_parent_start           = 1, 34,
 j_parent_start           = 1, 33,
 parent_grid_ratio        = 1, 5,
 parent_time_step_ratio   = 1, 5,
 feedback                 = 1,
 smooth_option            = 1,
 nproc_x                  = 3
 nproc_y                  = 2
/

&physics
 mp_physics               = 3,   3,
 ra_lw_physics            = 1,   1,
 ra_sw_physics            = 1,   1,
 radt                     = 6,   1,
 sf_sfclay_physics        = 2,   2,
 sf_surface_physics       = 2,   2,
 bl_pbl_physics           = 2,   2,
 bldt                     = 0,   0,
 cu_physics               = 1,   1,
 cudt                     = 5,   5,
 isfflx                   = 1,
 ifsnow                   = 0,
 icloud                   = 1,
 surface_input_source     = 1,
 num_soil_layers          = 4,
 sf_urban_physics         = 0,   0,
 maxiens                  = 1,
 maxens                   = 3,
 maxens2                  = 3,
 maxens3                  = 16,
 ensdim                   = 144,
/

&fdda
/

&dynamics
 w_damping                = 0,
 diff_opt                 = 1,
 km_opt                   = 4,
 diff_6th_opt             = 0,   0,
 diff_6th_factor          = 0.12, 0.12,
 base_temp                = 290.,
 damp_opt                 = 0,
 zdamp                    = 5000., 5000.,
 dampcoef                 = 0.2, 0.2,
 khdif                    = 0,   0,
 kvdif                    = 0,   0,
 non_hydrostatic          = .true., .true.,
 moist_adv_opt            = 1,   1,
 scalar_adv_opt           = 1,   1,
/

&bdy_control
 spec_bdy_width           = 5,
 spec_zone                = 1,
 relax_zone               = 4,
 specified                = .true., .false.,
 nested                   = .false., .true.,
/

&grib2
/

&namelist_quilt
 nio_tasks_per_group      = 0,
 nio_groups               = 1,
/
EOF

echo "📝 Generando config.ini..."
cat > "$BASE_DIR/config.ini" <<EOF
[paths]
run_dir = $BASE_DIR
domain = Galicia
namelist_path = $BASE_DIR
wrfout_folder = $BASE_DIR/WRF_OUT
plots_folder = \${wrfout_folder}/PLOTS/\${domain}
data_folder = \${wrfout_folder}/DATA/\${domain}
configs = \${run_dir}/configs
wrf_pos_dir = \${run_dir}/pos_process
wrf_run_dir = \${run_dir}/pre_process/WRF/run
web_viewer_dir = \${run_dir}/web_viewer

[schedule]
start_hour = 0
end_hour = 23

[processing]
pre_script = run_wrf.sh
pos_script = run_out.sh
loop_sleep = 60
cleanup_days = 2
parallel_processing = false

[ftp]
enabled = false
url = ftp://navegal.es
user = meteo_wrf
password = wrf_mag..
remote_path = /www

[domain_bounds]
left_lon = -14.0344
right_lon = 0.0281
top_lat = 46.0206
bottom_lat = 37.4496
EOF

chmod 774 "$BASE_DIR/config.ini"
chmod 774 "$BASE_DIR/namelist.wps"
chmod 774 "$BASE_DIR/namelist.input"

echo ""
echo "✅ CONFIGURACIÓN COMPLETADA"
echo "Directorio instalación: $DIR_INSTALL"
echo "WPS_GEOG disponible para WPS"
echo "DATA listo para datos GFS"
echo ""
echo "Configura los dominios en $BASE_DIR/namelist.wps y $BASE_DIR/namelist.input"
echo "Ejecutar automáticamente WRF con el script:"
echo ""
echo "[MPI_PROCS=n] $DIR_INSTALL/run_wrf.sh [SIM_DURATION_HOURS] [YYYY-MM-DD-HH]"
echo ""
echo "Configurar cron"
echo "crontab -e"
echo "TZ=UTC"
echo "0 5,11,17,23 * * * MPI_PROCS=4 $DIR_INSTALL/run_wrf.sh >> $DIR_INSTALL/run_wrf.log 2>&1"
exit 0
