import type { Cover as CoverType } from "../api/types";

/** Renders a cover/image with focal-point-aware cropping, or a hatched placeholder. */
export function Cover({
  cover,
  ratio,
  rounded = true,
}: {
  cover: CoverType | null;
  ratio?: number; // width / height; defaults to the cover's intrinsic ratio or 4:5
  rounded?: boolean;
}) {
  const ar =
    ratio ??
    (cover?.width && cover?.height ? cover.width / cover.height : 4 / 5);
  const style: React.CSSProperties = {
    aspectRatio: String(ar),
    borderRadius: rounded ? "var(--r)" : 0,
  };
  if (!cover) {
    return (
      <div className="imgph" style={style}>
        no image
      </div>
    );
  }
  const objectPosition =
    cover.focal_x != null && cover.focal_y != null
      ? `${cover.focal_x * 100}% ${cover.focal_y * 100}%`
      : "center";
  return (
    <div className="imgph" style={style}>
      <img src={cover.url} alt="" style={{ objectPosition }} loading="lazy" />
    </div>
  );
}
