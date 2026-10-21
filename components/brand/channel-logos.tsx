// Official channel marks, unaltered, used only to name the channel (owner decision, 2026-10-15).
// Paths from simple-icons (CC0), colors from each brand's guidelines.

const LINKEDIN = "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 4.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z";
const X = "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z";

type Props = { size?: number; decorative?: boolean };

export function LinkedInLogo({ size = 20, decorative }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role={decorative ? undefined : "img"} aria-label={decorative ? undefined : "LinkedIn"} aria-hidden={decorative || undefined} style={{ flex: "none", display: "block" }}>
      <path fill="#0A66C2" d={LINKEDIN} />
    </svg>
  );
}

/** The X mark sits white on a black tile, as X's guidelines show it on colored grounds. */
export function XLogo({ size = 20, decorative }: Props) {
  return (
    <span className="wr-x-tile" style={{ width: size, height: size }} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : "X"} aria-hidden={decorative || undefined}>
      <svg width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d={X} /></svg>
    </span>
  );
}
