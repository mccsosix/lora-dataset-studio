import argparse
from pathlib import Path

from PIL import Image


def main():
    parser = argparse.ArgumentParser(description="Create a browser-friendly flattened preview.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with Image.open(input_path) as source:
        image = source.convert("RGBA")
        flattened = Image.new("RGB", image.size, "WHITE")
        flattened.paste(image.convert("RGB"))
        flattened.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        flattened.save(output_path, "JPEG", quality=90, optimize=True)


if __name__ == "__main__":
    main()
