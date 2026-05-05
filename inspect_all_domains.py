#!/usr/bin/python3
# -*- coding: UTF-8 -*-

import re
import sys
import os
from pathlib import Path
from pyproj import Proj

# Configuración de radio de la Tierra usado por WRF (esferoide)
WRF_EARTH_RADIUS = 6370000

def parse_namelist_wps(filepath):
    """Parsea el namelist.wps de forma básica para extraer parámetros geográficos."""
    config = {}
    current_section = None
    
    if not os.path.exists(filepath):
        return None

    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if not line: continue
            
            # Detectar secciones &seccion
            section_match = re.match(r'&(\w+)', line)
            if section_match:
                current_section = section_match.group(1)
                config[current_section] = {}
                continue
            
            if line == '/':
                current_section = None
                continue
                
            if current_section:
                # Buscar clave = valor1, valor2...
                entry_match = re.match(r'(\w+)\s*=\s*(.*)', line)
                if entry_match:
                    key = entry_match.group(1).lower()
                    values_raw = entry_match.group(2).rstrip(',')
                    # Limpiar comillas y espacios, separar por comas
                    values = [v.strip().strip("'").strip('"') for v in values_raw.split(',')]
                    # Intentar convertir a numérico si es posible
                    processed_values = []
                    for v in values:
                        if not v: continue
                        try:
                            if '.' in v: processed_values.append(float(v))
                            else: processed_values.append(int(v))
                        except ValueError:
                            processed_values.append(v)
                    config[current_section][key] = processed_values

    return config

