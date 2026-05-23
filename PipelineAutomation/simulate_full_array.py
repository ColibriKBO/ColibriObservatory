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

# Minimal ACP log content. timeline.getSunsetSunrise only needs the substrings
# 'INFO: Sunset JD: ' and 'INFO: Sunrise JD: '; JD values are placeholders
# corresponding roughly to evening/morning of the sim obsdate.
ACP_LOG_TEMPLATE = (
    "INFO: Sunset JD: 2460917.9\n"
    "INFO: Sunrise JD: 2460918.4\n"
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
                f.unlink()
        if data_dir.exists():
            for f in data_dir.glob('*.txt'):
                f.unlink()


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

    # ACP logs for every telescope so timeline.py has at least one valid log
    # to extract sunset/sunrise from. Without this it raises FileExistsError
    # and the PDF is never generated.
    for color in TELESCOPE_COLORS.values():
        acp_dest = sim_root / color / 'Logs' / 'ACP' / f'{obsdate}-ACP.log'
        if not acp_dest.exists():
            acp_dest.parent.mkdir(parents=True, exist_ok=True)
            # ACP writes its real logs as UTF-16; timeline.py opens with
            # encoding='utf-16' so the fixture must match.
            acp_dest.write_text(ACP_LOG_TEMPLATE, encoding='utf-16')
            print(f"Bootstrapped {acp_dest}", flush=True)

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
              extra_args: list) -> int:
    cmd = [
        sys.executable, str(ORCHESTRATOR),
        '-d', obsdate,
        '--env', 'sim',
        '--telescope', telescope,
        '--phase', phase,
        *extra_args,
    ]
    print(f"\n{'='*60}\n[{phase.upper()}] {telescope}\n{'='*60}", flush=True)
    print(' '.join(cmd), flush=True)
    result = subprocess.run(cmd, env=env)
    print(f"[{phase.upper()}] {telescope} exit={result.returncode}", flush=True)
    return result.returncode


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

    bootstrap_green_fixtures(sim_root, args.date)

    if args.repro:
        print(f"## Clearing sentinels for {args.date} under {sim_root} ##",
              flush=True)
        clear_sentinels(sim_root, args.date)

    extra_args = ['-s', str(args.sigma)]
    if args.repro:
        extra_args.append('--repro')

    failures = []

    for telescope in PASS1_ORDER:
        env = build_env(telescope, sim_root, pdf_output, args.peer_timeout)
        rc = run_phase(telescope, 'base', args.date, env, extra_args)
        if rc != 0:
            failures.append(('base', telescope, rc))

    for telescope in PASS2_ORDER:
        env = build_env(telescope, sim_root, pdf_output, args.peer_timeout)
        rc = run_phase(telescope, 'post', args.date, env, extra_args)
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
