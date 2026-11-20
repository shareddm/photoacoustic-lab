"""Convert a local image folder to paired NPZ files using the browser model.

Dependencies: Python 3, Pillow; Node.js 18+ on PATH. Images stay local.
Use --polarity bright-weaker for the user's stated grayscale convention.
"""
import argparse
import json
from pathlib import Path
import subprocess
from PIL import Image, ImageOps


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("--out", type=Path, default=Path("output/imported-dataset"))
    parser.add_argument("--size", type=int, choices=[32, 64, 96], default=64)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--settings", type=Path)
    parser.add_argument("--polarity", choices=["bright-weaker", "bright-stronger"], default="bright-weaker")
    args = parser.parse_args()
    cfg = {}
    if args.settings:
        cfg = json.loads(args.settings.read_text())
        cfg = cfg.get("config", cfg)
    args.out.mkdir(parents=True, exist_ok=True)
    runner = Path(__file__).resolve().with_name("generate_dataset.cjs")
    files = sorted(p for p in args.input_dir.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tif", ".tiff"})
    if not files:
        parser.error("No supported images found in the input folder.")
    manifest = {"engine": "analytic-array-surrogate" if cfg.get("scan_config", "raster") != "raster" else "analytic-raster-surrogate", "kwave_executed": False, "samples": [],
                "split_note": "Group by original vessel geometry before splitting. This script does not infer patient/geometry identities from filenames."}
    for index, file in enumerate(files):
        with Image.open(file) as raw:
            image = ImageOps.exif_transpose(raw).convert("RGBA")
            background = Image.new("RGBA", image.size, "white")
            image = Image.alpha_composite(background, image).convert("RGB")
            original_size = image.size
            image = image.resize((args.size, args.size), Image.Resampling.BILINEAR)
            # Match browser luminance coefficients, including RGB conversion.
            pixels = image.tobytes()
            reference = [(.2126*pixels[i] + .7152*pixels[i+1] + .0722*pixels[i+2])/255
                         for i in range(0, len(pixels), 3)]
        config = {**cfg, "size": args.size, "seed": args.seed + index, "polarity": args.polarity}
        source = {"kind": "upload", "filename": file.name, "original_width": original_size[0],
                  "original_height": original_size[1], "resampled_width": args.size, "resampled_height": args.size,
                  "aspect_handling": "rescaled to square", "phantom_id": file.stem}
        scene = {"reference": reference, "config": config, "source": source}
        completed = subprocess.run(["node", str(runner), "--scene-stdin", "true", "--name", f"image-{index:05d}", "--out", str(args.out.resolve())],
                                   input=json.dumps(scene), text=True, capture_output=True, check=True)
        manifest["samples"].append(json.loads(completed.stdout))
        print(f"{index+1}/{len(files)}: {file.name}")
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
