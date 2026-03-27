#!/usr/bin/env python3
import argparse
import json
import os
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run local pyannote speaker diarization.")
    parser.add_argument("--audio", required=True, help="Path to 16k mono wav audio.")
    parser.add_argument("--output", required=True, help="Path to write JSON diarization output.")
    parser.add_argument(
        "--model-source",
        default="pyannote/speaker-diarization-community-1",
        help="Hugging Face model id or local pipeline directory.",
    )
    parser.add_argument("--num-speakers", type=int, default=None)
    parser.add_argument("--min-speakers", type=int, default=None)
    parser.add_argument("--max-speakers", type=int, default=None)
    return parser.parse_args()


def get_token() -> str | None:
    return (
        os.environ.get("HF_TOKEN")
        or os.environ.get("HUGGINGFACE_TOKEN")
        or os.environ.get("HUGGINGFACEHUB_API_TOKEN")
    )


def serialize_annotation(annotation) -> list[dict]:
    rows = []
    for segment, _, speaker in annotation.itertracks(yield_label=True):
        rows.append(
            {
                "start": round(float(segment.start), 3),
                "end": round(float(segment.end), 3),
                "speaker": str(speaker),
            }
        )
    rows.sort(key=lambda item: (item["start"], item["end"], item["speaker"]))
    return rows


def main() -> int:
    args = parse_args()

    try:
        from pyannote.audio import Pipeline
    except Exception as exc:  # pragma: no cover - import error path
        print(
            "pyannote.audio is not installed in this environment. Run `pnpm setup-diarization` first.",
            file=sys.stderr,
        )
        print(str(exc), file=sys.stderr)
        return 1

    token = get_token()
    model_source = args.model_source
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        if Path(model_source).exists():
            pipeline = Pipeline.from_pretrained(model_source)
        else:
            pipeline = Pipeline.from_pretrained(model_source, token=token)
    except Exception as exc:
        print(
            "Could not load the pyannote diarization pipeline. For the hosted model, accept the model terms and set HF_TOKEN or HUGGINGFACE_TOKEN before running diarization.",
            file=sys.stderr,
        )
        print(str(exc), file=sys.stderr)
        return 1

    diarize_kwargs = {}
    if args.num_speakers:
        diarize_kwargs["num_speakers"] = args.num_speakers
    if args.min_speakers:
        diarize_kwargs["min_speakers"] = args.min_speakers
    if args.max_speakers:
        diarize_kwargs["max_speakers"] = args.max_speakers

    try:
        output = pipeline(args.audio, **diarize_kwargs)
    except Exception as exc:
        print("pyannote diarization failed.", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1

    exclusive = getattr(output, "exclusive_speaker_diarization", None)
    segments = serialize_annotation(output.speaker_diarization)
    exclusive_segments = serialize_annotation(exclusive) if exclusive is not None else []
    speaker_count = len({segment["speaker"] for segment in (exclusive_segments or segments)})

    output_path.write_text(
        json.dumps(
            {
                "modelSource": model_source,
                "usedExclusiveDiarization": exclusive is not None,
                "speakerCount": speaker_count,
                "segments": segments,
                "exclusiveSegments": exclusive_segments,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