def calculate_bounds(wps_config):
    """Calcula los límites geográficos de cada dominio basándose en la lógica de WRF."""
    geo = wps_config.get('geogrid', {})
    share = wps_config.get('share', {})
    
    if not geo: return None
    
    max_dom = share.get('max_dom', [1])[0]
    map_proj = geo.get('map_proj', ['lambert'])[0]
    ref_lat = geo.get('ref_lat', [0.0])[0]
    ref_lon = geo.get('ref_lon', [0.0])[0]
    truelat1 = geo.get('truelat1', [ref_lat])[0]
    truelat2 = geo.get('truelat2', [truelat1])[0]
    stand_lon = geo.get('stand_lon', [ref_lon])[0]
    
    dx = geo.get('dx', [0.0])[0]
    dy = geo.get('dy', [dx])[0]
    
    # Definir la proyección Proj4
    if map_proj == 'lambert':
        proj_str = (f"+proj=lcc +lat_1={truelat1} +lat_2={truelat2} "
                    f"+lat_0={ref_lat} +lon_0={stand_lon} "
                    f"+a={WRF_EARTH_RADIUS} +b={WRF_EARTH_RADIUS} "
                    f"+units=m +no_defs")
    elif map_proj == 'mercator':
        proj_str = (f"+proj=merc +lat_ts={truelat1} +lon_0={stand_lon} "
                    f"+a={WRF_EARTH_RADIUS} +b={WRF_EARTH_RADIUS} "
                    f"+units=m +no_defs")
    elif map_proj == 'polar':
        lat_0 = 90.0 if truelat1 > 0 else -90.0
        proj_str = (f"+proj=stere +lat_0={lat_0} +lat_ts={truelat1} +lon_0={stand_lon} "
                    f"+a={WRF_EARTH_RADIUS} +b={WRF_EARTH_RADIUS} "
                    f"+units=m +no_defs")
    else:
        # Simplificación para lat-lon (no proyectado usualmente en WRF regional)
        proj_str = None

    if not proj_str:
        print(f"Error: Proyección {map_proj} no soportada para cálculo directo.")
        return None

    p = Proj(proj_str)
    
    domains_bounds = {}
    
    # Datos de los dominios (listas en el namelist)
    e_we = geo.get('e_we', [])
    e_sn = geo.get('e_sn', [])
    i_parent_start = geo.get('i_parent_start', [1] * max_dom)
    j_parent_start = geo.get('j_parent_start', [1] * max_dom)
    parent_grid_ratio = geo.get('parent_grid_ratio', [1] * max_dom)
    
    # El centro de la proyección (0,0 en metros) se define por truelat1/2 y stand_lon.
    # El punto (ref_lat, ref_lon) es una ubicación geográfica que corresponde al 
    # centro del dominio 1 (ref_x, ref_y) en el grid.
    
    # 1. Obtener coordenadas en metros del punto de referencia (centro del d01)
    # cx, cy son los metros desde el origen (0,0) de la proyección (+proj=lcc ...)
    cx, cy = p(ref_lon, ref_lat)
    
    # 2. El punto (ref_x, ref_y) en el grid corresponde a (cx, cy)
    ref_x = (e_we[0] - 1) / 2.0
    ref_y = (e_sn[0] - 1) / 2.0
    
    # 3. Calcular la esquina SW del d01 en metros respecto al origen (0,0)
    origins_x = [cx - (ref_x * dx)]
    origins_y = [cy - (ref_y * dy)]
    current_dx = [dx]
    current_dy = [dy]

    # 4. Calcular orígenes y dx/dy para todos los dominios
    for i in range(1, max_dom):
        ratio = parent_grid_ratio[i]
        d_dx = current_dx[i-1] / ratio
        d_dy = current_dy[i-1] / ratio
        current_dx.append(d_dx)
        current_dy.append(d_dy)
        
        # Origen respecto al padre (i_parent_start es 1-based)
        # El desplazamiento es en unidades de la malla del PADRE
        off_x = (i_parent_start[i] - 1) * current_dx[i-1]
        off_y = (j_parent_start[i] - 1) * current_dy[i-1]
        
        origins_x.append(origins_x[i-1] + off_x)
        origins_y.append(origins_y[i-1] + off_y)

    # Calcular esquinas y guardar
    for i in range(max_dom):
        d_id = f"d{i+1:02d}"
        
        # Esquina SW
        sw_x = origins_x[i]
        sw_y = origins_y[i]
        
        # Esquina NE ((e_we-1) puntos de distancia)
        ne_x = sw_x + (e_we[i] - 1) * current_dx[i]
        ne_y = sw_y + (e_sn[i] - 1) * current_dy[i]
        
        # Transformar a Lat/Lon
        lon_sw, lat_sw = p(sw_x, sw_y, inverse=True)
        lon_ne, lat_ne = p(ne_x, ne_y, inverse=True)
        lon_se, lat_se = p(ne_x, sw_y, inverse=True)
        lon_nw, lat_nw = p(sw_x, ne_y, inverse=True)
        
        # Para los límites rectangulares simples (min/max):
        # OJO: En proyecciones cónicas, min_lon/max_lon no son necesariamente las esquinas SW/NE
        # pero para el visor Leaflet usamos el bounding box de las esquinas.
        
        domains_bounds[d_id] = {
            'left': min(lon_sw, lon_nw),
            'right': max(lon_ne, lon_se),
            'bottom': min(lat_sw, lat_se),
            'top': max(lat_ne, lat_nw)
        }

    return domains_bounds

def main():
    here = Path(__file__).parent.resolve()
    namelist_path = here / 'namelist.wps'
    
    if not namelist_path.exists():
        print(f"Error: No se encuentra {namelist_path}")
        return

    print(f"--- Calculando límites desde {namelist_path.name} ---")
    config = parse_namelist_wps(namelist_path)
    if not config:
        print("Error al parsear el archivo.")
        return
        
    bounds = calculate_bounds(config)
    if not bounds:
        return

    for dom, b in bounds.items():
        print(f"\n[domain_bounds_{dom}]")
        print(f"left_lon   = {b['left']:.4f}")
        print(f"right_lon  = {b['right']:.4f}")
        print(f"bottom_lat = {b['bottom']:.4f}")
        print(f"top_lat    = {b['top']:.4f}")

if __name__ == "__main__":
    main()
