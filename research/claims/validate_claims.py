import csv
import sys
from pathlib import Path

def validate_claims():
    claims_file = Path("research/claims/claim_evidence.csv")
    if not claims_file.exists():
        print(f"Error: {claims_file} not found.")
        sys.exit(1)
        
    project_root = claims_file.parent.parent.parent
    
    with open(claims_file, "r") as f:
        reader = csv.DictReader(f)
        claims = list(reader)
        
    errors = 0
    for claim in claims:
        if claim["verification_status"] == "SUPPORTED" and claim["claim_type"] == "quantitative":
            raw_files = claim["raw_result_files"].split(";")
            for rf in raw_files:
                rf = rf.strip()
                if rf:
                    file_path = project_root / rf
                    if not file_path.exists():
                        print(f"[-] Claim {claim['claim_id']} missing evidence: {rf}")
                        errors += 1
                        
    if errors > 0:
        print(f"\nValidation FAILED with {errors} missing evidence files.")
        sys.exit(1)
    else:
        print(f"\nValidation PASSED. All SUPPORTED quantitative claims have evidence.")
        sys.exit(0)

if __name__ == "__main__":
    validate_claims()
