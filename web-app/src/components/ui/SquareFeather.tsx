import { forwardRef } from "react";
import type { SVGProps } from "react";

type SquareFeatherProps = SVGProps<SVGSVGElement> & {
  size?: number;
  strokeWidth?: number;
};

const FEATHER_PATHS = [
  "M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z",
  "M16 8 2 22",
  "M17.5 15 9 15",
] as const;

const FEATHER_SCALE = 0.84;

const FRAME_PATH =
  "M10.5 2.5H4.5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3";

/** Extra headroom so the feather tip isn't clipped by the viewBox. */
const VIEW_BOX = "0 -2 26 26";

/** Compose glyph — feather in a rounded frame with the top-right corner open. */
export const SquareFeather = forwardRef<SVGSVGElement, SquareFeatherProps>(
  ({ size = 24, strokeWidth = 2, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={VIEW_BOX}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d={FRAME_PATH} />
      <g
        transform={`translate(15 10.5) scale(${FEATHER_SCALE}) translate(-11 -14)`}
      >
        {FEATHER_PATHS.map((d) => (
          <path key={d} d={d} strokeWidth={strokeWidth / FEATHER_SCALE} />
        ))}
      </g>
    </svg>
  ),
);

SquareFeather.displayName = "SquareFeather";
