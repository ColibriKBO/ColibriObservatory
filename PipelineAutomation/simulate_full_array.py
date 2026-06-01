"""Single-machine driver to run the ColibriPipeline orchestrator for all three
telescopes (RED, GREEN, BLUE) against the sim-mode directory layout.

Performs two passes over the orchestrator:
  Pass 1 (--phase base): per-telescope base pipeline (colibri_main_py3,
    coordsfinder, image_stats_dark, sensitivity, wcsmatching) up to the
    done.txt sentinel.
  Pass 2 (--phase post): cross-telescope stages (Green's simultaneous_occults
    + colibri_secondary, Blue's wcsmatching -m merge), end_processes
    (cumulative_stats, timeline), and Green's endgame email.

After both passes, the inspectable PDF lives at
  <sim_root>/pipeline_output/<obsdate>/<obsdate>_observation_summary.pdf

Usage:
  python simulate_full_array.py -d 20250830 [--repro] [--sigma 4] \\
      [--sim-root /path/to/sim] [--peer-timeout 60]
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULT_SIM_ROOT = '/home/agirmen/research_data/ColibriPipelineSimulatedDirs'
TELESCOPE_COLORS = {'REDBIRD': 'Red', 'GREENBIRD': 'Green', 'BLUEBIRD': 'Blue'}
PASS1_ORDER = ('REDBIRD', 'GREENBIRD', 'BLUEBIRD')
PASS2_ORDER = ('REDBIRD', 'BLUEBIRD', 'GREENBIRD')

THIS_DIR = Path(__file__).resolve().parent
ORCHESTRATOR = THIS_DIR / 'pipeline_automation.py'

# Source kernel file shipped with the pipeline repo, copied into the sim tree
# so colibri_secondary.py can find <basedir>/kernels/kernels.txt.
DEFAULT_KERNEL_SOURCE = (THIS_DIR.parent.parent / 'ColibriPipeline-Updated'
                         / 'KernelGeneratorGUI_RAB032922'
                         / 'kernels_40hz_20230206.txt')

# Column header for the cumulative-stats CSV consumed by cumulative_stats.py.
# Order matches the comment block at cumulative_stats.py:441-446.
CUMSTATS_HEADER = ('obsdate,red_obs_h,red_starh,red_occ,'
                   'green_obs_h,green_starh,green_occ,'
                   'blue_obs_h,blue_starh,blue_occ,'
                   'matched_starh,sat_matches,occ_2tel,occ_3tel\n')

# ACP log content for timeline.py.
#
# timeline.py filters lines via LOG_PATTERNS and parses them as follows:
#   getSunsetSunrise:   'INFO: Sunset JD: <float>'  and  'INFO: Sunrise JD: <float>'
#   getFieldsObserved:  '<ACPLOG_STRP timestamp> INFO: Field Name: field<NNN>'
#   getWeatherUnsafe:   '<timestamp> INFO: Weather unsafe!'
#   getDomeClosure:     '<timestamp> ALERT: Dome closed!'    ← ALERT not INFO
#   getObservingPlan_JD: lines containing 'starts' with token[7]=field<N>,
#                        token[9]=JD float, token[16]=int star count
#
# ACPLOG_STRP = '%a %b %d %H:%M:%S %Z %Y'  e.g. 'Sat Aug 30 02:30:00 UTC 2025'
# Aug 30 2025 is a Saturday; Aug 31 2025 is a Sunday.
# Minimal stub providing sunset/sunrise JDs for the sim date 2025-08-30.
# Values computed from telescope site (lat 43.1933N, lon -81.3160W):
#   sunset  2025-08-30 00:05 UTC  JD 2460917.5035
#   sunrise 2025-08-30 10:55 UTC  JD 2460917.9549
# Observation data (minute dirs at ~01:54 UTC) falls within this window.
# Field observations, weather events, and dome closures are NOT included here
# because they require the real ACP log from the telescope computer.  Copy
# the real log to {sim_root}/{Color}/Logs/ACP/20250830-ACP.log (UTF-16) and
# it will be used as-is (the bootstrap guard below skips existing files).
ACP_LOG_TEMPLATE = (
    "INFO: Sunset JD: 2460917.5035\n"
    "INFO: Sunrise JD: 2460917.9549\n"
)


def hyphenate(obsdate: str) -> str:
    return f"{obsdate[0:4]}-{obsdate[4:6]}-{obsdate[6:8]}"


def clear_sentinels(sim_root: Path, obsdate: str) -> None:
    """Remove sentinel and stop files so a re-run is treated as fresh."""
    hyphen = hyphenate(obsdate)
    for color in TELESCOPE_COLORS.values():
        archive_dir = sim_root / color / 'ColibriArchive' / hyphen
        data_dir = sim_root / color / 'ColibriData' / obsdate
        if archive_dir.exists():
            for f in archive_dir.glob('*.txt'):
                if f.name != 'primary_summary.txt':
                    f.unlink()
        if data_dir.exists():
            for f in data_dir.glob('*.txt'):
                f.unlink()

    # Blue is intentionally data-less; remove any stale symlinks from prior runs
    # that incorrectly bootstrapped it with Red's data.
    blue_data_dir = sim_root / 'Blue' / 'ColibriData' / obsdate
    if blue_data_dir.exists():
        for entry in blue_data_dir.iterdir():
            if entry.is_symlink():
                entry.unlink()
                print(f"Cleared stale Blue symlink: {entry}", flush=True)


def bootstrap_green_fixtures(sim_root: Path, obsdate: str,
                             kernel_source: Path = DEFAULT_KERNEL_SOURCE) -> None:
    """Create the Green-side fixture files the post-phase scripts require.

    - <root>/Green/kernels/kernels.txt: colibri_secondary.py loads this.
    - <root>/Green/CentralRepo/CumulativeStats/cumulative_stats.csv:
      cumulative_stats.py read_csv's this with no fallback.
    - <root>/Green/CentralRepo/CumulativeStats/Matches-SSO/sso_log.csv:
      same — cumulative_stats.py reads with no fallback.
    - <root>/Green/ColibriArchive/<hyphenated>/matched/: cumulative_stats.py
      iterates this dir; empty is fine for a no-detections sim night.

    All steps are no-ops if the destination already exists.
    """
    kernels_dest = sim_root / 'Green' / 'kernels' / 'kernels.txt'
    if not kernels_dest.exists():
        if not kernel_source.exists():
            print(f"WARNING: kernel source not found at {kernel_source}; "
                  f"colibri_secondary.py will fail.", file=sys.stderr)
        else:
            kernels_dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(kernel_source, kernels_dest)
            print(f"Bootstrapped {kernels_dest}", flush=True)

    cumstats_dest = (sim_root / 'Green' / 'CentralRepo' / 'CumulativeStats'
                     / 'cumulative_stats.csv')
    if not cumstats_dest.exists():
        cumstats_dest.parent.mkdir(parents=True, exist_ok=True)
        cumstats_dest.write_text(CUMSTATS_HEADER)
        print(f"Bootstrapped {cumstats_dest}", flush=True)

    # cumulative_stats.py overwrites this with whatever columns its DataFrame
    # has — which, with no matched events, drops the sigma columns and breaks
    # the next run's plotMatchedCandidates. Always reset it in sim.
    sso_dest = (sim_root / 'Green' / 'CentralRepo' / 'CumulativeStats'
                / 'Matches-SSO' / 'sso_log.csv')
    sso_dest.parent.mkdir(parents=True, exist_ok=True)
    sso_dest.write_text('timestamp,sigma1,sigma2,sigma3\n')
    print(f"Bootstrapped {sso_dest}", flush=True)

    matched_dest = (sim_root / 'Green' / 'ColibriArchive'
                    / hyphenate(obsdate) / 'matched')
    if not matched_dest.exists():
        matched_dest.mkdir(parents=True, exist_ok=True)
        print(f"Bootstrapped {matched_dest}", flush=True)

    # ACP logs for every telescope so timeline.py can extract sunset/sunrise.
    # Only write the minimal stub if no real log already exists; a real ACP log
    # placed here manually will be used as-is.
    # ACP writes its real logs as UTF-16; timeline.py opens with encoding='utf-16'.
    for color in TELESCOPE_COLORS.values():
        acp_dest = sim_root / color / 'Logs' / 'ACP' / f'{obsdate}-ACP.log'
        acp_dest.parent.mkdir(parents=True, exist_ok=True)
        if not acp_dest.exists():
            acp_dest.write_text(ACP_LOG_TEMPLATE, encoding='utf-16')
            print(f"Bootstrapped {acp_dest}", flush=True)

    # Weather/transparency stub for Green so timeline.py can draw the cloud
    # overlay line.  searchForWeatherLog looks for 'weather.log.<YYYY-MM-DD>'
    # when the obsdate is not today.  Only Green is needed; timeline.py tries
    # Green first and breaks on success.
    weather_dir = sim_root / 'Green' / 'Logs' / 'Weather' / 'Weather'
    weather_dir.mkdir(parents=True, exist_ok=True)
    weather_file = weather_dir / f'weather.log.{hyphenate(obsdate)}'
    if not weather_file.exists():
        # 10-column CSV: col[0]=Unix timestamp (seconds), col[9]=sky extinction.
        # col[9]+14.55 is plotted on a [0,2.5] mag y-axis; -14.0 ≈ 0.55 mag
        # (good transparency).  Timestamps span 2025-08-30 00:00-11:00 UTC.
        WEATHER_LOG_STUB = (
            "1756512000.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,-14.0\n"
            "1756515600.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,-14.1\n"
            "1756519200.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,-13.9\n"
            "1756526400.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,-14.0\n"
            "1756530000.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,-14.2\n"
        )
        weather_file.write_text(WEATHER_LOG_STUB)
        print(f"Bootstrapped {weather_file}", flush=True)

    # Parent directories that the post-phase scripts assume exist:
    # - <Green>/Logs/Operations/: timeline.py mkdir's <obsdate> under this
    #   without parents=True and crashes if the parent is missing.
    # - <Green>/tmp/: email_timeline.py shutil.copy's per-telescope ACP logs
    #   here as attachments.
    for relpath in ('Green/Logs/Operations', 'Green/tmp'):
        d = sim_root / relpath
        if not d.exists():
            d.mkdir(parents=True, exist_ok=True)
            print(f"Bootstrapped {d}", flush=True)

    # Green needs data to process so cross-telescope handoff paths are exercised.
    # Blue is intentionally left without data to test exception handling when a
    # telescope has no observations. Symlink Red's minute dirs into Green only.
    red_data_root = sim_root / 'Red' / 'ColibriData' / obsdate
    if red_data_root.exists():
        peer_data_root = sim_root / 'Green' / 'ColibriData' / obsdate
        peer_data_root.mkdir(parents=True, exist_ok=True)
        for src in red_data_root.iterdir():
            if not src.is_dir():
                continue
            dest = peer_data_root / src.name
            if not dest.exists():
                os.symlink(src.resolve(), dest)
                print(f"Bootstrapped symlink {dest} -> {src.resolve()}",
                      flush=True)

    # sensitivity.py waits (unbounded) for primary_summary.txt from ALL three
    # telescopes before picking the best minute to process. In the sequential
    # sim, Red's sensitivity runs before Green/Blue's base phase, so those
    # files never appear and sensitivity hangs forever.  Pre-seed stub
    # primary_summary files for Green and Blue using Red's minute dir so the
    # wait resolves immediately.  Green's stub will be overwritten by the real
    # output once colibri_main_py3 runs.  Blue's stub stays as-is because Blue
    # is intentionally data-less (tests exception handling for a missing telescope).
    red_archive = sim_root / 'Red' / 'ColibriArchive' / hyphenate(obsdate)
    red_summary = red_archive / 'primary_summary.txt'
    if red_summary.exists():
        for color in ('Green', 'Blue'):
            peer_archive = sim_root / color / 'ColibriArchive' / hyphenate(obsdate)
            peer_archive.mkdir(parents=True, exist_ok=True)
            peer_summary = peer_archive / 'primary_summary.txt'
            if not peer_summary.exists():
                shutil.copy(red_summary, peer_summary)
                print(f"Bootstrapped {peer_summary} (stub from Red)", flush=True)


def build_env(telescope: str, sim_root: Path, pdf_output: Path,
              peer_timeout: int) -> dict:
    env = os.environ.copy()
    env['COLIBRI_ENV'] = 'sim'
    env['COLIBRI_SIM_ROOT'] = str(sim_root)
    env['COLIBRI_TELESCOPE'] = telescope
    env['COMPUTERNAME'] = telescope
    env['COLIBRI_PEER_TIMEOUT'] = str(peer_timeout)
    env['COLIBRI_PDF_OUTPUT'] = str(pdf_output)
    return env


def run_phase(telescope: str, phase: str, obsdate: str, env: dict,
              extra_args: list, log_dir: Path) -> int:
    cmd = [
        sys.executable, str(ORCHESTRATOR),
        '-d', obsdate,
        '--env', 'sim',
        '--telescope', telescope,
        '--phase', phase,
        *extra_args,
    ]
    banner = f"\n{'='*60}\n[{phase.upper()}] {telescope}\n{'='*60}"
    print(banner, flush=True)
    print(' '.join(cmd), flush=True)

    # Tee orchestrator stdout+stderr to a per-(telescope,phase) log file under
    # pipeline_output/<obsdate>/ while mirroring live to the parent terminal.
    # Per-stage logs are already captured by runProcesses inside the
    # orchestrator; this captures the orchestrator's own banners, peer-wait
    # messages, and err.addError summary - which previously vanished on exit.
    log_path = log_dir / f'orchestrator_{telescope}_{phase}.log'
    with open(log_path, 'ab') as lf:
        lf.write((banner + '\n').encode())
        lf.write((' '.join(cmd) + '\n').encode())
        lf.flush()
        proc = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, bufsize=1)
        assert proc.stdout is not None
        for line in proc.stdout:
            sys.stdout.buffer.write(line)
            sys.stdout.flush()
            lf.write(line)
            lf.flush()
        returncode = proc.wait()
    print(f"[{phase.upper()}] {telescope} exit={returncode}", flush=True)
    return returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('-d', '--date', required=True,
                        help='Observation date (YYYYMMDD).')
    parser.add_argument('--repro', action='store_true',
                        help='Clear sentinels and re-run from scratch.')
    parser.add_argument('--sigma', default='4',
                        help='Significance threshold (default: 4).')
    parser.add_argument('--sim-root',
                        default=os.environ.get('COLIBRI_SIM_ROOT', DEFAULT_SIM_ROOT),
                        help='Sim array root (default: %(default)s).')
    parser.add_argument('--peer-timeout', type=int, default=60,
                        help='Seconds to wait for peer sentinels (default: 60).')
    args = parser.parse_args()

    sim_root = Path(args.sim_root).resolve()
    if not sim_root.exists():
        print(f"ERROR: sim root does not exist: {sim_root}", file=sys.stderr)
        return 2

    pdf_output = sim_root / 'pipeline_output' / args.date
    pdf_output.mkdir(parents=True, exist_ok=True)

    if args.repro:
        print(f"## Clearing sentinels for {args.date} under {sim_root} ##",
              flush=True)
        clear_sentinels(sim_root, args.date)

    # Bootstrap runs AFTER clear_sentinels so that fixture files (stub
    # primary_summary, ACP logs, etc.) are not immediately deleted.
    bootstrap_green_fixtures(sim_root, args.date)

    extra_args = ['-s', str(args.sigma)]
    if args.repro:
        extra_args.append('--repro')

    failures = []

    for telescope in PASS1_ORDER:
        env = build_env(telescope, sim_root, pdf_output, args.peer_timeout)
        rc = run_phase(telescope, 'base', args.date, env, extra_args, pdf_output)
        if rc != 0:
            failures.append(('base', telescope, rc))

    for telescope in PASS2_ORDER:
        env = build_env(telescope, sim_root, pdf_output, args.peer_timeout)
        rc = run_phase(telescope, 'post', args.date, env, extra_args, pdf_output)
        if rc != 0:
            failures.append(('post', telescope, rc))

    pdf_path = pdf_output / f'{args.date}_observation_summary.pdf'
    print(f"\n{'='*60}\nExpected PDF: {pdf_path}\nExists: {pdf_path.exists()}\n{'='*60}",
          flush=True)

    if failures:
        print("Failures:", flush=True)
        for phase, tel, rc in failures:
            print(f"  [{phase}] {tel} exit={rc}", flush=True)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
