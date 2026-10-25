"""Make offline dataset tools importable during unittest discovery."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "datasets"))
