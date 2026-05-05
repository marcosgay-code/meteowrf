#!/usr/bin/python3
# -*- coding: UTF-8 -*-

# Sys modules
from pathlib import Path
import os, sys, argparse
try:
    import psutil
except ImportError:
    psutil = None
here = os.path.dirname(os.path.realpath(__file__))
HOME = os.getenv('HOME')

# Loggings
import logging
import log_help
LG = logging.getLogger("main")
LGp = logging.getLogger("perform")

# RASP modules
import pandas as pd
import utils as ut
from calc_data import CalcData
# stations
import stations
# meteograms
from meteogram_writer import make_meteogram_timestep, append_to_meteogram
# web, sounding & meteogram
import plots
import gc
# export json
import json
import numpy as np

def existing_file(path):
   """Helper function for argparse to check if input file exists"""
   if not os.path.isfile(path):
      raise argparse.ArgumentTypeError(f"File not found: {path}")
   return path

def parse_args():
   """
   Define input options
   - filepath: wrfout file to process
   - config: path to config.ini file
   """
   parser = argparse.ArgumentParser(
       description="Post-process a WRF output file and generate plots." )
   parser.add_argument("filepath",  type=existing_file,
          help="Path to the WRF NetCDF file (wrfout_<domain>_<date>)" )
   parser.add_argument("--config", default=str(Path(here).parent / "config.ini"),
                       help=f"Path to config.ini (default: {Path(here).parent}/config.ini)")
   return parser.parse_args()

def export_all_to_json(A, output_dir, config_path):
    """
    Exports all meteorological variables to JSON files for the web viewer.
    A: CalcData instance
    output_dir: Directory to save JSON files
    config_path: Path to plots.ini for factors/scaling
    """
    import json
    import numpy as np
    from pathlib import Path

    wrf = A.wrf_vars
    drjack = A.drjack_vars
    config = plots.utils.load_config(config_path)
    
    # 1. Define fields to export
    # Mapping: name -> {'val': array, 'dir': array_optional}
    fields = {
        'sfcwind'   : {'val': wrf['wspd10'].values, 'dir': wrf['wdir10'].values},
        'wind1500'  : {'val': wrf['wspd1500'].values, 'dir': wrf.get('wdir1500', np.zeros_like(wrf['wspd1500'])).values},
        'wind2000'  : {'val': wrf['wspd2000'].values, 'dir': wrf.get('wdir2000', np.zeros_like(wrf['wspd2000'])).values},
        'wind2500'  : {'val': wrf['wspd2500'].values, 'dir': wrf.get('wdir2500', np.zeros_like(wrf['wspd2500'])).values},
        'wind3000'  : {'val': wrf['wspd3000'].values, 'dir': wrf.get('wdir3000', np.zeros_like(wrf['wspd3000'])).values},
        'cape'      : {'val': wrf['cape'].values},
        'rain'      : {'val': wrf['rain'].values},
        'lowfrac'   : {'val': wrf['low_cloudfrac'].values},
        'midfrac'   : {'val': wrf['mid_cloudfrac'].values},
        'highfrac'  : {'val': wrf['high_cloudfrac'].values},
        'blcloudpct': {'val': wrf['blcloudpct'].values},
        't2m'       : {'val': wrf['t2m'].values - 273.15},
        'blwind'    : {'val': drjack['blwind'].values, 'dir': drjack.get('blwind_dir', np.zeros_like(drjack['blwind'])).values},
        'bltopwind' : {'val': drjack['bltopwind'].values, 'dir': drjack.get('bltopwind_dir', np.zeros_like(drjack['bltopwind'])).values},
        'hglider'   : {'val': drjack['hglider'].values},
        'wstar'     : {'val': drjack['wstar'].values},
        'zsfclcl'   : {'val': drjack['zsfclcl'].values},
        'zblcl'     : {'val': drjack['zblcl'].values},
        'wblmaxmin' : {'val': drjack['wblmaxmin'].values},
    }
    
    # Add extra variables if they exist
    if 'gust' in wrf: fields['gust'] = {'val': wrf['gust'].values}
    if 'slp' in wrf: fields['slp'] = {'val': wrf['slp'].values}
    if 'swdown' in wrf: fields['swdown'] = {'val': wrf['swdown'].values}

    date_str = A.meta['valid_time'].strftime('%Y%m%d_%H%M')
    hhmm = A.meta['valid_time'].strftime('%H%M')
    domain = A.meta['domain']

    for name, data_dict in fields.items():
        # Get scaling factor from config
        factor, _, _, _, _, _, _, _ = plots.utils.scalar_props(config, name)
        
        main_val = np.round(data_dict['val'] * factor, 2)
        main_val = np.nan_to_num(main_val, nan=0.0)
        ny, nx = main_val.shape
        
        grid_data = {
            "nx": int(nx),
            "ny": int(ny),
            "values": main_val.flatten().tolist()
        }
        
        # If it's a wind field, we also export direction (twdDeg) and call speed twsKn 
        # (to maintain compatibility with the app's current expectation for wind)
        if 'dir' in data_dict:
            wdir = np.round(data_dict['dir'], 1)
            wdir = np.nan_to_num(wdir, nan=0.0)
            grid_data["twsKn"] = grid_data.pop("values")
            grid_data["twdDeg"] = wdir.flatten().tolist()
        
        payload = {
            "ok": True,
            "variable": name,
            "units": config.get(name, {}).get('units', ''),
            "grid": grid_data
        }
        
        outfile = Path(output_dir) / f"{hhmm}_{name}.json"
        
        try:
            with open(outfile, 'w', encoding='utf-8') as f:
                json.dump(payload, f, separators=(',', ':'))
            # LG.debug(f"Exported {name} to {outfile}")
        except Exception as e:
            LG.error(f"Error exporting {name} to JSON: {e}")

    LG.info(f"Exported {len(fields)} variables to JSON for {domain} ({date_str})")


