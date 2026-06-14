import argparse
import csv
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from onnxruntime import InferenceSession


DEFAULT_MODEL_DIR = Path(
    r"D:\BaiduNetdiskDownload\更新环境库的webui Forge整合包"
    r"\sd-webui-forge-aki-v4.8\extensions\stable-diffusion-webui-wd14-tagger"
    r"\models\wd14-vit-v2-git"
)

CATEGORY_NAMES = {
    "0": "general",
    "1": "artist",
    "3": "copyright",
    "4": "character",
    "5": "meta",
}


def prepare_image(image_path: Path, size: int) -> np.ndarray:
    with Image.open(image_path) as source:
        image = source.convert("RGBA")
        background = Image.new("RGBA", image.size, "WHITE")
        background.alpha_composite(image)
        rgb = background.convert("RGB")

    square_size = max(rgb.size[0], rgb.size[1], size)
    square = Image.new("RGB", (square_size, square_size), "WHITE")
    offset = ((square_size - rgb.size[0]) // 2, (square_size - rgb.size[1]) // 2)
    square.paste(rgb, offset)
    square = square.resize((size, size), Image.Resampling.LANCZOS)
    image_array = np.asarray(square, dtype=np.float32)[:, :, ::-1]
    return np.expand_dims(image_array, 0)


def load_tags(tags_path: Path):
    with tags_path.open("r", encoding="utf-8") as tag_file:
        return list(csv.DictReader(tag_file))


def tag_images(folder: Path, names, threshold: float, model_dir: Path):
    model_path = model_dir / "model.onnx"
    tags_path = model_dir / "selected_tags.csv"
    if not model_path.exists() or not tags_path.exists():
        raise FileNotFoundError(f"WD14 model files not found in {model_dir}")

    session = InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    input_meta = session.get_inputs()[0]
    output_name = session.get_outputs()[0].name
    size = int(input_meta.shape[1])
    tag_rows = load_tags(tags_path)
    results = []

    for name in names:
        image_path = folder / Path(name).name
        if not image_path.is_file():
            continue
        scores = session.run([output_name], {input_meta.name: prepare_image(image_path, size)})[0][0]
        tags = []
        for row, score in zip(tag_rows[4:], scores[4:]):
            confidence = float(score)
            if confidence < threshold:
                continue
            tags.append(
                {
                    "name": row["name"],
                    "category": CATEGORY_NAMES.get(row["category"], "general"),
                    "confidence": round(confidence, 4),
                }
            )
        tags.sort(key=lambda tag: tag["confidence"], reverse=True)
        results.append({"name": image_path.name, "tags": tags})
    return results


def main():
    parser = argparse.ArgumentParser(description="Run local WD14 Danbooru tagging.")
    parser.add_argument("--folder", required=True)
    parser.add_argument("--file", action="append", required=True, dest="files")
    parser.add_argument("--threshold", type=float, default=0.35)
    parser.add_argument("--model-dir", default=os.environ.get("WD14_MODEL_DIR", str(DEFAULT_MODEL_DIR)))
    args = parser.parse_args()

    folder = Path(args.folder).resolve()
    results = tag_images(folder, args.files, args.threshold, Path(args.model_dir))
    json.dump({"provider": f"local-{Path(args.model_dir).name}", "results": results}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
