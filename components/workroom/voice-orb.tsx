import { cn } from "../../lib/cn";

/**
 * The voice orb (public/voice-orb.gif), shown while Poxeet is reading or writing: clipped to a circle so the
 * GIF's black square never shows, slowly turning, breathing and glowing. Still when the member prefers less motion.
 */
export function VoiceOrb({ size = 96, label = "Working", className }: { size?: number; label?: string; className?: string }) {
  return (
    <span className={cn("wr-orb", className)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <span className="wr-orb-glow" aria-hidden="true" />
      <span className="wr-orb-disc" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- an animated GIF; next/image would freeze it */}
        <img src="/voice-orb.gif" alt="" width={size} height={size} decoding="async" />
      </span>
    </span>
  );
}
