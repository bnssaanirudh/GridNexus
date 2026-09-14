import sqlite3
import shutil
from pathlib import Path
from datetime import datetime
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

def backup_database(db_path: str = "gridnexus.db", backup_dir: str = "backups") -> None:
    """
    Safely snapshots the GridNexus SQLite database using the SQLite backup API.
    This ensures that the backup is consistent even if the broker is concurrently writing transactions.
    """
    db_file = Path(db_path)
    if not db_file.exists():
        logger.error(f"Database {db_path} does not exist. Nothing to backup.")
        sys.exit(1)

    backup_folder = Path(backup_dir)
    backup_folder.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_file = backup_folder / f"gridnexus_backup_{timestamp}.db"
    
    logger.info(f"Starting live backup of {db_path} to {backup_file}...")
    
    try:
        # Connect to the live database
        live_db = sqlite3.connect(db_file)
        # Connect to the backup destination
        backup_db = sqlite3.connect(backup_file)
        
        # Use the built-in SQLite backup API for a consistent snapshot
        with backup_db:
            live_db.backup(backup_db, pages=1, progress=None)
            
        logger.info(f"Backup completed successfully: {backup_file}")
    except Exception as e:
        logger.error(f"Backup failed: {e}")
        sys.exit(1)
    finally:
        live_db.close()
        backup_db.close()

if __name__ == "__main__":
    # Ensure this works if run from engine/ or from the root directory
    db_target = "engine/gridnexus.db" if Path("engine/gridnexus.db").exists() else "gridnexus.db"
    
    # Allow passing custom db path for integration tests or different environments
    if len(sys.argv) > 1:
        db_target = sys.argv[1]

    backup_database(db_path=db_target, backup_dir="backups")
