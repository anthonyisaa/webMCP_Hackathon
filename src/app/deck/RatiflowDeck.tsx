"use client";

import Link from "next/link";
import { useCallback, useEffect, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import { DECK_SLIDE_COUNT, DECK_SLIDES } from "./content";
import { clampDeckIndex, deckIndexForKey, parseDeckHash } from "./navigation";
import styles from "./deck.module.css";

type SlideProps = {
  index: number;
  currentIndex: number;
  children: ReactNode;
  compositionClass?: string;
};

function Slide({
  index,
  currentIndex,
  children,
  compositionClass = "",
}: SlideProps) {
  const slide = DECK_SLIDES[index];
  const headingId = `${slide.id}-heading`;
  const positionId = `${slide.id}-position`;
  const headingClass = index === 0 ? styles.coverTitle : styles.slideTitle;

  return (
    <section
      id={slide.id}
      className={`${styles.slide} ${compositionClass}`}
      aria-labelledby={headingId}
      aria-describedby={positionId}
      aria-roledescription="slide"
      hidden={currentIndex !== index}
      role="region"
    >
      <span id={positionId} className={styles.srOnly}>Slide {index + 1} of {DECK_SLIDE_COUNT}</span>
      <div className={styles.slideHeader}>
        <span className={styles.wordmark}><i aria-hidden="true" /> Ratiflow</span>
        <span className={styles.sectionLabel}>{slide.section}</span>
      </div>
      {index === 0 ? (
        <h1 id={headingId} className={headingClass} tabIndex={-1}>
          {slide.title}
        </h1>
      ) : (
        <h2 id={headingId} className={headingClass} tabIndex={-1}>
          {slide.title}
        </h2>
      )}
      {children}
      <div className={styles.slideFooter} aria-hidden="true">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <i />
        <span>RATIFLOW · WEBMCP DEMO</span>
      </div>
    </section>
  );
}

function PreviewLabel({ children }: { children?: ReactNode }) {
  return (
    <span className={styles.previewLabel}>
      PRODUCT FLOW VISUAL{children ? <> · {children}</> : null}
    </span>
  );
}

function TruthLabel({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "violet" | "amber" }) {
  return <span className={`${styles.truthLabel} ${styles[`truth${tone}`]}`}>{children}</span>;
}

function EvidenceDot({ tone }: { tone: "human" | "code" | "general" | "data" }) {
  return <i className={`${styles.evidenceDot} ${styles[tone]}`} aria-hidden="true" />;
}

function isNativeControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.closest("a, button, input, textarea, select, summary, [role='button']") !== null
  );
}

function SourceLinks() {
  return (
    <p className={styles.sourceLinks}>
      Sources: <a href="https://learn.chatgpt.com/docs/webmcp" target="_blank" rel="noreferrer noopener">OpenAI Site Tools</a>
      <span aria-hidden="true"> · </span>
      <a href="https://webmachinelearning.github.io/webmcp/" target="_blank" rel="noreferrer noopener">WebMCP draft</a>
      <span aria-hidden="true"> · </span>
      <a href="https://developers.openai.com/api/docs/guides/tools-tool-search" target="_blank" rel="noreferrer noopener">OpenAI tool search</a>
    </p>
  );
}

function FutureSourceLinks() {
  return (
    <p className={styles.futureSourceLinks}>
      Official discussion: <a href="https://webmachinelearning.github.io/webmcp/" target="_blank" rel="noreferrer noopener">current draft</a>
      <span aria-hidden="true"> · </span>
      <a href="https://github.com/webmachinelearning/webmcp/issues/151" target="_blank" rel="noreferrer noopener">resources #151</a>
      <span aria-hidden="true"> · </span>
      <a href="https://github.com/webmachinelearning/webmcp/issues/196" target="_blank" rel="noreferrer noopener">progress #196</a>
      <span aria-hidden="true"> · </span>
      <a href="https://github.com/webmachinelearning/webmcp/blob/main/docs/service-workers.md" target="_blank" rel="noreferrer noopener">service workers</a>
    </p>
  );
}

const DECK_NAVIGATION_EVENT = "ratiflow-deck-navigation";

