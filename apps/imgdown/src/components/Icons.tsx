import type { IconBaseProps } from "react-icons";
import {
  LuArrowRight,
  LuCheck,
  LuDownload,
  LuFileArchive,
  LuHistory,
  LuImage,
  LuLoaderCircle,
  LuRefreshCw,
  LuSlidersHorizontal,
  LuSparkles,
  LuTrash2,
  LuTriangleAlert,
  LuUpload,
  LuX,
  LuZap,
} from "react-icons/lu";
import type { SVGProps } from "react";

type IconProps = Omit<IconBaseProps, "size"> & { size?: number };

/**
 * Renders the ImgDown gradient brand mark.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function LogoMark(props: SVGProps<SVGSVGElement> & { size?: number }) {
  const { size = 30, ...rest } = props;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden {...rest}>
      <defs>
        <linearGradient id="logo-a" x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect x="2.5" y="2.5" width="27" height="27" rx="8.5" fill="url(#logo-a)" />
      <path
        d="M10 21.5 16 10l6 11.5M12.6 17.4h6.8"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Renders an upload icon from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function UploadIcon(props: IconProps) {
  return <LuUpload {...props} />;
}

/**
 * Renders a download icon from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function DownloadIcon(props: IconProps) {
  return <LuDownload {...props} />;
}

/**
 * Renders a trash icon from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function TrashIcon(props: IconProps) {
  return <LuTrash2 {...props} />;
}

/**
 * Renders a close icon from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function XIcon(props: IconProps) {
  return <LuX {...props} />;
}

/**
 * Renders a checkmark icon from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function CheckIcon(props: IconProps) {
  return <LuCheck {...props} />;
}

/**
 * Renders a warning icon from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function AlertIcon(props: IconProps) {
  return <LuTriangleAlert {...props} />;
}

/**
 * Renders a history icon from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function HistoryIcon(props: IconProps) {
  return <LuHistory {...props} />;
}

/**
 * Renders a sliders icon from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function SlidersIcon(props: IconProps) {
  return <LuSlidersHorizontal {...props} />;
}

/**
 * Renders a lightning icon from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function ZapIcon(props: IconProps) {
  return <LuZap {...props} />;
}

/**
 * Renders an archive icon from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function ZipIcon(props: IconProps) {
  return <LuFileArchive {...props} />;
}

/**
 * Renders a sparkle icon from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function SparkleIcon(props: IconProps) {
  return <LuSparkles {...props} />;
}

/**
 * Renders a right arrow icon from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function ArrowRightIcon(props: IconProps) {
  return <LuArrowRight {...props} />;
}

/**
 * Renders an image icon from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function ImageIcon(props: IconProps) {
  return <LuImage {...props} />;
}

/**
 * Renders a refresh icon from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function RefreshIcon(props: IconProps) {
  return <LuRefreshCw {...props} />;
}

/**
 * Renders an animated loading spinner from Lucide.
 * @param props - Icon props including size and className.
 * @returns The rendered icon element.
 */
export function SpinnerIcon(props: IconProps) {
  const className = ["animate-spin", props.className].filter(Boolean).join(" ");
  return <LuLoaderCircle {...props} className={className} />;
}
