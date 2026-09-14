#!/usr/bin/env python3
"""
GridNexus Security Audit Automation (Phase 15).
Runs AST-based security linting (bandit) and checks dependency vulnerabilities (safety).
"""
import subprocess
import sys
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

def run_bandit():
    logger.info("Running Bandit security scanner...")
    # -r recursive, -c config if available, -ll only high/medium severity
    try:
        result = subprocess.run(
            ["python", "-m", "bandit", "-r", "app", "-ll", "-i"],
            capture_output=True, text=True, check=False
        )
        if result.returncode != 0:
            logger.error("Bandit found potential security issues!")
            print(result.stdout)
            return False
        logger.info("Bandit passed. No high/medium severity issues found.")
        return True
    except FileNotFoundError:
        logger.warning("Bandit is not installed or not in PATH. Skipping.")
        return True

def run_safety():
    logger.info("Running Safety dependency vulnerability scanner...")
    # safety check on current environment
    try:
        result = subprocess.run(
            ["python", "-m", "safety", "check", "--full-report"],
            capture_output=True, text=True, check=False
        )
        if result.returncode != 0:
            logger.error("Safety found vulnerable dependencies!")
            print(result.stdout)
            return False
        logger.info("Safety passed. No known vulnerable dependencies found.")
        return True
    except FileNotFoundError:
        logger.warning("Safety is not installed or not in PATH. Skipping.")
        return True

if __name__ == "__main__":
    logger.info("Starting GridNexus Security Audit...")
    
    bandit_ok = run_bandit()
    safety_ok = run_safety()
    
    if not (bandit_ok and safety_ok):
        logger.error("Security Audit FAILED. Please review the logs above.")
        sys.exit(1)
        
    logger.info("Security Audit PASSED. All checks look good.")
    sys.exit(0)
