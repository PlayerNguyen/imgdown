import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function iconProps({ size = 20, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

/** Renders the ImgDown gradient logo mark. */
export function LogoMark({ size = 30, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden {...props}>
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

/** Renders an upload arrow icon. */
export function UploadIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
      <path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15" />
    </svg>
  );
}

/** Renders a download arrow icon. */
export function DownloadIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5" />
      <path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16" />
    </svg>
  );
}

/** Renders a trash icon. */
export function TrashIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M6.5 7 7.2 19a2 2 0 0 0 2 1.9h5.6a2 2 0 0 0 2-1.9L17.5 7" />
      <path d="M10 11v5.5M14 11v5.5" />
    </svg>
  );
}

/** Renders a close icon. */
export function XIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** Renders a checkmark icon. */
export function CheckIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="m4.5 12.5 5 5L19.5 7" />
    </svg>
  );
}

/** Renders a warning triangle icon. */
export function AlertIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 4 2.8 20h18.4L12 4Z" />
      <path d="M12 9.5v4.5M12 17.5h.01" />
    </svg>
  );
}

/** Renders a history clock icon. */
export function HistoryIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" />
      <path d="M3.5 4.5v4h4" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** Renders a settings sliders icon. */
export function SlidersIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2.2" />
      <circle cx="9" cy="17" r="2.2" />
    </svg>
  );
}

/** Renders a lightning bolt icon. */
export function ZapIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M13.5 2.5 4.5 13.5h6L10 21.5l9.5-11.5h-6.3l.3-7.5Z" />
    </svg>
  );
}

/** Renders a ZIP archive icon. */
export function ZipIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1.5-1.5" />
      <path d="M14 3.5V8h4.5" />
      <path d="M10.5 6h2M10.5 9h2M10.5 12h2M11.5 15h1.2v2.5h-1.2z" />
    </svg>
  );
}

/** Renders a sparkle icon. */
export function SparkleIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 3.5l1.7 4.6 4.8 1.7-4.8 1.7L12 16.1l-1.7-4.6L5.5 9.8l4.8-1.7L12 3.5Z" />
      <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </svg>
  );
}

/** Renders a right arrow icon. */
export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 12h16m0 0-6-6m6 6-6 6" />
    </svg>
  );
}

/** Renders an image placeholder icon. */
export function ImageIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m5 18 5.2-5.2a1.5 1.5 0 0 1 2.1 0L19 19.5" />
    </svg>
  );
}

/** Renders a refresh icon. */
export function RefreshIcon(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M20 11.5A8 8 0 1 0 18 17" />
      <path d="M20 4.5v7h-7" />
    </svg>
  );
}

/** Renders an animated spinner. */
export function SpinnerIcon({ size = 18, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className="animate-spin" aria-hidden {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.2" fill="none" opacity="0.22" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