function subscribeToDeckHash(onStoreChange: () => void): () => void {
  window.addEventListener("hashchange", onStoreChange);
  window.addEventListener(DECK_NAVIGATION_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("hashchange", onStoreChange);
    window.removeEventListener(DECK_NAVIGATION_EVENT, onStoreChange);
  };
}

function readDeckHash(): number {
  return parseDeckHash(window.location.hash) ?? 0;
}

function readServerDeckHash(): number {
  return 0;
}

export function RatiflowDeck() {
  const currentIndex = useSyncExternalStore(
    subscribeToDeckHash,
    readDeckHash,
    readServerDeckHash,
  );

  const goTo = useCallback((requestedIndex: number, replace = false) => {
    const nextIndex = clampDeckIndex(requestedIndex);
    const nextHash = `#${DECK_SLIDES[nextIndex].id}`;
    if (window.location.hash !== nextHash) {
      window.history[replace ? "replaceState" : "pushState"](null, "", nextHash);
    }
    window.dispatchEvent(new Event(DECK_NAVIGATION_EVENT));
  }, []);

  useEffect(() => {
    const requestedIndex = parseDeckHash(window.location.hash);
    if (requestedIndex !== null && requestedIndex !== currentIndex) {
      window.dispatchEvent(new Event(DECK_NAVIGATION_EVENT));
      return;
    }
    const expectedHash = `#${DECK_SLIDES[currentIndex].id}`;
    if (window.location.hash !== expectedHash) {
      window.history.replaceState(null, "", expectedHash);
    }
    window.scrollTo(0, 0);
    window.requestAnimationFrame(() => {
      document.getElementById(`${DECK_SLIDES[currentIndex].id}-heading`)?.focus({
        preventScroll: true,
      });
    });
  }, [currentIndex]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isNativeControl(event.target)) return;
      const nextIndex = deckIndexForKey(event.key, event.shiftKey, currentIndex);
      if (nextIndex === null) return;
      event.preventDefault();
      goTo(nextIndex);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentIndex, goTo]);

  return (
    <main className={styles.deckRoot} data-deck-slide-count={DECK_SLIDE_COUNT}>
      <div className={styles.stage}>
        <ol className={styles.slideList} aria-label="Ratiflow WebMCP product demo">
          <li>
            <Slide
              index={0}
              currentIndex={currentIndex}
              compositionClass={styles.coverSlide}
            >
              <div className={styles.coverCopy}>
                <p className={styles.coverClaim}>{DECK_SLIDES[0].subtitle}</p>
                <div className={styles.truthRow}>
                  <TruthLabel tone="green">APPLICATION-OWNED LUNA WEBMCP RELAY</TruthLabel>
                  <TruthLabel tone="violet">SYNTHETIC DEMO CODE</TruthLabel>
                </div>
              </div>
              <div className={`${styles.previewFrame} ${styles.coverPreview}`} role="img" aria-label="Ratiflow Postmortem interface with a scoped Code revision and application Flight Recorder.">
                <PreviewLabel />
                <div className={styles.miniChrome}><span /><span /><span /><b>INC-482 · Checkout outage postmortem</b></div>
                <div className={styles.coverProduct}>
                  <article className={styles.paperPreview}>
                    <span className={styles.paperKicker}>ROOT CAUSE · REVISION 6</span>
                    <h3>Provider throttling triggered it.<br />Retry code sustained it.</h3>
                    <p>Ignored <code>Retry-After</code> · five zero-delay retries · queue 420 → 18,240</p>
                    <div className={styles.evidenceLine}><EvidenceDot tone="code" /> commit:7d3c9e1 <span /> checkout.log</div>
                  </article>
                  <aside className={styles.recorderPreview}>
                    <span>FLIGHT RECORDER</span>
                    {[
                      "CATALOG_REGISTERED",
                      "TOOL_SEARCH",
                      "GET_TOOLS",
                      "EXECUTE_TOOL",
                      "REVISION_COMMITTED",
                    ].map((event) => <code key={event}>{event}</code>)}
                  </aside>
                </div>
              </div>
            </Slide>
          </li>

          <li>
            <Slide index={1} currentIndex={currentIndex} compositionClass={styles.scatterSlide}>
              <p className={styles.lede}>{DECK_SLIDES[1].subtitle}</p>
              <div className={styles.scatterComposition}>
                <div className={`${styles.previewFrame} ${styles.cleanDocument}`} role="img" aria-label="Conceptual clean postmortem document without its detached agent context.">
                  <PreviewLabel>BEFORE · DETACHED AGENT CONTEXT</PreviewLabel>
                  <span className={styles.documentType}>POSTMORTEM · INC-482</span>
                  <h3>Checkout outage</h3>
                  <p className={styles.docRule} />
                  <p className={styles.docRuleShort} />
                  <h4>Root cause</h4>
                  <p>Provider throttling triggered the incident. Retry middleware sustained the failure.</p>
                  <p className={styles.docRule} />
                </div>
                <div className={styles.scatteredWords} aria-label="Agent context detached from the document">
                  <span className={styles.fragmentPrompt}>decision</span>
                  <span className={styles.fragmentSource}>source</span>
                  <span className={styles.fragmentScope}>context</span>
                  <span className={styles.fragmentAuthor}>author</span>
                  <i aria-hidden="true" />
                </div>
              </div>
            </Slide>
          </li>

          <li>
            <Slide index={2} currentIndex={currentIndex} compositionClass={styles.sequenceSlide}>
              <p className={styles.lede}>{DECK_SLIDES[2].subtitle}</p>
              <div className={styles.sequence} aria-label="Shared document context flows through company-scoped tools into a reversible revision with provenance">
                <div className={styles.sequenceStep}>
                  <PreviewLabel>SHARED HISTORY</PreviewLabel>
                  <span className={styles.stepIndex}>01</span>
                  <div className={styles.selectionExcerpt}>Retry middleware introduced in <mark>commit 7d3c9e1</mark>…</div>
                  <div className={styles.commentBubble}><b>@Code</b> Check this section against the synthetic repository.</div>
                  <strong>CONTEXT</strong>
                </div>
                <div className={styles.sequenceConnector} aria-hidden="true"><i /></div>
                <div className={styles.sequenceStep}>
                  <PreviewLabel>COMPANY-SCOPED TOOLS</PreviewLabel>
                  <span className={styles.stepIndex}>02</span>
                  <div className={styles.toolDiscovery}>
                    <small>@Code → Repository</small>
                    <code>search_demo_code</code>
                    <code>read_demo_file</code>
                  </div>
                  <strong>TOOLS</strong>
                </div>
                <div className={styles.sequenceConnector} aria-hidden="true"><i /></div>
                <div className={styles.sequenceStep}>
                  <PreviewLabel>REVERSIBLE REVISION</PreviewLabel>
                  <span className={styles.stepIndex}>03</span>
                  <div className={styles.compactDiff}><del>Provider throttling triggered the incident…</del><ins>Provider throttling triggered; retry code sustained the failure.</ins></div>
                  <strong>PROVENANCE</strong>
                </div>
              </div>
              <div className={styles.truthRowCenter}>
                <TruthLabel tone="green">SAME HISTORY + PROVENANCE</TruthLabel>
                <TruthLabel tone="violet">AGENT-SPECIFIC TOOLS · COMPANY POLICY</TruthLabel>
              </div>
            </Slide>
          </li>

          <li>
            <Slide index={3} currentIndex={currentIndex} compositionClass={styles.onboardingSlide}>
              <p className={styles.lede}>{DECK_SLIDES[3].subtitle}</p>
              <div className={`${styles.previewFrame} ${styles.assignmentPreview}`} role="img" aria-label="Postmortem passage selected in blue with a Code instruction and Assign and run action, without a permission chooser.">
                <article className={styles.assignmentDocument}>
                  <PreviewLabel>EXACT PASSAGE IN THE DEMO DOCUMENT</PreviewLabel>
                  <span>POSTMORTEM · INC-482</span>
                  <h3>Root cause</h3>
                  <p>Provider 429 throttling at 09:43 UTC was the external trigger. <mark>Retry middleware introduced in commit <code>7d3c9e1</code> ignored <code>Retry-After</code> and made up to five zero-delay retries.</mark></p>
                  <small>Live selection · neutral blue · exact range</small>
                </article>
                <aside className={styles.assignmentComment}>
                  <div className={styles.agentIdentity}><EvidenceDot tone="code" /><span><b>@Code</b><small>Company-managed bot</small></span></div>
                  <p>Verify the trigger and retry amplifier, then replace only this selection.</p>
                  <div className={styles.policyNote}><span>Automatic company policy</span><b>@Code → Repository tools</b></div>
                  <div className={styles.scopeLine}><span>EXACT RANGE</span><code>Root cause</code></div>
                  <span className={styles.assignAction}>Assign &amp; run</span>
                </aside>
              </div>
              <div className={styles.truthRowCenter}><TruthLabel tone="green">SELECT → @ BOT → ASSIGN &amp; RUN · NO PERMISSION CHOOSER</TruthLabel></div>
            </Slide>
          </li>

          <li>
            <Slide index={4} currentIndex={currentIndex} compositionClass={styles.capabilitySlide}>
              <p className={styles.lede}>{DECK_SLIDES[4].subtitle}</p>
              <div className={styles.capabilityComposition}>
                <div className={styles.capabilitySeparation} aria-label="The selected managed bot and its fixed company policy produce a server-issued immutable run grant">
                  <article className={styles.identityCard}>
                    <span>SHARED INPUT</span>
                    <b><EvidenceDot tone="code" /> @Code</b>
                    <p>Full document history + provenance</p>
                    <small>The same decision trail is available to every agent</small>
                  </article>
                  <div className={styles.capabilityArrow} aria-hidden="true">+</div>
                  <article className={styles.accessCard}>
                    <span>FIXED COMPANY POLICY</span>
                    <b>Repository access</b>
                    <p>Code → Repository</p>
                    <small>Hard-coded for this demo · organization-configured in practice</small>
                  </article>
                  <div className={styles.capabilityArrow} aria-hidden="true">→</div>
                  <article className={styles.grantCard}>
                    <span>IMMUTABLE RUN GRANT</span>
                    <b>7 tab-bound tools</b>
                    <code>search_demo_code</code>
                    <code>read_demo_file</code>
                  </article>
                </div>
                <div className={styles.policyMap} aria-label="Fixed company access policy for the three managed bots">
                  <div><span>@Data</span><code>Metrics · 6 tools</code></div>
                  <div><span>@Code</span><code>Repository · 7 tools</code></div>
                  <div><span>@General</span><code>Editorial · 7 tools</code></div>
                </div>
              </div>
              <div className={styles.truthRowCenter}>
                <TruthLabel tone="green">DOCUMENT HISTORY · SHARED</TruthLabel>
                <TruthLabel tone="green">COMPANY ACCESS · FIXED BY MANAGED BOT</TruthLabel>
                <TruthLabel tone="violet">RUN GRANT · IMMUTABLE</TruthLabel>
                <TruthLabel tone="neutral">WEBMCP · EXPOSES / INVOKES TOOLS</TruthLabel>
                <TruthLabel tone="neutral">RATIFLOW SERVER · ENFORCES ACCESS</TruthLabel>
                <TruthLabel tone="neutral">PRODUCT FLOW VISUAL</TruthLabel>
              </div>
            </Slide>
          </li>

          <li>
            <Slide index={5} currentIndex={currentIndex} compositionClass={styles.diffSlide}>
              <p className={styles.lede}>{DECK_SLIDES[5].subtitle}</p>
              <div className={`${styles.previewFrame} ${styles.diffPreview}`} role="img" aria-label="Code revision diff with exact synthetic findings and evidence references from the Postmortem demo path.">
                <PreviewLabel>SCOPED REVISION · SYNTHETIC SOURCES</PreviewLabel>
                <div className={styles.diffMeta}><span>ROOT CAUSE</span><b>r6 · Code</b><span>Restore</span></div>
                <del>Provider 429 throttling at 09:43 UTC was the external trigger. It would not, by itself, explain the sustained 38-minute checkout failure…</del>
                <ins>Provider HTTP 429 throttling was the external trigger. Commit <code>7d3c9e1</code> ignored <code>Retry-After</code> and made up to five zero-delay retries, driving traffic to 5.8× baseline and queue depth from 420 to 18,240. The retry regression sustained the failure.</ins>
                <div className={styles.evidenceRefs}><span><EvidenceDot tone="code" /> commit:7d3c9e1</span><span><EvidenceDot tone="code" /> checkout.log</span></div>
              </div>
              <div className={styles.truthRowCenter}>
                <TruthLabel tone="violet">SYNTHETIC DEMO CODE</TruthLabel>
                <TruthLabel tone="green">NEW AGENT REPLACEMENT · GREEN FOR 30 SECONDS</TruthLabel>
                <TruthLabel tone="neutral">EXACT-RANGE REVISION · RESTORABLE</TruthLabel>
              </div>
            </Slide>
          </li>

          <li>
            <Slide index={6} currentIndex={currentIndex} compositionClass={styles.historySlide}>
              <p className={styles.lede}>{DECK_SLIDES[6].subtitle}</p>
              <div className={styles.historyComposition}>
                <ol className={styles.revisionSpine} aria-label="Revision authorship sequence">
                  <li><EvidenceDot tone="code" /><span><b>r4 · Builder</b><small>Initial root-cause analysis · synthetic evidence</small></span></li>
                  <li><EvidenceDot tone="code" /><span><b>r5 · Builder</b><small>Clarified after human discussion</small></span></li>
                  <li><EvidenceDot tone="code" /><span><b>r6 · Code</b><small>Verified retry behavior · exact-range revision</small></span></li>
                </ol>
                <div className={`${styles.previewFrame} ${styles.historyDetail}`} role="img" aria-label="Revision detail with asker, agent, runtime, evidence, revision lineage, and Restore action.">
                  <PreviewLabel>IMMUTABLE REVISION DETAIL</PreviewLabel>
                  <span>REVISION DETAIL · r6</span>
                  <h3>Code verified Root cause</h3>
                  <dl>
                    <div><dt>Asked by</dt><dd>Ada</dd></div>
                    <div><dt>Agent</dt><dd>@Code</dd></div>
                    <div><dt>Runtime</dt><dd>gpt-5.6-luna · WebMCP Relay</dd></div>
                    <div><dt>Evidence</dt><dd>commit:7d3c9e1 · checkout.log</dd></div>
                  </dl>
                  <div className={styles.restoreLine}><b>Before / after preserved</b><span>Restore r5</span></div>
                </div>
              </div>
              <div className={styles.truthRowCenter}><TruthLabel tone="green">ASKER · AGENT · EVIDENCE · RESTORE</TruthLabel></div>
            </Slide>
          </li>

          <li>
            <Slide index={7} currentIndex={currentIndex} compositionClass={styles.ablationSlide}>
              <p className={styles.lede}>{DECK_SLIDES[7].subtitle}</p>
              <div className={styles.ablationCompare}>
                <div className={styles.ablationOn}>
                  <PreviewLabel>WEBMCP ON CONTRACT</PreviewLabel>
                  <span className={styles.ablationHeading}>WEBMCP ON</span>
                  <div className={styles.ablationDocument}><i /><i /><i /><mark>@Code</mark></div>
                  <p><b>Document</b> editable</p>
                  <p><b>Comments</b> available</p>
                  <p><b>Managed relay</b> discovers assignment tools</p>
                  <TruthLabel tone="green">TAB-BOUND SITE TOOLS</TruthLabel>
                </div>
                <div className={styles.ablationDivider} aria-hidden="true">A/B</div>
                <div className={styles.ablationOff}>
                  <PreviewLabel>WEBMCP OFF CONTRACT</PreviewLabel>
                  <span className={styles.ablationHeading}>WEBMCP OFF</span>
                  <div className={styles.ablationDocument}><i /><i /><i /><mark>@Code</mark></div>
                  <p><b>Document</b> editable</p>
                  <p><b>Comments</b> available</p>
                  <p><b>Managed relay</b> unavailable by design</p>
                  <TruthLabel tone="neutral">WEBMCP OFF · HUMAN MODE</TruthLabel>
                </div>
              </div>
              <SourceLinks />
            </Slide>
          </li>

          <li>
            <Slide index={8} currentIndex={currentIndex} compositionClass={styles.architectureSlide}>
              <p className={styles.lede}>{DECK_SLIDES[8].subtitle}</p>
              <div className={styles.architectureFlow} role="img" aria-label="Application-owned relay flow: managed bot mention, server-resolved company capability grant, WebMCP site tools, an agent API, executeTool, server-checked revision, then assignment catalog withdrawal and idle restoration.">
                {["@managed bot", "company policy + grant", "WebMCP site tools", "agent API", "executeTool", "revision + cleanup"].map((node, index) => (
                  <div className={styles.architectureNode} key={node}>
                    <span>{String(index + 1).padStart(2, "0")}</span><b>{node}</b>
                  </div>
                ))}
              </div>
              <ol className={styles.architectureTrace} aria-label="Required observed event sequence">
                <li>tool_search_call</li><li>getTools()</li><li>tool_search_output</li><li>function call</li><li>executeTool()</li><li>revision → catalog withdrawn → idle</li>
              </ol>
              <div className={styles.truthRowCenter}>
                <TruthLabel tone="violet">APPLICATION-OWNED IN-PAGE RELAY · MODEL VIA API</TruthLabel>
                <TruthLabel tone="green">AGENT MODEL · RUNNING VIA API</TruthLabel>
                <TruthLabel tone="neutral">NATIVE PROOF IS DATED, OBSERVATIONAL EVIDENCE</TruthLabel>
                <TruthLabel tone="neutral">RUN END · IDLE CATALOG RESTORED</TruthLabel>
                <TruthLabel tone="neutral">PRODUCT FLOW VISUAL</TruthLabel>
              </div>
              <SourceLinks />
            </Slide>
          </li>

          <li>
            <Slide index={9} currentIndex={currentIndex} compositionClass={styles.futureSlide}>
              <p className={styles.lede}>{DECK_SLIDES[9].subtitle}</p>
              <div className={styles.futureScale} aria-label="Two proposed WebMCP features for keeping agent context current and approved work durable">
                <article className={styles.futureReactive}>
                  <span>10× ASK · 01</span>
                  <b>Tell agents when relevant information changes.</b>
                  <p><strong>Use case</strong> An agent can refresh the affected facts instead of starting over or continuing with stale context.</p>
                  <small><strong>Engineering</strong> Typed resources plus change notifications let agents re-read only invalidated state.</small>
                </article>
                <article className={styles.futureDurable}>
                  <span>10× ASK · 02</span>
                  <b>Let approved tasks finish after the page closes.</b>
                  <p><strong>Use case</strong> A long-running task can survive navigation and still return a clear, reviewable result.</p>
                  <small><strong>Engineering</strong> Worker-backed sessions carry delegated identity and scope, with idempotent receipts.</small>
                </article>
              </div>
              <div className={styles.truthRowCenter}><TruthLabel tone="amber">PROPOSED SPEC DIRECTION · NOT CURRENT WEBMCP</TruthLabel></div>
              <FutureSourceLinks />
            </Slide>
          </li>

          <li>
            <Slide index={10} currentIndex={currentIndex} compositionClass={styles.finalSlide}>
              <p className={styles.lede}>{DECK_SLIDES[10].subtitle}</p>
              <div className={styles.finalComposition}>
                <Link className={styles.finalAction} href="/">Open the live Ratiflow app →</Link>
              </div>
            </Slide>
          </li>
        </ol>
      </div>

      <nav className={styles.deckControls} aria-label="Presentation controls">
        <button
          type="button"
          aria-label="Previous slide"
          disabled={currentIndex === 0}
          onClick={() => goTo(currentIndex - 1)}
        >
          <span aria-hidden="true">←</span>
        </button>
        <div className={styles.progress} aria-hidden="true">
          <i style={{ "--progress": `${((currentIndex + 1) / DECK_SLIDE_COUNT) * 100}%` } as CSSProperties} />
        </div>
        <span className={styles.slideCounter} aria-label={`Slide ${currentIndex + 1} of ${DECK_SLIDE_COUNT}`}>
          {String(currentIndex + 1).padStart(2, "0")} <i>/</i> {DECK_SLIDE_COUNT}
        </span>
        <button
          type="button"
          aria-label="Next slide"
          disabled={currentIndex === DECK_SLIDE_COUNT - 1}
          onClick={() => goTo(currentIndex + 1)}
        >
          <span aria-hidden="true">→</span>
        </button>
      </nav>
      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
        Slide {currentIndex + 1} of {DECK_SLIDE_COUNT}: {DECK_SLIDES[currentIndex].title}
      </p>
    </main>
  );
}
