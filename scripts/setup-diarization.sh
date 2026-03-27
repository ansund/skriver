#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PYTHON="$ROOT/.venv-diarization/bin/python"
BOOTSTRAP_PYTHON="${SKRIVER_DIARIZATION_BOOTSTRAP_PYTHON:-}"

if [[ -x "$VENV_PYTHON" ]]; then
  PYTHON="$VENV_PYTHON"
else
  PYTHON=""
  for candidate in "${BOOTSTRAP_PYTHON}" python3.12 python3.11; do
    if [[ -n "$candidate" ]] && command -v "$candidate" >/dev/null 2>&1; then
      PYTHON="$(command -v "$candidate")"
      break
    fi
  done

  if [[ -z "$PYTHON" ]]; then
    echo "Could not find a supported Python interpreter. Install python3.12 or set SKRIVER_DIARIZATION_BOOTSTRAP_PYTHON." >&2
    exit 1
  fi

  "$PYTHON" -m venv "$ROOT/.venv-diarization"
  PYTHON="$VENV_PYTHON"
fi

"$PYTHON" -m pip install --upgrade pip
"$PYTHON" -m pip install -r "$ROOT/requirements-diarization.txt"

echo "Local diarization environment is ready at $ROOT/.venv-diarization"
echo "For the first diarization run, accept the model terms for pyannote/speaker-diarization-community-1 and set HF_TOKEN or HUGGINGFACE_TOKEN if needed."
