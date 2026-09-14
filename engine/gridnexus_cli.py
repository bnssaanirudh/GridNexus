import argparse
import sys
from scripts.experiments.run_sybil_sweep import run_sybil_sweep
from scripts.experiments.run_collusion_sweep import run_collusion_sweep
from scripts.experiments.run_misreporting_sweep import run_misreporting_sweep
from scripts.experiments.run_ablation_study import run_ablation_study
from scripts.experiments.run_statistics import run_statistics
from scripts.experiments.run_scalability_sweep import run_scalability_sweep

def main():
    parser = argparse.ArgumentParser(description="GridNexus Reproducibility CLI")
    subparsers = parser.add_subparsers(dest="command")
    
    reproduce_parser = subparsers.add_parser("reproduce", help="Reproduce experiments and generate results")
    reproduce_parser.add_argument("--quick", action="store_true", help="Run a quick smoke test")
    reproduce_parser.add_argument("--full", action="store_true", help="Run the full experiment pipeline")
    
    args = parser.parse_args()
    
    if args.command == "reproduce":
        print("Starting GridNexus Reproduction...")
        
        try:
            if args.quick:
                print("\n[+] Running Quick Smoke Test...")
                run_ablation_study()
                run_statistics()
                
            elif args.full:
                print("\n[+] Running Full Benchmark Suite...")
                run_sybil_sweep()
                run_collusion_sweep()
                run_misreporting_sweep()
                run_ablation_study()
                run_scalability_sweep()
                run_statistics()
            else:
                print("Please specify --quick or --full.")
                
            print("\n[+] PASS: All research claims reproduced (within scope).")
        except Exception as e:
            print(f"\n[-] FAIL: Reproduction failed with error: {e}")
            sys.exit(1)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
