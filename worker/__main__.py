"""Allow `python -m worker <analysis_id>` as a shorthand for `python -m worker.analyze`."""

import sys

from worker.analyze import main

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python -m worker <analysis_id>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
