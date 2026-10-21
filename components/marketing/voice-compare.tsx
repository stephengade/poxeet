import { Reveal } from "./motion";
import { SAMPLE_AUTHOR } from "./sample-calendar";

const GENERIC = "In today's fast-paced world, customer feedback is more important than ever. Here are five game-changing ways to unlock powerful insights and elevate your product strategy. Let's dive in. #Feedback #ProductManagement #Growth";

const VOICE = `The best feedback I got this year came from a support ticket.

Not a survey. Not an interview. A two-line ticket that said: "I don't know what this button will do."

We changed one word. Support tickets about it went to zero.

Where is your best feedback hiding?`;

/** The same idea, written two ways. Illustrative content. */
export function VoiceCompare() {
  return (
    <div className="compare">
      <Reveal as="figure" className="compare-card compare-generic">
        <figcaption className="compare-label">A generic AI draft</figcaption>
        <p className="compare-text">{GENERIC}</p>
        <ul className="compare-tags"><li>Stock opener</li><li>Buzzwords</li><li>Hashtag tail</li></ul>
      </Reveal>
      <Reveal as="figure" className="compare-card compare-voice" delay={90}>
        <figcaption className="compare-label">
          <span>A Poxeet draft</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- small local SVG */}
          <span className="compare-author"><img src={SAMPLE_AUTHOR.avatar} alt="" width={28} height={28} />{SAMPLE_AUTHOR.name} · sample profile</span>
        </figcaption>
        <p className="compare-text">{VOICE}</p>
        <ul className="compare-tags"><li>A specific moment</li><li>Short lines</li><li>One question</li></ul>
      </Reveal>
    </div>
  );
}