@log_help.timer(LG,LGp)
def process_file(fname, configfile, LG):
   """
   Run post-processing for wrfout file
   """
   LG.info(f"Processing file: {fname}")
   paths = ut.load_config_or_die(configfile)

   plots_folder   = paths['plots_folder']
   data_folder    = paths['data_folder']
   configs_folder = paths['configs_folder']
   plots_ini      = paths['plots_ini']

   A = CalcData(fname, OUT_folder=plots_folder, DATA_folder=data_folder)
   domain = A.meta['domain']

   # Read station metadata file
   stations_csv = Path(configs_folder) / f"stations_{domain}.csv"

   if not stations_csv.exists():
      LG.warning(f"Station list not found: {stations_csv}. Skipping station predictions.")

   if stations_csv.exists() and stations_csv.stat().st_size > 0:
      LG.info(f"Reading station list from: {stations_csv}")
      try:
          # Headerless CSV: use header=None and assign names
          df_raw = pd.read_csv(stations_csv, header=None).fillna('')
          if len(df_raw.columns) >= 3:
              df = df_raw.iloc[:, :3]
              df.columns = ['lat', 'lon', 'name']
          else:
              df = pd.DataFrame()
      except pd.errors.EmptyDataError:
          df = pd.DataFrame()

      if df.empty:
          LG.warning(f"Station list is empty: {stations_csv}")

      predictions_folder = A.paths["data_stations"] / "predictions"
      ut.check_directory(predictions_folder)  # create if missing
      for i, row in df.iterrows():
         lat, lon = float(row["lat"]), float(row["lon"])
         # Use the original name from CSV to match Zoom section
         original_name = str(row["name"]).strip()
         station_id = original_name.lower().replace(' ', '_')

         LG.info(f"Saving prediction for station '{station_id}'")
         stations.extract_wrf.save_prediction(A, station_id, lat, lon, predictions_folder)
   else:
      LG.warning(f"No stations CSV available for {domain}. Skipping station predictions.")

   LG.info("Exporting all variables to JSON...")
   export_all_to_json(A, A.paths['plots_daily'], plots_ini)


   # Soundings & meteograms
   # Get points of interest for soundings and meteograms
   LG.info("Plotting soundings and meteograms")
   soundings_csv = Path(configs_folder) / f"soundings_{domain}.csv"
   if soundings_csv.exists() and soundings_csv.stat().st_size > 0:
      try:
         df_raw = pd.read_csv(soundings_csv, header=None).fillna('')
         if len(df_raw.columns) >= 3:
             df = df_raw.iloc[:, :3]
             df.columns = ['lat', 'lon', 'name']
         else:
             df = pd.DataFrame(columns=['lat', 'lon', 'name'])
      except pd.errors.EmptyDataError:
         df = pd.DataFrame(columns=['lat', 'lon', 'name'])
   else:
      LG.warning(f"Soundings file missing or empty: {soundings_csv}")
      df = pd.DataFrame(columns=['lat', 'lon', 'name'])

   # Plot sounding and meteogram for each point
   for _, row in df.iterrows():
      lat, lon, name = row['lat'], row['lon'], row['name']
      code = str(name).strip().lower().replace(' ', '_')

      # Sounding
      fout = A.paths["plots_daily"] / f"{A.tail_h}_sounding_{code}.webp"
      plots.sounding.skew_t_plot(A, lat, lon, name=name, fout=fout)

      # Meteogram
      day_nc = A.paths["data_meteograms"] / f"meteogram_{code}.nc"
      ds = make_meteogram_timestep(A, lat, lon)
      ds_full = append_to_meteogram(ds, day_nc)
      if len(ds_full["time"]) >= 2:
         fout = A.paths["plots_daily"] / f"meteogram_{code}.webp"
         plots.meteogram.plot_meteogram(day_nc, name=name, fout=fout)
      else:
         LG.debug(f"Skipping meteogram plot for {code} (only one time point)")

   LG.info(f"Finished processing {fname}")

def main():
   args = parse_args()
   fname = args.filepath
   fname = Path(fname)
   config_file = args.config

   # Get common variables for setting up LOG
   is_cron = bool(os.getenv('RUN_BY_CRON'))
   domain = ut.get_domain(fname)
   date = ut.file2date(fname)

   # Prepare standard GFSbatch path
   # batch_path = fname.parent / "batch.txt"
   # batch = ut.get_GFSbatch(batch_path)
   batch = ut.get_batch_from_metadata(fname)
   script_path = os.path.realpath(__file__)

   LG, LGp = log_help.batch_logger(script_path, domain, batch, is_cron, log_dir='logs')
   LG.info("=================================================")
   LG.info("=                New run started                =")
   LG.info("=================================================")
   LG.info(f"Cron: {is_cron}")
   try:
      process_file(fname, config_file, LG)
      gc.collect()
   except Exception as e:
      LG.exception(f"Failed to process file {fname}: {e}")
      sys.exit(1)
   if psutil:
       mem = psutil.Process(os.getpid()).memory_info().rss / 1024**2
       LG.critical(f"Final memory before exit: {mem:.2f} MB")
   else:
       LG.info("Final memory: psutil not available")

if __name__ == "__main__":
   main()
