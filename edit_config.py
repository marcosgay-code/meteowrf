#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import configparser
import os
import sys
import subprocess
import threading
import queue

try:
    import tkintermapview
    HAS_MAP = True
except ImportError:
    HAS_MAP = False

class ConfigEditor:
    def __init__(self, root):
        self.root = root
        self.root.title("Editor de Configuración - config.ini")
        self.root.geometry("1100x850")
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)

        
        # Archivo de configuración
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        self.config_file = os.path.join(self.base_dir, "config.ini")
        # Desactivamos interpolación para no romper variables como ${var} y protegemos camelCase
        self.config = configparser.ConfigParser(interpolation=None)
        self.config.optionxform = str
        
        # Cargar configuración si existe
        self.load_config()
        
        # Crear notebook para pestañas
        self.notebook = ttk.Notebook(root)
        self.notebook.pack(fill='both', expand=True, padx=10, pady=5)
        
        # Crear pestañas
        self.create_paths_tab()
        self.create_processing_tab()
        self.create_ftp_tab()
        self.create_domain_bounds_tab()
        self.create_additional_files_tab()
        self.create_monitor_tab()
        
        # Botones de control
        self.create_control_buttons()
        
    def load_config(self):
        """Carga la configuración existente o crea una nueva"""
        # Cargar valores por defecto primero evitará fallos si el ini existe pero le faltan secciones
        self.create_default_config()
        if os.path.exists(self.config_file):
            try:
                self.config.read(self.config_file, encoding='utf-8')
            except Exception as e:
                messagebox.showerror("Error", f"No se pudo cargar el archivo: {e}")
    
    def create_default_config(self):
        """Crea configuración por defecto"""
        self.config['paths'] = {
            'run_dir': self.base_dir,
            'domain': 'Galicia',
            'namelist_path': self.base_dir,
            'wrfout_folder': '${run_dir}/WRF_OUT',
            'plots_folder': '${wrfout_folder}/PLOTS/${domain}',
            'data_folder': '${wrfout_folder}/DATA/${domain}',
            'configs': '${run_dir}/configs',
            'wrf_pos_dir': '${run_dir}/pos_process',
            'wrf_run_dir': '${run_dir}/pre_process/WRF/run',
            'web_viewer_dir': '${run_dir}/web_viewer'
        }
        
        self.config['schedule'] = {
            'start_hour': '0',
            'end_hour': '20'
        }
        
        self.config['processing'] = {
            'pre_script': 'run_wrf.sh',
            'pos_script': 'run_out.sh',
            'loop_sleep': '60',
            'cleanup_days': '3',
            'parallel_processing': 'true'
        }
        
        self.config['ftp'] = {
            'enabled': 'true',
            'url': 'ftp://navegal.es',
            'user': 'meteo_wrf',
            'password': 'wrf_mag..',
            'remote_path': '/web'
        }
        
        self.config['domain_bounds'] = {
            'left_lon': '-17',
            'right_lon': '8',
            'top_lat': '48',
            'bottom_lat': '30'
        }
    
    def create_paths_tab(self):
        """Crea la pestaña de rutas"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Rutas")
        
        # Crear canvas con scrollbar para rutas
        canvas = tk.Canvas(tab)
        scrollbar = ttk.Scrollbar(tab, orient="vertical", command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas)
        
        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        # Variables para paths
        self.path_vars = {}
        row = 0
        
        for key, value in self.config['paths'].items():
            # Etiqueta
            label = ttk.Label(scrollable_frame, text=f"{key}:", font=('Arial', 10, 'bold'))
            label.grid(row=row, column=0, sticky='w', pady=5, padx=5)
            
            # Frame para entrada y botón
            frame = ttk.Frame(scrollable_frame)
            frame.grid(row=row, column=1, sticky='ew', pady=5, padx=5)
            
            # Variable
            var = tk.StringVar(value=value)
            self.path_vars[key] = var
            
            # Entrada
            entry = ttk.Entry(frame, textvariable=var, width=50)
            entry.pack(side='left', fill='x', expand=True)
            
            # Botón examinar (solo para rutas locales)
            if key != 'domain':
                btn = ttk.Button(frame, text="Examinar", 
                               command=lambda k=key: self.browse_directory(k))
                btn.pack(side='right', padx=5)
            
            row += 1
        
        # Configurar grid
        scrollable_frame.columnconfigure(1, weight=1)
        
        # Empaquetar canvas y scrollbar
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
    
    def create_processing_tab(self):
        """Crea la pestaña de procesamiento"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Procesamiento")
        
        # --- Configuración de Programación ---
        self.schedule_vars = {}
        
        # Start hour
        lbl_start = ttk.Label(tab, text="Hora inicio:", font=('Arial', 10, 'bold'))
        lbl_start.grid(row=0, column=0, sticky='w', pady=10, padx=10)
        
        var_start = tk.StringVar(value=self.config['schedule']['start_hour'])
        self.schedule_vars['start_hour'] = var_start
        spin_start = ttk.Spinbox(tab, from_=0, to=23, textvariable=var_start, width=10)
        spin_start.grid(row=0, column=1, sticky='w', pady=10, padx=10)
        
        # End hour
        lbl_end = ttk.Label(tab, text="Hora fin:", font=('Arial', 10, 'bold'))
        lbl_end.grid(row=1, column=0, sticky='w', pady=10, padx=10)
        
        var_end = tk.StringVar(value=self.config['schedule']['end_hour'])
        self.schedule_vars['end_hour'] = var_end
        spin_end = ttk.Spinbox(tab, from_=0, to=23, textvariable=var_end, width=10)
        spin_end.grid(row=1, column=1, sticky='w', pady=10, padx=10)
        
        # Separador visual
        separator = ttk.Separator(tab, orient='horizontal')
        separator.grid(row=2, column=0, columnspan=2, sticky='ew', pady=5, padx=10)
        
        # --- Configuración de Procesamiento ---
        self.processing_vars = {}
        row = 3
        
        for key, value in self.config['processing'].items():
            label = ttk.Label(tab, text=f"{key}:", font=('Arial', 10, 'bold'))
            label.grid(row=row, column=0, sticky='w', pady=10, padx=10)
            
            var = tk.StringVar(value=value)
            self.processing_vars[key] = var
            
            if key in ['loop_sleep', 'cleanup_days']:
                spinbox = ttk.Spinbox(tab, from_=1, to=999, textvariable=var, width=10)
                spinbox.grid(row=row, column=1, sticky='w', pady=10, padx=10)
            elif key == 'parallel_processing':
                combo = ttk.Combobox(tab, textvariable=var, values=['true', 'false'], 
                                    state='readonly', width=10)
                combo.grid(row=row, column=1, sticky='w', pady=10, padx=10)
            else:
                entry = ttk.Entry(tab, textvariable=var, width=40)
                entry.grid(row=row, column=1, sticky='w', pady=10, padx=10)
            
            row += 1
    
    def create_ftp_tab(self):
        """Crea la pestaña de FTP"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="FTP")
        
        # Variables
        self.ftp_vars = {}
        row = 0
        
        for key, value in self.config['ftp'].items():
            label = ttk.Label(tab, text=f"{key}:", font=('Arial', 10, 'bold'))
            label.grid(row=row, column=0, sticky='w', pady=10, padx=10)
            
            var = tk.StringVar(value=value)
            self.ftp_vars[key] = var
            
            if key == 'enabled':
                # Combobox para true/false
                combo = ttk.Combobox(tab, textvariable=var, values=['true', 'false'], 
                                    state='readonly', width=10)
                combo.grid(row=row, column=1, sticky='w', pady=10, padx=10)
            elif key == 'password':
                entry = ttk.Entry(tab, textvariable=var, width=40, show="*")
                entry.grid(row=row, column=1, sticky='w', pady=10, padx=10)
                
                # Botón para mostrar/ocultar contraseña
                self.show_password = tk.BooleanVar(value=False)
                # Usar e=entry arregla el variable scope dentro del loop (cierre tardío)
                btn = ttk.Checkbutton(tab, text="Mostrar", 
                                     variable=self.show_password,
                                     command=lambda e=entry: self.toggle_password(e))
                btn.grid(row=row, column=2, sticky='w', pady=10, padx=5)
            else:
                entry = ttk.Entry(tab, textvariable=var, width=40)
                entry.grid(row=row, column=1, sticky='w', pady=10, padx=10)
            
            row += 1

            
    def create_domain_bounds_tab(self):
        """Crea la pestaña de límites del dominio (Edición para config e info de WPS)"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Límites Dominio")
        
        # Frame superior para botones globales
        top_btn_frame = ttk.Frame(tab)
        top_btn_frame.pack(side="top", fill="x", padx=10, pady=5)
        
        refresh_btn = ttk.Button(top_btn_frame, text="Actualizar Mapa", 
                                command=self.update_map_polygon)
        refresh_btn.pack(side="right", padx=5)


        # PanedWindow para separar controles y mapa
        paned = ttk.PanedWindow(tab, orient=tk.HORIZONTAL)
        paned.pack(fill="both", expand=True, padx=5, pady=5)
        
        # Lado izquierdo: Edición de límites en config.ini
        left_container = ttk.Frame(paned)
        paned.add(left_container, weight=1)
        
        canvas = tk.Canvas(left_container)
        scrollbar = ttk.Scrollbar(left_container, orient="vertical", command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas)
        
        scrollable_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")
        
        # 1. Secciones editables del config.ini
        self.domain_vars = {} 
        bound_sections = [s for s in self.config.sections() if s.startswith('domain_bounds')]
        bound_sections.sort() 
        
        row = 0
        for section in bound_sections:
            lbl_sec = ttk.Label(scrollable_frame, text=f"[{section}] Editable", font=('Arial', 10, 'bold', 'underline'))
            lbl_sec.grid(row=row, column=0, columnspan=2, sticky='w', pady=(15, 5), padx=10)
            row += 1
            
            self.domain_vars[section] = {}
            for key, value in self.config[section].items():
                if key.startswith(';') or key.startswith('#'): continue
                
                label = ttk.Label(scrollable_frame, text=f"{key}:", font=('Arial', 9))
                label.grid(row=row, column=0, sticky='w', pady=2, padx=20)
                
                var = tk.StringVar(value=value)
                self.domain_vars[section][key] = var
                
                spinbox = ttk.Spinbox(scrollable_frame, from_=-180.0, to=180.0, format="%.4f", 
                                     increment=0.1, textvariable=var, width=12)
                spinbox.grid(row=row, column=1, sticky='w', pady=2, padx=10)
                
                if HAS_MAP:
                    var.trace_add("write", lambda *args: self.update_map_polygon())
                row += 1

        # 2. Información de referencia del namelist.wps (Solo lectura)
        row += 1
        sep = ttk.Separator(scrollable_frame, orient='horizontal')
        sep.grid(row=row, column=0, columnspan=2, sticky='ew', pady=15)
        row += 1
        
        lbl_wps = ttk.Label(scrollable_frame, text="Dominios (namelist.wps):", font=('Arial', 10, 'bold'))
        lbl_wps.grid(row=row, column=0, columnspan=2, sticky='w', padx=10)
        row += 1
        
        wps_domains = self.parse_wps_domains(return_bounds=True)
        if wps_domains:
            for dom_id, b in sorted(wps_domains.items()):
                lbl_d = ttk.Label(scrollable_frame, text=f"{dom_id}: L={b['left']:.2f}, \| R={b['right']:.2f}, \| B={b['bottom']:.2f}, \| T={b['top']:.2f}", 
                                 font=('Arial', 8), foreground="purple")
                lbl_d.grid(row=row, column=0, columnspan=2, sticky='w', padx=20, pady=2)
                row += 1


        if HAS_MAP:
            right_frame = ttk.Frame(paned)
            paned.add(right_frame, weight=2)
            
            self.map_widget = tkintermapview.TkinterMapView(right_frame, width=500, height=500, corner_radius=0)
            self.map_widget.pack(fill="both", expand=True)
            self.map_widget.set_tile_server("https://a.tile.opentopomap.org/{z}/{x}/{y}.png", max_zoom=17) 
            self.map_polygons = {} 
            
            self.show_wrf_domains_var = tk.BooleanVar(value=True)
            chk = ttk.Checkbutton(right_frame, text="Ver Dominios Namelist (Morado)", 
                                  variable=self.show_wrf_domains_var, command=self.update_map_polygon)
            chk.pack(pady=5)
            
            lbl = ttk.Label(right_frame, text="Rojo: Área GFS (Editable).")
            lbl.pack(pady=2)
            
            self.root.after(100, lambda: self.update_map_polygon(center=True))
            
            # Arrastre del mapa
            self._map_orig_mouse_click = self.map_widget.mouse_click
            self._map_orig_mouse_move = self.map_widget.mouse_move
            self._map_orig_mouse_release = self.map_widget.mouse_release
            self.main_drag_state = None
            
            self.map_widget.canvas.bind("<Button-1>", self._main_custom_mouse_click)
            self.map_widget.canvas.bind("<B1-Motion>", self._main_custom_mouse_move)
            self.map_widget.canvas.bind("<ButtonRelease-1>", self._main_custom_mouse_release)


    def refresh_domain_tab(self):
        """Refresca la pestaña de dominios"""
        for child in self.notebook.winfo_children():
            # Check if it was destroying incorrectly or if another tab exists
            try:
                if self.notebook.tab(child, "text") == "Límites Dominio":
                    child.destroy()
                    break
            except: pass
        self.create_domain_bounds_tab()



    def update_map_polygon(self, center=False):
        if not HAS_MAP: return
        
        # Limpiar polígonos previos
        if hasattr(self, 'map_polygons'):
            for p in self.map_polygons.values(): 
                try: p.delete()
                except Exception: pass
        self.map_polygons = {}
            
        # 1. Dibujar polígonos desde variables del config.ini (Editables)
        for section, vars in self.domain_vars.items():
            try:
                top = float(vars['top_lat'].get())
                bottom = float(vars['bottom_lat'].get())
                left = float(vars['left_lon'].get())
                right = float(vars['right_lon'].get())
                
                path = [(top, left), (top, right), (bottom, right), (bottom, left), (top, left)]
                # Config editable en azul semi-transparente
                color = "#2c82c9" if section == 'domain_bounds' else "#34495e"
                name = f"edit_{section}"
                
                poly = self.map_widget.set_polygon(path, fill_color=color, 
                                                 outline_color="red" if section == 'domain_bounds' else "gray", 
                                                 border_width=2, name=name)
                self.map_polygons[section] = poly
                
                if center and section == 'domain_bounds':
                    self.map_widget.set_position((top+bottom)/2, (left+right)/2)
                    self.map_widget.set_zoom(4)
            except (ValueError, KeyError):
                continue

        # 2. Dibujar rejillas reales (calculadas del namelist) en morado/línea
        self.draw_wrf_domains_on_map(self.map_widget, 'wrf_domain_polygons', self.show_wrf_domains_var.get())

        # 3. Centrar si es necesario basándose en d01 real
        if center:
            domains = self.parse_wps_domains(return_bounds=True)
            if 'd01' in domains:
                b = domains['d01']
                self.map_widget.set_position((b['top']+b['bottom'])/2, (b['left']+b['right'])/2)
                self.map_widget.set_zoom(4)
            elif 'domain_bounds' in self.domain_vars:
                # Fallback al config si d01 no cargó
                v = self.domain_vars['domain_bounds']
                try:
                    self.map_widget.set_position((float(v['top_lat'].get())+float(v['bottom_lat'].get()))/2, 
                                                 (float(v['left_lon'].get())+float(v['right_lon'].get()))/2)
                except: pass






    def _main_custom_mouse_click(self, event):
        poly = self.map_polygons.get('domain_bounds')
        if not HAS_MAP or poly is None:
            return self._map_orig_mouse_click(event)
        
        mouse_lat, mouse_lon = self.map_widget.convert_canvas_coords_to_decimal_coords(event.x, event.y)
        offset_lat, offset_lon = self.map_widget.convert_canvas_coords_to_decimal_coords(event.x + 15, event.y + 15)
        lat_thresh = abs(offset_lat - mouse_lat)
        lon_thresh = abs(offset_lon - mouse_lon)
        
        if len(poly.position_list) >= 4:
            lats = [p[0] for p in poly.position_list]
            lons = [p[1] for p in poly.position_list]
            top, bottom = max(lats), min(lats)
            right, left = max(lons), min(lons)

            
            on_top = abs(mouse_lat - top) < lat_thresh
            on_bottom = abs(mouse_lat - bottom) < lat_thresh
            on_left = abs(mouse_lon - left) < lon_thresh
            on_right = abs(mouse_lon - right) < lon_thresh
            
            in_lat = (bottom - lat_thresh) <= mouse_lat <= (top + lat_thresh)
            in_lon = (left - lon_thresh) <= mouse_lon <= (right + lon_thresh)
            
            if in_lat and in_lon:
                mode = None
                if on_top and on_left: mode = 'tl'
                elif on_top and on_right: mode = 'tr'
                elif on_bottom and on_left: mode = 'bl'
                elif on_bottom and on_right: mode = 'br'
                elif on_top: mode = 't'
                elif on_bottom: mode = 'b'
                elif on_left: mode = 'l'
                elif on_right: mode = 'r'
                elif bottom <= mouse_lat <= top and left <= mouse_lon <= right:
                    mode = 'c'
                    
                if mode:
                    self.main_drag_state = {
                        'poly': poly, 'mode': mode,
                        'start_mouse_lat': mouse_lat, 'start_mouse_lon': mouse_lon,
                        'start_top': top, 'start_bottom': bottom,
                        'start_left': left, 'start_right': right
                    }
                    return  # Evento capturado, no arrastrar el mapa
                
        return self._map_orig_mouse_click(event)

    def _main_custom_mouse_move(self, event):
        if not getattr(self, 'main_drag_state', None):
            return self._map_orig_mouse_move(event)
            
        state = self.main_drag_state
        mouse_lat, mouse_lon = self.map_widget.convert_canvas_coords_to_decimal_coords(event.x, event.y)
        
        mode = state['mode']
        top, bottom = state['start_top'], state['start_bottom']
        left, right = state['start_left'], state['start_right']
        
        if mode == 'c':
            d_lat = mouse_lat - state['start_mouse_lat']
            d_lon = mouse_lon - state['start_mouse_lon']
            top += d_lat
            bottom += d_lat
            left += d_lon
            right += d_lon
        else:
            if 't' in mode: top = mouse_lat
            if 'b' in mode: bottom = mouse_lat
            if 'l' in mode: left = mouse_lon
            if 'r' in mode: right = mouse_lon
            
        path = [(top, left), (top, right), (bottom, right), (bottom, left), (top, left)]
        state['poly'].position_list = path
        state['poly'].draw()
        
    def _main_custom_mouse_release(self, event):
        if not getattr(self, 'main_drag_state', None):
            return self._map_orig_mouse_release(event)
            
        state = self.main_drag_state
        self.main_drag_state = None
        
        poly = self.map_polygons.get('domain_bounds')
        if poly and len(poly.position_list) >= 4:
            lats = [p[0] for p in poly.position_list]
            lons = [p[1] for p in poly.position_list]
            actual_top, actual_bottom = max(lats), min(lats)
            actual_left, actual_right = min(lons), max(lons)
            
            # Actualizamos las variables de d01
            vars = self.domain_vars['domain_bounds']
            vars['top_lat'].set(f"{actual_top:.4f}")
            vars['bottom_lat'].set(f"{actual_bottom:.4f}")
            vars['left_lon'].set(f"{actual_left:.4f}")
            vars['right_lon'].set(f"{actual_right:.4f}")


    def create_control_buttons(self):
        """Crea los botones de control"""
        frame = ttk.Frame(self.root)
        frame.pack(fill='x', padx=10, pady=10)
        
        # Botón Guardar
        save_btn = ttk.Button(frame, text="Guardar Configuración", 
                             command=self.save_config, style='Accent.TButton')
        save_btn.pack(side='left', padx=5)
        
        # Botón Cargar archivo
        load_btn = ttk.Button(frame, text="Cargar otro archivo", 
                             command=self.load_other_config)
        load_btn.pack(side='left', padx=5)
        
        # Botón Cancelar
        cancel_btn = ttk.Button(frame, text="Cancelar", 
                               command=self.root.quit)
        cancel_btn.pack(side='right', padx=5)
    
    def get_resolved_path(self, key):
        """Intenta resolver las variables en la ruta actual evaluando los valores actuales"""
        path = self.path_vars[key].get()
        # Resolver recursivamente (hasta 5 niveles) para variables anidadas
        for _ in range(5):
            original = path
            for k, var in self.path_vars.items():
                # Reemplazar tanto ${var} como $var
                path = path.replace(f"${{{k}}}", var.get()).replace(f"${k}", var.get())
            if original == path:
                break
        return os.path.expanduser(path)

    def browse_directory(self, key):
        """Abre diálogo para seleccionar directorio"""
        current_path = self.get_resolved_path(key)
        
        # Si la ruta no existe, intentar usar el directorio padre que exista
        initial_dir = current_path
        while initial_dir and not os.path.isdir(initial_dir):
            parent = os.path.dirname(initial_dir)
            if parent == initial_dir: # LLegamos a root
                break
            initial_dir = parent
            
        if not os.path.isdir(initial_dir):
            initial_dir = "/"
            
        directory = filedialog.askdirectory(
            title=f"Seleccionar directorio para {key}",
            initialdir=initial_dir
        )
        
        if directory:
            # Intentar relativizar respecto a run_dir si es posible para mantener portabilidad
            try:
                run_dir_raw = self.path_vars['run_dir'].get()
                resolved_run_dir = os.path.abspath(self.get_resolved_path('run_dir'))
                abs_directory = os.path.abspath(directory)
                
                if abs_directory.startswith(resolved_run_dir) and key != 'run_dir':
                    rel_path = os.path.relpath(abs_directory, resolved_run_dir)
                    # Si el run_dir original usaba ${var}, lo mantenemos
                    base_var = "${run_dir}"
                    final_path = base_var if rel_path == "." else os.path.join(base_var, rel_path)
                    
                    if messagebox.askyesno("Portabilidad Detectada", 
                                         f"El directorio seleccionado está dentro de la ruta base del proyecto ({resolved_run_dir}).\n\n"
                                         f"¿Deseas guardarlo usando la variable {base_var}?\n\n"
                                         f"Resultado: {final_path}"):
                        directory = final_path
            except Exception:
                pass # Si falla la relativización, guardamos la ruta absoluta
                
            self.path_vars[key].set(directory)
    
    def toggle_password(self, entry):
        """Muestra u oculta la contraseña"""
        if self.show_password.get():
            entry.config(show="")
        else:
            entry.config(show="*")
    
    def save_config(self):
        """Guarda la configuración en el archivo"""
        try:
            # Actualizar paths
            for key, var in self.path_vars.items():
                self.config['paths'][key] = var.get()
            
            # Actualizar schedule
            for key, var in self.schedule_vars.items():
                self.config['schedule'][key] = var.get()
            
            # Intercept variables before saving to detect filename changes
            old_pre = self.config['processing'].get('pre_script', 'run_wrf.sh')
            old_pos = self.config['processing'].get('pos_script', 'run_out.sh')
            
            # Actualizar processing
            for key, var in self.processing_vars.items():
                self.config['processing'][key] = var.get()
                
            new_pre = self.config['processing'].get('pre_script', 'run_wrf.sh')
            new_pos = self.config['processing'].get('pos_script', 'run_out.sh')

            base_global_dir = self.get_resolved_path('run_dir')
            if not base_global_dir:
                base_global_dir = self.base_dir
                
            # Función auxiliar para renombrar scripts base (.sh) y posibles logs
            def rename_script(folder_name, old_name, new_name):
                if old_name and new_name and old_name != new_name:
                    dir_path = os.path.join(base_global_dir, folder_name)
                    old_path = os.path.join(dir_path, old_name)
                    new_path = os.path.join(dir_path, new_name)
                    
                    if os.path.exists(old_path):
                        os.rename(old_path, new_path)
                    
                    # Log asociados al script
                    old_log = os.path.splitext(old_name)[0] + '.log'
                    new_log = os.path.splitext(new_name)[0] + '.log'
                    old_log_path = os.path.join(dir_path, old_log)
                    new_log_path = os.path.join(dir_path, new_log)
                    
                    if os.path.exists(old_log_path):
                        os.rename(old_log_path, new_log_path)
            
            # Renombrar archivos reales de pre y pos proceso
            try:
                rename_script('pre_process', old_pre, new_pre)
            except Exception as e:
                print(f"Error renombrando script de pre-proceso: {e}")
                
            try:
                rename_script('pos_process', old_pos, new_pos)
            except Exception as e:
                print(f"Error renombrando script de pos-proceso: {e}")
            
            # Actualizar ftp
            for key, var in self.ftp_vars.items():
                self.config['ftp'][key] = var.get()
            
            # Actualizar domain_bounds (soporta múltiples secciones d01, d02...)
            for section, vars in self.domain_vars.items():
                if not self.config.has_section(section):
                    self.config.add_section(section)
                for key, var in vars.items():
                    self.config[section][key] = var.get()

            
            # Guardar archivo
            with open(self.config_file, 'w') as configfile:
                self.config.write(configfile)
            
            messagebox.showinfo("Éxito", f"Configuración guardada en {self.config_file}")
            
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo guardar la configuración: {e}")
    
    def load_other_config(self):
        """Carga otro archivo de configuración"""
        filename = filedialog.askopenfilename(
            title="Seleccionar archivo de configuración",
            filetypes=[("INI files", "*.ini"), ("All files", "*.*")]
        )
        
        if filename:
            self.config_file = filename
            self.load_config()
            
            # Actualizar todas las variables con los nuevos valores
            self.update_all_variables()
            messagebox.showinfo("Info", f"Configuración cargada desde {filename}")
    
    def update_all_variables(self):
        """Actualiza todas las variables con los valores actuales de la configuración"""
        # Actualizar paths
        for key in self.path_vars:
            if key in self.config['paths']:
                self.path_vars[key].set(self.config['paths'][key])
        
        # Actualizar schedule
        for key in self.schedule_vars:
            if key in self.config['schedule']:
                self.schedule_vars[key].set(self.config['schedule'][key])
        
        # Actualizar processing
        for key in self.processing_vars:
            if key in self.config['processing']:
                self.processing_vars[key].set(self.config['processing'][key])
        
        # Actualizar ftp
        for key in self.ftp_vars:
            if key in self.config['ftp']:
                self.ftp_vars[key].set(self.config['ftp'][key])
        
        # Actualizar domain_bounds (soporta múltiples secciones domain_bounds, domain_bounds_d02...)
        for section, vars_dict in self.domain_vars.items():
            if self.config.has_section(section):
                for key, var in vars_dict.items():
                    if key in self.config[section]:
                        var.set(self.config[section][key])

    def create_additional_files_tab(self):
        """Crea la pestaña para editar archivos adicionales"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Geografía")
        
        # Lista de archivos a editar
        self.additional_files = [
            'cities.csv',
            'peaks.csv',
            'soundings_d01.csv',
            'soundings_d02.csv',
            'stations_d01.csv',
            'stations_d02.csv',
            'takeoffs.csv'
        ]
        
        # Frame principal para dividir en dos (mitad editor, mitad mapa)
        paned = ttk.PanedWindow(tab, orient=tk.HORIZONTAL)
        paned.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Lado izquierdo: controles y editor
        left_frame = ttk.Frame(paned)
        paned.add(left_frame, weight=1)
        
        # Frame de control superior
        top_frame = ttk.Frame(left_frame)
        top_frame.pack(fill='x', padx=5, pady=5)
        
        lbl = ttk.Label(top_frame, text="Seleccionar archivo:")
        lbl.pack(side='left', padx=5)
        
        self.selected_file_var = tk.StringVar()
        file_combo = ttk.Combobox(top_frame, textvariable=self.selected_file_var, 
                                  values=self.additional_files, state='readonly')
        file_combo.pack(side='left', padx=5, fill='x', expand=True)
        file_combo.bind("<<ComboboxSelected>>", self.load_additional_file)
        
        save_file_btn = ttk.Button(top_frame, text="Guardar Archivo", command=self.save_additional_file)
        save_file_btn.pack(side='right', padx=5)
        
        # Frame del editor de texto
        editor_frame = ttk.Frame(left_frame)
        editor_frame.pack(fill='both', expand=True, padx=5, pady=5)
        
        # Scrollbars para el editor de texto
        yscroll = ttk.Scrollbar(editor_frame, orient="vertical")
        yscroll.pack(side="right", fill="y")
        
        xscroll = ttk.Scrollbar(editor_frame, orient="horizontal")
        xscroll.pack(side="bottom", fill="x")
        
        # Editor de texto
        self.file_editor = tk.Text(editor_frame, wrap="none", undo=True, width=35,
                                   yscrollcommand=yscroll.set, xscrollcommand=xscroll.set)
        self.file_editor.pack(fill='both', expand=True)
        
        yscroll.config(command=self.file_editor.yview)
        xscroll.config(command=self.file_editor.xview)
        
        self.file_editor.bind("<KeyRelease>", self.update_files_map)
        
        # Lado derecho: mapa
        if HAS_MAP:
            right_frame = ttk.Frame(paned)
            paned.add(right_frame, weight=3)
            
            self.files_map_widget = tkintermapview.TkinterMapView(right_frame, width=600, height=400, corner_radius=0)
            self.files_map_widget.pack(fill="both", expand=True)
            self.files_map_widget.set_tile_server("https://a.tile.opentopomap.org/{z}/{x}/{y}.png", max_zoom=17)
            self.files_map_widget.add_right_click_menu_command(label="Añadir punto",
                                                              command=self.add_point_to_editor,
                                                              pass_coords=True)
                                                              
            lbl_map = ttk.Label(right_frame, text="Haz clic derecho en el mapa para añadir puntos.")
            lbl_map.pack(pady=5)
            
            # Checkbox para mostrar dominios de namelist.wps
            self.show_wrf_files_domains_var = tk.BooleanVar(value=True)
            chk_map = ttk.Checkbutton(right_frame, text="Mostrar Dominios WRF (namelist.wps)", 
                                      variable=self.show_wrf_files_domains_var, 
                                      command=self.update_files_map)
            chk_map.pack(pady=5)
            
            self.files_map_markers = []
            self.files_map_polygons = []
        
        # Seleccionar el primer archivo por defecto
        if self.additional_files:
            file_combo.set(self.additional_files[0])
            # Postponer load para asegurar que UI esté lista
            self.root.after(100, self.load_additional_file)

    def add_point_to_editor(self, coords):
        if not HAS_MAP: return
        file_name = self.selected_file_var.get()
        if not file_name: return
        
        lat, lon = coords
        new_line = ""
        if file_name.endswith('.csv'):
            new_line = f"{lat:.4f}, {lon:.4f}, Nuevo_Punto\n"
            
            self.file_editor.insert(tk.END, new_line)
            self.update_files_map()

            
    def update_files_map(self, event=None):
        if not HAS_MAP: return
        file_name = self.selected_file_var.get()
        if not file_name: return
        
        # Limpiar mapa
        for marker in self.files_map_markers:
            marker.delete()
        self.files_map_markers.clear()
        
        for polygon in self.files_map_polygons:
            polygon.delete()
        self.files_map_polygons.clear()
        
        content = self.file_editor.get("1.0", tk.END).strip()
        if not content: return
        
        try:
            if file_name.endswith('.csv'):
                for line in content.split('\n'):
                    line = line.strip()
                    if not line or line.startswith('#'): continue
                    parts = [p.strip() for p in line.split(',')]
                    if len(parts) >= 2:
                        try:
                            lat = float(parts[0])
                            lon = float(parts[1])
                            text = parts[-1] if len(parts) > 2 else ""
                            marker = self.files_map_widget.set_marker(lat, lon, text=text)
                            self.files_map_markers.append(marker)
                        except ValueError:
                            pass
        except Exception:
             pass

        self.draw_wrf_domains_on_map(self.files_map_widget, 'files_wrf_domain_polygons', self.show_wrf_files_domains_var.get())



    def fit_files_map(self):
        if not HAS_MAP: return
        if not self.files_map_markers and not self.files_map_polygons:
            # Fallback center Galicia general
            try:
                self.files_map_widget.set_position(42.5, -8.0)
                self.files_map_widget.set_zoom(6)
            except: pass
            return
            
        lats = []
        lons = []
        for marker in self.files_map_markers:
            lats.append(marker.position[0])
            lons.append(marker.position[1])
            
        for poly in self.files_map_polygons:
            for lat, lon in poly.position_list:
                lats.append(lat)
                lons.append(lon)
                
        if lats and lons:
            min_lat, max_lat = min(lats), max(lats)
            min_lon, max_lon = min(lons), max(lons)
            
            self.files_map_widget.set_position((min_lat + max_lat)/2, (min_lon + max_lon)/2)
            try:
                # Da algo de margen
                self.files_map_widget.fit_bounding_box((max_lat + 0.1, min_lon - 0.1), (min_lat - 0.1, max_lon + 0.1))
            except AttributeError:
                self.files_map_widget.set_zoom(7)

    def get_actual_config_dir(self):
        """Obtiene la ruta absoluta al directorio de configuración resolviendo variables"""
        try:
            # Intentar usar el método principal que resuelve variables recursivamente
            return self.get_resolved_path('configs')
        except (KeyError, AttributeError):
            # Fallback si las variables de la UI aún no están inicializadas
            run_dir = self.config['paths'].get('run_dir', self.base_dir)
            configs_template = self.config['paths'].get('configs', '${run_dir}/configs')
            path = configs_template.replace('${run_dir}', run_dir).replace('$run_dir', run_dir)
            return os.path.expanduser(path)
            
    def load_additional_file(self, event=None):
        file_name = self.selected_file_var.get()
        if not file_name: return
        
        config_dir = self.get_actual_config_dir()
        file_path = os.path.join(config_dir, file_name)
        
        self.file_editor.delete(1.0, tk.END)
        
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                self.file_editor.insert(tk.END, content)
            except Exception as e:
                self.file_editor.insert(tk.END, f"Error al cargar {file_name}:\n{str(e)}")
        else:
            self.file_editor.insert(tk.END, f"# El archivo {file_name} no existe. Se creará al guardar.\n")
            
        if HAS_MAP:
            self.update_files_map()
            self.fit_files_map()

    def save_additional_file(self):
        file_name = self.selected_file_var.get()
        if not file_name: return
        
        config_dir = self.get_actual_config_dir()
        os.makedirs(config_dir, exist_ok=True)
        file_path = os.path.join(config_dir, file_name)
        
        content = self.file_editor.get("1.0", "end-1c")
        
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            if HAS_MAP:
                self.update_files_map()
                self.fit_files_map()
                
            messagebox.showinfo("Éxito", f"Archivo {file_name} guardado correctamente.")
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo guardar {file_name}:\n{str(e)}")

    def create_monitor_tab(self):
        """Crea la pestaña para monitorizar scripts"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="Monitorización")
        
        paned = ttk.PanedWindow(tab, orient=tk.VERTICAL)
        paned.pack(fill='both', expand=True, padx=5, pady=5)
        
        # --- Preprocesamiento ---
        frame_wrf = ttk.LabelFrame(paned, text="Preprocesamiento (script pre_process)")
        paned.add(frame_wrf, weight=1)
        
        wrf_controls = ttk.Frame(frame_wrf)
        wrf_controls.pack(fill='x', padx=5, pady=5)
        
        self.params_frame = ttk.Frame(wrf_controls)
        self.params_frame.pack(side='left')
        
        ttk.Label(self.params_frame, text="Procs (MPI):").pack(side='left')
        self.wrf_procs_var = tk.StringVar(value="4")
        ttk.Spinbox(self.params_frame, from_=1, to=128, textvariable=self.wrf_procs_var, width=5).pack(side='left', padx=(2, 10))
        
        ttk.Label(self.params_frame, text="Horas:").pack(side='left')
        self.wrf_hours_var = tk.StringVar(value="24")
        ttk.Spinbox(self.params_frame, from_=1, to=240, textvariable=self.wrf_hours_var, width=5).pack(side='left', padx=(2, 10))
        
        ttk.Label(self.params_frame, text="Fecha (AAAA-MM-DD-HH o vacía para actual):").pack(side='left')
        self.wrf_date_var = tk.StringVar(value="")
        ttk.Entry(self.params_frame, textvariable=self.wrf_date_var, width=15).pack(side='left', padx=(2, 10))

        self.start_btn_frame = ttk.Frame(wrf_controls)
        self.start_btn_frame.pack(side='left')
        self.btn_wrf_start = ttk.Button(self.start_btn_frame, text="▶ Iniciar", command=self.start_wrf)
        self.btn_wrf_start.pack(padx=5)
        
        self.wrf_monitor_var = tk.BooleanVar(value=False)
        chk_wrf_monitor = ttk.Checkbutton(wrf_controls, text="Monitorizar log", variable=self.wrf_monitor_var, command=self.toggle_wrf_monitor)
        chk_wrf_monitor.pack(side='left', padx=5)
        
        self.text_wrf = tk.Text(frame_wrf, wrap='word', height=10, bg='black', fg='white')
        self.text_wrf.pack(fill='both', expand=True, padx=5, pady=5)
        scroll_wrf = ttk.Scrollbar(self.text_wrf, command=self.text_wrf.yview)
        scroll_wrf.pack(side='right', fill='y')
        self.text_wrf.config(yscrollcommand=scroll_wrf.set)
        
        # --- Posprocesamiento (Monitor Log) ---
        frame_out = ttk.LabelFrame(paned, text="Posprocesamiento (Auto-lanzado por WRF)")
        paned.add(frame_out, weight=1)
        
        out_controls = ttk.Frame(frame_out)
        out_controls.pack(fill='x', padx=5, pady=5)
        
        self.out_monitor_var = tk.BooleanVar(value=False)
        chk_out_monitor = ttk.Checkbutton(out_controls, text="Monitorizar log", variable=self.out_monitor_var, command=self.toggle_out_monitor)
        chk_out_monitor.pack(side='left', padx=5)
        
        self.text_out = tk.Text(frame_out, wrap='word', height=10, bg='black', fg='white')
        self.text_out.pack(fill='both', expand=True, padx=5, pady=5)
        scroll_out = ttk.Scrollbar(self.text_out, command=self.text_out.yview)
        scroll_out.pack(side='right', fill='y')
        self.text_out.config(yscrollcommand=scroll_out.set)

        self.processes = {'wrf': None, 'out': None}
        self.queue_out = queue.Queue()
        self.queue_wrf = queue.Queue()
        
        # Timer para actualizar las consolas
        self.root.after(100, self.update_monitor_consoles)
        
        # Timer para verificar si un script externo cron/bash está corriendo y ocultar el botón
        if self.root.winfo_exists():
            self.root.after(1000, self.check_wrf_running)


    def check_wrf_running(self):
        pre_script = self.processing_vars.get('pre_script')
        script_name = pre_script.get() if pre_script else 'run_wrf.sh'
        try:
            subprocess.check_output(["pgrep", "-f", script_name])
            # Si corre, cambiamos el texto y acción a Detener, y ocultamos parámetros
            self.btn_wrf_start.config(text="⏹ Detener", command=self.stop_wrf)
            if self.params_frame.winfo_ismapped():
                self.params_frame.pack_forget()
            # Activación automática de los monitores si arranca por fuera (ej. cron)
            if not self.wrf_monitor_var.get():
                self.wrf_monitor_var.set(True)
                self.start_wrf_monitor()
            if not self.out_monitor_var.get():
                self.out_monitor_var.set(True)
                self.start_out_monitor()
        except subprocess.CalledProcessError:
            # Si no corre, lo ponemos en Iniciar y restauramos parámetros
            self.btn_wrf_start.config(text="▶ Iniciar", command=self.start_wrf)
            if not self.params_frame.winfo_ismapped():
                self.params_frame.pack(side='left', before=self.start_btn_frame)
        
        self.root.after(2000, self.check_wrf_running)

    def read_stream(self, stream, q):
        for line in iter(stream.readline, b''):
            q.put(line.decode('utf-8', errors='replace'))
        stream.close()
        
    def start_script(self, key, command, cwd, q, text_widget):
        if self.processes[key] is not None and self.processes[key].poll() is None:
            messagebox.showinfo("Aviso", "El proceso ya está en ejecución.")
            return

        text_widget.delete('1.0', tk.END)
        try:
            self.processes[key] = subprocess.Popen(
                command, 
                cwd=cwd,
                stdout=subprocess.PIPE, 
                stderr=subprocess.STDOUT,
                bufsize=0,
                shell=True,
                preexec_fn=os.setsid  # Para poder matar procesos hijos
            )
            t = threading.Thread(target=self.read_stream, args=(self.processes[key].stdout, q))
            t.daemon = True
            t.start()
        except Exception as e:
            messagebox.showerror("Error", f"Error al iniciar: {e}")

    def stop_script(self, key):
        p = self.processes[key]
        if p and p.poll() is None:
            import signal
            try:
                os.killpg(os.getpgid(p.pid), signal.SIGTERM)
            except Exception:
                pass

    def start_wrf(self):
        run_dir = self.path_vars.get('run_dir')
        base_dir = run_dir.get() if run_dir else self.base_dir
        
        pre_script = self.processing_vars.get('pre_script')
        script_name = pre_script.get() if pre_script else 'run_wrf.sh'
        log_name = os.path.splitext(script_name)[0] + '.log'
        log_path = f"{base_dir}/pre_process/{log_name}"
        
        hours = self.wrf_hours_var.get().strip()
        date = self.wrf_date_var.get().strip()
        
        try:
            # Revisa silenciosamente si existe el proceso
            subprocess.check_output(["pgrep", "-f", script_name])
            if not self.wrf_monitor_var.get():
                self.wrf_monitor_var.set(True)
                self.start_wrf_monitor()
            if not self.out_monitor_var.get():
                self.out_monitor_var.set(True)
                self.start_out_monitor()
            return
        except subprocess.CalledProcessError:
            pass
            
        env = os.environ.copy()
        env['MPI_PROCS'] = self.wrf_procs_var.get().strip()
        
        # Construimos el comando como hace cron pero sin nohup ni & para no ignorar SIGINT. Popen ya es asincrono.
        cmd = f"/bin/bash {base_dir}/pre_process/{script_name}"
        if hours:
            cmd += f" {hours}"
            if date:
                cmd += f" {date}"
        cmd += f" >> {log_path} 2>&1"
        
        try:
            subprocess.Popen(cmd, shell=True, env=env, cwd=f"{base_dir}/pre_process")
            if not self.wrf_monitor_var.get():
                self.wrf_monitor_var.set(True)
                self.start_wrf_monitor()
            if not self.out_monitor_var.get():
                self.out_monitor_var.set(True)
                self.start_out_monitor()
        except Exception as e:
            messagebox.showerror("Error", f"Error al iniciar script bash: {e}")

    def toggle_wrf_monitor(self):
        if self.wrf_monitor_var.get():
            self.start_wrf_monitor()
        else:
            self.stop_script('wrf')
            
    def start_wrf_monitor(self):    
        run_dir = self.path_vars.get('run_dir')
        base_dir = run_dir.get() if run_dir else self.base_dir
        
        pre_script = self.processing_vars.get('pre_script')
        script_name = pre_script.get() if pre_script else 'run_wrf.sh'
        log_name = os.path.splitext(script_name)[0] + '.log'
        log_file = f"{base_dir}/pre_process/{log_name}"
        
        if not os.path.exists(log_file):
            messagebox.showinfo("Aviso", f"No se encontró archivo de log ({log_name}).")
            return
            
        cmd = f"tail -n 200 -f {log_file}"
        self.start_script('wrf', cmd, f"{base_dir}/pre_process", self.queue_wrf, self.text_wrf)

    def stop_wrf(self):
        """Detiene la ejecución del script WRF y procesos asociados (wrf.exe, real.exe, curl)"""
        pre_script = self.processing_vars.get('pre_script')
        script_name = pre_script.get() if pre_script else 'run_wrf.sh'
        
        try:
            # Detener el script bash principal (con SIGINT para permitir limpieza interna)
            subprocess.run(["pkill", "-2", "-f", script_name], check=False)
            
            # Detener descargas activas (específicamente curl a NOMADS)
            subprocess.run(["pkill", "-2", "-f", "curl.*nomads.ncep.noaa.gov"], check=False)
            
            # Detener ejecutables de WRF si siguen corriendo
            subprocess.run(["pkill", "-2", "wrf.exe"], check=False)
            subprocess.run(["pkill", "-2", "real.exe"], check=False)
            subprocess.run(["pkill", "-2", "metgrid.exe"], check=False)
            subprocess.run(["pkill", "-2", "ungrib.exe"], check=False)
            
            messagebox.showinfo("Detención", "Se han enviado señales de detención a los procesos de WRF.")
        except Exception as e:
            messagebox.showwarning("Aviso", f"Error al intentar detener procesos: {e}")

    def toggle_out_monitor(self):
        if self.out_monitor_var.get():
            self.start_out_monitor()
        else:
            self.stop_script('out')
            
    def start_out_monitor(self):
        # En el config se llama 'pos_script' o usamos run_out.sh de forma por defecto
        pos_script = self.processing_vars.get('pos_script')
        script_name = pos_script.get() if pos_script else 'run_out.sh'
        log_name = os.path.splitext(script_name)[0] + '.log'
        
        run_dir = self.path_vars.get('run_dir')
        base_dir = run_dir.get() if run_dir else self.base_dir
        log_file = f"{base_dir}/pos_process/{log_name}"
        
        if not os.path.exists(log_file):
            messagebox.showinfo("Aviso", f"No se encontró archivo de log ({log_name}) para monitorizar. Se creará al iniciar proceso.")
            return
            
        cmd = f"tail -n 200 -f {log_file}"
        self.start_script('out', cmd, f"{base_dir}/pos_process", self.queue_out, self.text_out)

    def stop_out(self):
        self.stop_script('out')
        
    def update_monitor_consoles(self):
        # Update WRF console
        try:
            while True:
                line = self.queue_wrf.get_nowait()
                self.text_wrf.insert(tk.END, line)
                self.text_wrf.see(tk.END)
        except queue.Empty:
            pass
            
        # Update OUT console
        try:
            while True:
                line = self.queue_out.get_nowait()
                self.text_out.insert(tk.END, line)
                self.text_out.see(tk.END)
        except queue.Empty:
            pass
        
        if self.root.winfo_exists():
            self.root.after(100, self.update_monitor_consoles)



    def parse_wps_domains(self, return_bounds=False):
        """Parsea namelist.wps y devuelve rutas de polígonos o límites rectangulares."""
        try:
            import pyproj
            import re
            
            def get_wps_array(content, key, dtype=float, default=None):
                m = re.search(r'(?i)\b' + key + r'\s*=\s*([^\n]+)', content)
                if m:
                    val_str = m.group(1).split('!')[0].split('/')[0]
                    vals = [x.strip().strip("\'").strip("\"") for x in val_str.split(',') if x.strip()]
                    try: return [dtype(v) for v in vals]
                    except Exception: return default
                return default

            def get_wps_string(content, key, default=None):
                m = re.search(r'(?i)\b' + key + r'\s*=\s*([^\n]+)', content)
                if m:
                    val_str = m.group(1).split('!')[0].split('/')[0]
                    vals = [x.strip().strip("\'").strip("\"") for x in val_str.split(',') if x.strip()]
                    return vals[0].lower() if vals else default
                return default

            filepath = os.path.join(self.get_resolved_path('namelist_path'), 'namelist.wps')
            if not os.path.exists(filepath): return [] if not return_bounds else {}
                
            content = open(filepath, 'r').read()
            max_dom = get_wps_array(content, 'max_dom', int, [1])[0]
            map_proj = get_wps_string(content, 'map_proj', 'lambert')
            ref_lat = get_wps_array(content, 'ref_lat', float)[0]
            ref_lon = get_wps_array(content, 'ref_lon', float)[0]
            truelat1 = get_wps_array(content, 'truelat1', float, [ref_lat])[0]
            truelat2 = get_wps_array(content, 'truelat2', float, [truelat1])[0]
            stand_lon = get_wps_array(content, 'stand_lon', float, [ref_lon])[0]
            
            e_we = get_wps_array(content, 'e_we', int)
            e_sn = get_wps_array(content, 'e_sn', int)
            dx = get_wps_array(content, 'dx', float)[0]
            dy = get_wps_array(content, 'dy', float, [dx])[0]
            i_parent = get_wps_array(content, 'i_parent_start', int, [1]*max_dom)
            j_parent = get_wps_array(content, 'j_parent_start', int, [1]*max_dom)
            parent_ratio = get_wps_array(content, 'parent_grid_ratio', int, [1]*max_dom)
            
            # Constantes de radio terrestre WRF
            WRF_R = 6370000
            if map_proj == 'lambert':
                p = pyproj.Proj(proj='lcc', lat_1=truelat1, lat_2=truelat2, lat_0=ref_lat, lon_0=stand_lon, a=WRF_R, b=WRF_R)
            elif map_proj == 'mercator':
                p = pyproj.Proj(proj='merc', lat_ts=truelat1, lon_0=stand_lon, a=WRF_R, b=WRF_R)
            elif map_proj == 'polar':
                p = pyproj.Proj(proj='stere', lat_ts=truelat1, lat_0=90.0 if truelat1 > 0 else -90.0, lon_0=stand_lon, a=WRF_R, b=WRF_R)
            else: return [] if not return_bounds else {}

            # Calculamos centro y origen en el plano de proyección
            cx, cy = p(ref_lon, ref_lat)
            ref_x, ref_y = (e_we[0]-1)/2.0, (e_sn[0]-1)/2.0
            
            origins_x = [cx - ref_x * dx]
            origins_y = [cy - ref_y * dy]
            cur_dx, cur_dy = [dx], [dy]
            
            for i in range(1, max_dom):
                ratio = parent_ratio[i]
                d_dx = cur_dx[i-1] / ratio
                d_dy = cur_dy[i-1] / ratio
                cur_dx.append(d_dx)
                cur_dy.append(d_dy)
                origins_x.append(origins_x[i-1] + (i_parent[i]-1) * cur_dx[i-1])
                origins_y.append(origins_y[i-1] + (j_parent[i]-1) * cur_dy[i-1])

            results_list = []
            results_bounds = {}
            
            for i in range(max_dom):
                w_m = (e_we[i]-1) * cur_dx[i]
                h_m = (e_sn[i]-1) * cur_dy[i]
                x_sw, y_sw = origins_x[i], origins_y[i]
                
                # Generamos polígono visual con puntos intermedios para curvas
                n = 10
                path_m = []
                for j in range(n+1): path_m.append((x_sw + j*w_m/n, y_sw))
                for j in range(1, n+1): path_m.append((x_sw + w_m, y_sw + j*h_m/n))
                for j in range(1, n+1): path_m.append((x_sw + w_m - j*w_m/n, y_sw + h_m))
                for j in range(1, n+1): path_m.append((x_sw, y_sw + h_m - j*h_m/n))
                
                lons, lats = p([pt[0] for pt in path_m], [pt[1] for pt in path_m], inverse=True)
                path = list(zip(lats, lons))
                results_list.append({'name': f'd{i+1:02d}', 'path': path})
                
                results_bounds[f'd{i+1:02d}'] = {
                    'left': min(lons), 'right': max(lons),
                    'bottom': min(lats), 'top': max(lats)
                }
                
            return results_bounds if return_bounds else results_list
        except Exception as e:
            print("Error parsing WPS:", e)
            return {} if return_bounds else []

    def on_closing(self):
        """Cleanup before exit"""
        self.root.destroy()



    def draw_wrf_domains_on_map(self, map_widget, poly_list_attr_name, show):
        polylists = getattr(self, poly_list_attr_name, [])
        for p in polylists:
            try:
                p.delete()
            except Exception:
                pass
        polylists.clear()

        
        if show:
            domains = self.parse_wps_domains()
            for dom in domains:
                # Dibujamos en morado transparente / línea para diferenciar del resto
                poly = map_widget.set_polygon(dom['path'], outline_color="purple", fill_color="", border_width=2, name=f"wrf_dom_{dom['name']}")
                polylists.append(poly)
        
        setattr(self, poly_list_attr_name, polylists)

def main():
    root = tk.Tk()
    app = ConfigEditor(root)
    root.mainloop()

if __name__ == "__main__":
    main() 
