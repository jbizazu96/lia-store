"""Generate LIA web, PWA, native-source, and print assets from one logo PNG."""

from __future__ import annotations

from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public/icon/lia-brand-concept-v5-transparent.png"
ICON_DIR = ROOT / "public/icon"
BRAND_DIR = ROOT / "public/brand"
PRINT_DIR = ROOT / "assets/print"
NATIVE_DIR = ROOT / "assets"

GREEN = (6, 78, 59, 255)
ORANGE = (249, 115, 22, 255)
WHITE = (255, 255, 255, 255)


def trimmed_logo() -> Image.Image:
    image = Image.open(SOURCE).convert("RGBA")
    alpha_box = image.getchannel("A").getbbox()
    if alpha_box is None:
        raise RuntimeError("The approved logo has no visible pixels.")
    return image.crop(alpha_box)


def compose_square(
    logo: Image.Image,
    size: int,
    fill_ratio: float,
    background: tuple[int, int, int, int] | None,
) -> Image.Image:
    mode = "RGBA" if background is None or background[3] < 255 else "RGB"
    color = (0, 0, 0, 0) if background is None else background
    canvas = Image.new("RGBA", (size, size), color)
    maximum = int(size * fill_ratio)
    fitted = logo.copy()
    fitted.thumbnail((maximum, maximum), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.alpha_composite(fitted, (x, y))
    return canvas if mode == "RGBA" else canvas.convert("RGB")


def save_png(image: Image.Image, path: Path, dpi: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    options = {"optimize": True}
    if dpi is not None:
        options["dpi"] = (dpi, dpi)
    image.save(path, "PNG", **options)


def monochrome(logo: Image.Image, color: tuple[int, int, int, int]) -> Image.Image:
    result = Image.new("RGBA", logo.size, color)
    result.putalpha(logo.getchannel("A"))
    return result


def dark_background_logo(logo: Image.Image) -> Image.Image:
    """Turn the green portion white while retaining LIA orange accents."""
    result = logo.copy()
    pixels = result.load()
    for y in range(result.height):
        for x in range(result.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha > 0 and green >= red and green >= blue:
                pixels[x, y] = (255, 255, 255, alpha)
    return result


def main() -> None:
    logo = trimmed_logo()

    # Reusable website/email wordmarks.
    website_master = compose_square(logo, 1254, 0.84, None)
    save_png(website_master, BRAND_DIR / "lia-logo-transparent.png")
    save_png(compose_square(logo, 512, 0.84, None), BRAND_DIR / "lia-logo-transparent-512.png")
    save_png(compose_square(logo, 256, 0.84, None), BRAND_DIR / "lia-logo-transparent-256.png")
    save_png(compose_square(logo, 512, 0.84, WHITE), BRAND_DIR / "lia-logo-white-background-512.png")

    # Existing shared paths update every customer/store/driver/admin reference.
    for size in (192, 512):
        save_png(compose_square(logo, size, 0.78, WHITE), ICON_DIR / f"icon-{size}.png")
    save_png(compose_square(logo, 180, 0.78, WHITE), ICON_DIR / "apple-touch-icon.png")
    save_png(compose_square(logo, 96, 0.76, WHITE), ICON_DIR / "favicon-96x96.png")
    save_png(compose_square(logo, 512, 0.62, WHITE), ICON_DIR / "icon-maskable-512.png")
    save_png(compose_square(logo, 512, 0.84, None), ICON_DIR / "logo.png")
    save_png(compose_square(logo, 512, 0.84, None), ROOT / "public/logo.png")

    favicon_sizes = (16, 32, 48, 96)
    favicons = [compose_square(logo, size, 0.82, WHITE) for size in favicon_sizes]
    # Next.js' ICO decoder requires PNG-backed icon frames to be RGBA. Pillow
    # otherwise preserves the opaque white canvas as RGB inside the ICO, which
    # browsers accept but Next's production image pipeline rejects.
    favicon_master = compose_square(logo, 96, 0.82, WHITE).convert("RGBA")
    for favicon_path in (ROOT / "public/favicon.ico", ROOT / "src/app/favicon.ico"):
        favicon_master.save(
            favicon_path,
            format="ICO",
            sizes=[(size, size) for size in favicon_sizes],
        )
    for size, image in zip(favicon_sizes, favicons):
        save_png(image, ICON_DIR / f"favicon-{size}x{size}.png")

    # Native masters. Capacitor can generate platform catalogs from assets/.
    save_png(compose_square(logo, 1024, 0.76, WHITE), NATIVE_DIR / "icon-only.png")
    save_png(compose_square(logo, 1024, 0.62, None), NATIVE_DIR / "icon-foreground.png")
    save_png(Image.new("RGB", (1024, 1024), WHITE[:3]), NATIVE_DIR / "icon-background.png")
    save_png(compose_square(logo, 2732, 0.48, WHITE), NATIVE_DIR / "splash.png")
    dark_logo = dark_background_logo(logo)
    save_png(compose_square(dark_logo, 2732, 0.48, (3, 32, 25, 255)), NATIVE_DIR / "splash-dark.png")

    save_png(compose_square(logo, 1024, 0.76, WHITE), BRAND_DIR / "ios-app-store-1024.png")
    save_png(compose_square(logo, 512, 0.76, WHITE), BRAND_DIR / "android-play-store-512.png")
    save_png(compose_square(logo, 432, 0.62, None), BRAND_DIR / "android-adaptive-foreground-432.png")
    save_png(Image.new("RGB", (432, 432), WHITE[:3]), BRAND_DIR / "android-adaptive-background-432.png")

    for density, size in {
        "mdpi": 48,
        "hdpi": 72,
        "xhdpi": 96,
        "xxhdpi": 144,
        "xxxhdpi": 192,
    }.items():
        save_png(compose_square(logo, size, 0.76, WHITE), BRAND_DIR / f"android-legacy-{density}-{size}.png")

    # Android notification status icons must be a white silhouette with alpha.
    white_mark = monochrome(logo, WHITE)
    save_png(compose_square(white_mark, 96, 0.62, None), BRAND_DIR / "android-notification-white-96.png")

    # 15-inch-wide, 300-DPI apparel/print masters plus one-color options.
    print_width = 4500
    print_height = round(print_width * logo.height / logo.width)
    print_logo = logo.resize((print_width, print_height), Image.Resampling.LANCZOS)
    save_png(print_logo, PRINT_DIR / "lia-logo-full-color-transparent-4500.png", dpi=300)
    save_png(monochrome(print_logo, GREEN), PRINT_DIR / "lia-logo-one-color-green-4500.png", dpi=300)
    save_png(monochrome(print_logo, WHITE), PRINT_DIR / "lia-logo-one-color-white-4500.png", dpi=300)
    save_png(dark_background_logo(print_logo), PRINT_DIR / "lia-logo-dark-shirt-4500.png", dpi=300)


if __name__ == "__main__":
    main()
