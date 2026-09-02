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
  dark?: boolean;
  compositionClass?: string;
};

function Slide({
  index,
  currentIndex,
  children,
  dark = false,
  compositionClass = "",
}: SlideProps) {
  const slide = DECK_SLIDES[index];
  const headingId = `${slide.id}-heading`;
  const positionId = `${slide.id}-position`;
  const headingClass = index === 0 ? styles.coverTitle : styles.slideTitle;

  return (
    <section
      id={slide.id}
      className={`${styles.slide} ${dark ? styles.darkSlide : ""} ${compositionClass}`}
      aria-labelledby={headingId}
      aria-describedby={positionId}
      aria-roledescription="slide"
      hidden={currentIndex !== index}
      role="region"
    >
      <span id={positionId} className={styles.srOnly}>Slide {index + 1} of {DECK_SLIDE_COUNT}</span>
      <div className={styles.slideHeader}>
        <span className={styles.wordmark}><i aria-hidden="true" /> Ratiflow</span>
        <span className={styles.criterion}>{slide.criterion}</span>
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
        <span>WEBMCP CHALLENGE</span>
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

function SyntheticCapacityChart() {
  return (
    <figure className={styles.capacityFigure}>
      <figcaption>Synthetic October 15 capacity</figcaption>
      <div
        className={styles.capacityChart}
        role="img"
        aria-label="Reliability-only requires 10 days, invite-only beta requires 14 days, and full export requires 18 days against 14 available days."
      >
        <div className={styles.capacityMarker}><span>14 available</span></div>
        <div className={styles.capacityBarRow}>
          <span>Reliability</span><i style={{ "--bar": "56%" } as CSSProperties} /><b>10</b>
        </div>
        <div className={`${styles.capacityBarRow} ${styles.capacityFit}`}>
          <span>Invite-only beta</span><i style={{ "--bar": "78%" } as CSSProperties} /><b>14</b>
        </div>
        <div className={`${styles.capacityBarRow} ${styles.capacityOver}`}>
          <span>Full export now</span><i style={{ "--bar": "100%" } as CSSProperties} /><b>18</b>
        </div>
      </div>
      <table className={styles.srOnly}>
        <caption>Engineering days required before October 15</caption>
        <thead><tr><th>Option</th><th>Required days</th><th>Available days</th></tr></thead>
        <tbody>
          <tr><td>Reliability only</td><td>10</td><td>14</td></tr>
          <tr><td>Invite-only beta</td><td>14</td><td>14</td></tr>
          <tr><td>Full export now</td><td>18</td><td>14</td></tr>
        </tbody>
      </table>
    </figure>
  );
}

function SourceLinks({ dark = false }: { dark?: boolean }) {
  return (
    <p className={`${styles.sourceLinks} ${dark ? styles.sourceLinksDark : ""}`}>
      Sources: <a href="https://learn.chatgpt.com/docs/webmcp" target="_blank" rel="noreferrer noopener">OpenAI Site Tools</a>
      <span aria-hidden="true"> · </span>
      <a href="https://webmachinelearning.github.io/webmcp/" target="_blank" rel="noreferrer noopener">WebMCP draft</a>
      <span aria-hidden="true"> · </span>
      <a href="https://developers.openai.com/api/docs/guides/tools-tool-search" target="_blank" rel="noreferrer noopener">OpenAI tool search</a>
      <span aria-hidden="true"> · </span>
      <a href="https://developers.openai.com/api/docs/models/gpt-5.6-luna" target="_blank" rel="noreferrer noopener">GPT-5.6 Luna</a>
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
        <ol className={styles.slideList} aria-label="Ratiflow WebMCP Challenge presentation">
          <li>
            <Slide
              index={0}
              currentIndex={currentIndex}
              compositionClass={styles.coverSlide}
            >
              <div className={styles.coverCopy}>
                <p className={styles.coverClaim}>The document is the agent runtime.</p>
                <p className={styles.coverLine}>Mention the expert. The page supplies the tools. The document keeps the proof.</p>
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
              <p className={styles.lede}>Prompts, sources, scope, and authorship scatter across chats and tabs. The next teammate inherits the answer—not the evidence.</p>
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
                  <span className={styles.fragmentPrompt}>prompt</span>
                  <span className={styles.fragmentSource}>source</span>
                  <span className={styles.fragmentScope}>scope</span>
                  <span className={styles.fragmentAuthor}>author</span>
                  <i aria-hidden="true" />
                </div>
              </div>
            </Slide>
          </li>

          <li>
            <Slide index={2} currentIndex={currentIndex} compositionClass={styles.sequenceSlide}>
              <p className={styles.lede}>Mention the expert → assemble the tools → commit a scoped revision.</p>
              <div className={styles.sequence} aria-label="Conceptual three-step transaction sequence">
                <div className={styles.sequenceStep}>
                  <PreviewLabel>SCOPED COMMENT</PreviewLabel>
                  <span className={styles.stepIndex}>01</span>
                  <div className={styles.selectionExcerpt}>Retry middleware introduced in <mark>commit 7d3c9e1</mark>…</div>
                  <div className={styles.commentBubble}><b>@Code</b> Check this section against the synthetic repository.</div>
                  <strong>MENTION</strong>
                </div>
                <div className={styles.sequenceConnector} aria-hidden="true"><i /></div>
                <div className={styles.sequenceStep}>
                  <PreviewLabel>ROLE TOOL SURFACE</PreviewLabel>
                  <span className={styles.stepIndex}>02</span>
                  <div className={styles.toolDiscovery}>
                    <code>search_demo_code</code>
                    <code>read_demo_file</code>
                    <small>role-scoped catalog</small>
                  </div>
                  <strong>DISCOVER</strong>
                </div>
                <div className={styles.sequenceConnector} aria-hidden="true"><i /></div>
                <div className={styles.sequenceStep}>
                  <PreviewLabel>REVERSIBLE REVISION</PreviewLabel>
                  <span className={styles.stepIndex}>03</span>
                  <div className={styles.compactDiff}><del>Provider 429 throttling at 09:43 UTC was the external trigger…</del><ins>Provider throttling triggered; retry code sustained…</ins></div>
                  <strong>REVISION</strong>
                </div>
              </div>
              <div className={styles.truthRowCenter}>
                <TruthLabel tone="green">APPLICATION-OWNED LUNA WEBMCP RELAY</TruthLabel>
                <TruthLabel tone="violet">SYNTHETIC DEMO CODE</TruthLabel>
              </div>
            </Slide>
          </li>

          <li>
            <Slide index={3} currentIndex={currentIndex} compositionClass={styles.onboardingSlide}>
              <p className={styles.lede}>Choose a nickname. Open Postmortem. Load the guided <code>@Code</code> assignment.</p>
              <div className={styles.onboardingFlow} aria-label="Three-step first-run experience preview">
                <div className={styles.onboardingStep}>
                  <span className={styles.giantNumber}>1</span>
                  <PreviewLabel>NICKNAME</PreviewLabel>
                  <label>What should collaborators call you?</label>
                  <div className={styles.fakeInput}>Ada</div>
                </div>
                <div className={styles.onboardingStep}>
                  <span className={styles.giantNumber}>2</span>
                  <PreviewLabel>DOCUMENT PICKER</PreviewLabel>
                  <div className={styles.templateChoice}><b>Postmortem</b><span>Incident learning · revision history</span></div>
                  <div className={styles.templateChoiceQuiet}><b>Product doc</b><span>Decision · capacity · scope</span></div>
                </div>
                <div className={styles.onboardingStep}>
                  <span className={styles.giantNumber}>3</span>
                  <PreviewLabel>IN-PRODUCT COACH</PreviewLabel>
                  <div className={styles.coachmark}>One click selects the exact section and loads the full <b>@Code</b> prompt.</div>
                  <div className={styles.directoryList}><span>AGENTS</span><b><EvidenceDot tone="code" /> @Code</b><b><EvidenceDot tone="data" /> @Data</b><b><EvidenceDot tone="general" /> @General</b></div>
                </div>
              </div>
            </Slide>
          </li>

          <li>
            <Slide index={4} currentIndex={currentIndex} compositionClass={styles.assignmentSlide}>
              <p className={styles.lede}>Select Root cause and ask <code>@Code</code> to check the retry behavior against the synthetic repository and checkout log.</p>
              <div className={`${styles.previewFrame} ${styles.assignmentPreview}`} role="img" aria-label="Product-flow visual of the exact Code assignment on the selected Root cause passage in the guided demo flow.">
                <PreviewLabel>GUIDED DEMO PATH · POSTMORTEM</PreviewLabel>
                <article className={styles.assignmentDocument}>
                  <span>INC-482 · POSTMORTEM</span>
                  <h3>Root cause</h3>
                  <p>Provider 429 throttling at 09:43 UTC was the external trigger. Retry middleware introduced in <mark>commit 7d3c9e1</mark> ignored <mark>Retry-After</mark> and made up to five zero-delay retries…</p>
                  <small>Selected range · Root cause only</small>
                </article>
                <aside className={styles.assignmentComment}>
                  <div className={styles.agentIdentity}><EvidenceDot tone="code" /><span><b>@Code</b><small>Team · Coding expert</small></span></div>
                  <p>@Code Check this root-cause section against the synthetic repository and checkout log. Separate the external trigger from the internal amplifier, quantify the retry behavior and queue growth, then replace only this section.</p>
                  <div className={styles.scopeLine}><span>BODY</span><b>Exact selection</b><code>r5</code></div>
                </aside>
              </div>
              <div className={styles.truthRowCenter}><TruthLabel tone="violet">SYNTHETIC DEMO CODE</TruthLabel></div>
            </Slide>
          </li>

          <li>
            <Slide index={5} currentIndex={currentIndex} dark compositionClass={styles.catalogSlide}>
              <p className={styles.lede}><code>toolchange → tool_search_call → getTools() → tool_search_output → Luna function call → executeTool()</code></p>
              <div className={styles.catalogCompare} aria-label="Contract preview of Code and General WebMCP catalog differences">
                <div className={styles.catalogPane}>
                  <PreviewLabel>CODE CATALOG · 7 TOOLS</PreviewLabel>
                  <span className={styles.catalogRole}><EvidenceDot tone="code" /> CODE</span>
                  <div className={styles.commonTools}>5 common document tools</div>
                  <code className={styles.specialTool}>+ search_demo_code</code>
                  <code className={styles.specialTool}>+ read_demo_file</code>
                </div>
                <div className={styles.toolchange} aria-label="toolchange transition"><span>toolchange</span><i aria-hidden="true">→</i></div>
                <div className={styles.catalogPane}>
                  <PreviewLabel>GENERAL CATALOG · 7 TOOLS</PreviewLabel>
                  <span className={styles.catalogRole}><EvidenceDot tone="general" /> GENERAL</span>
                  <div className={styles.commonTools}>5 common document tools</div>
                  <code className={styles.specialTool}>+ read_company_style_guide</code>
                  <code className={styles.specialTool}>+ check_document_consistency</code>
                </div>
              </div>
              <div className={styles.traceStrip}>
                <span>gpt-5.6-luna</span><span>origin · WEBMCP</span><span>generation · changes per run</span><span>old descriptor · rejected</span>
              </div>
              <div className={styles.truthRowCenter}>
                <TruthLabel tone="green">APPLICATION-OWNED LUNA WEBMCP RELAY</TruthLabel>
                <TruthLabel tone="neutral">STANDARD PATH · document.modelContext</TruthLabel>
              </div>
              <SourceLinks dark />
            </Slide>
          </li>

          <li>
            <Slide index={6} currentIndex={currentIndex} compositionClass={styles.diffSlide}>
              <p className={styles.lede}>Provider throttling triggered the incident. Retry code sustained it.</p>
              <div className={`${styles.previewFrame} ${styles.diffPreview}`} role="img" aria-label="Code revision diff with exact synthetic findings and evidence references from the Postmortem demo path.">
                <PreviewLabel>SCOPED REVISION · SYNTHETIC SOURCES</PreviewLabel>
                <div className={styles.diffMeta}><span>ROOT CAUSE</span><b>r6 · Code</b><span>Restore</span></div>
                <del>Provider 429 throttling at 09:43 UTC was the external trigger. It would not, by itself, explain the sustained 38-minute checkout failure…</del>
                <ins>Provider HTTP 429 throttling was the external trigger. Commit <code>7d3c9e1</code> ignored <code>Retry-After</code> and made up to five zero-delay retries, driving traffic to 5.8× baseline and queue depth from 420 to 18,240. The retry regression sustained the failure.</ins>
                <div className={styles.evidenceRefs}><span><EvidenceDot tone="code" /> commit:7d3c9e1</span><span><EvidenceDot tone="code" /> checkout.log</span></div>
              </div>
              <div className={styles.truthRowCenter}>
                <TruthLabel tone="violet">SYNTHETIC DEMO CODE</TruthLabel>
                <TruthLabel tone="green">EXACT-RANGE REVISION · RESTORABLE</TruthLabel>
              </div>
            </Slide>
          </li>

          <li>
            <Slide index={7} currentIndex={currentIndex} compositionClass={styles.historySlide}>
              <p className={styles.lede}>A new person—or agent—can reconstruct who asked, which tools ran, what changed, and why.</p>
              <div className={styles.historyComposition}>
                <ol className={styles.revisionSpine} aria-label="Revision authorship sequence">
                  <li><EvidenceDot tone="code" /><span><b>r5 · Builder</b><small>Seeded clarification · evidence preserved</small></span></li>
                  <li><EvidenceDot tone="code" /><span><b>r6 · Code</b><small>Verified retry behavior · exact-range revision</small></span></li>
                  <li><EvidenceDot tone="general" /><span><b>r7 · General</b><small>Reworded section · facts preserved</small></span></li>
                </ol>
                <div className={`${styles.previewFrame} ${styles.historyDetail}`} role="img" aria-label="Revision detail with prompt, source context, model, evidence, diff, and Restore action.">
                  <PreviewLabel>IMMUTABLE REVISION DETAIL</PreviewLabel>
                  <span>REVISION DETAIL · r7</span>
                  <h3>General reworded Root cause</h3>
                  <dl>
                    <div><dt>Asked by</dt><dd>Judge</dd></div>
                    <div><dt>Agent</dt><dd>@General</dd></div>
                    <div><dt>Runtime</dt><dd>gpt-5.6-luna · WebMCP Relay</dd></div>
                    <div><dt>Evidence</dt><dd>Style guide · consistency rules</dd></div>
                  </dl>
                  <div className={styles.restoreLine}><b>Before / after preserved</b><span>Restore r6</span></div>
                </div>
              </div>
              <div className={styles.truthRowCenter}><TruthLabel tone="green">PROMPT · SOURCES · DIFF · AUTHORSHIP</TruthLabel></div>
            </Slide>
          </li>

          <li>
            <Slide index={8} currentIndex={currentIndex} compositionClass={styles.ablationSlide}>
              <p className={styles.lede}>Human editing and comments remain. Dynamic discovery and managed execution fail closed.</p>
              <div className={styles.ablationCompare}>
                <div className={styles.ablationOn}>
                  <PreviewLabel>WEBMCP ON CONTRACT</PreviewLabel>
                  <span className={styles.ablationHeading}>WEBMCP ON</span>
                  <div className={styles.ablationDocument}><i /><i /><i /><mark>@Code</mark></div>
                  <p><b>Document</b> editable</p>
                  <p><b>Comments</b> available</p>
                  <p><b>Managed relay</b> discovers role tools</p>
                  <TruthLabel tone="green">DYNAMIC ROLE CATALOG</TruthLabel>
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
            <Slide index={9} currentIndex={currentIndex} compositionClass={styles.dataSlide}>
              <p className={styles.lede}><code>@Data</code> shows that 10 + 4 = 14 fits; 10 + 8 = 18 does not—then revises Success Measures.</p>
              <div className={styles.dataComposition}>
                <div className={`${styles.previewFrame} ${styles.successMeasures}`} role="img" aria-label="Design preview of revised Northstar Success Measures based on synthetic capacity data.">
                  <PreviewLabel>GUIDED DEMO PATH · PRODUCT DOC</PreviewLabel>
                  <span>NORTHSTAR · SUCCESS MEASURES</span>
                  <h3>Stage access. Protect reliability.</h3>
                  <p><b>October 15</b> · invite-only design-partner beta</p>
                  <p><b>November 1</b> · full GA</p>
                  <p><b>$180,000</b> · renewal depends on production-ready CSV</p>
                  <div className={styles.dataComment}><EvidenceDot tone="data" /><span><b>@Data</b> 14 days fit reliability plus the beta slice—exactly.</span></div>
                </div>
                <SyntheticCapacityChart />
              </div>
              <div className={styles.truthRowCenter}>
                <TruthLabel tone="violet">SYNTHETIC DEMO DATA</TruthLabel>
                <TruthLabel tone="green">r6 → r7 · EXACT-RANGE REVISION</TruthLabel>
              </div>
            </Slide>
          </li>

          <li>
            <Slide index={10} currentIndex={currentIndex} dark compositionClass={styles.architectureSlide}>
              <p className={styles.lede}>Ratiflow maps Luna’s client-executed tool search to <code>document.modelContext.getTools()</code> and <code>executeTool()</code>.</p>
              <div className={styles.architectureFlow} role="img" aria-label="Application-owned relay flow: mention, task and lease, WebMCP catalog, Luna Responses, executeTool, and revision ledger.">
                {["@mention", "task + lease", "WebMCP catalog", "Luna Responses", "executeTool", "revision ledger"].map((node, index) => (
                  <div className={styles.architectureNode} key={node}>
                    <span>{String(index + 1).padStart(2, "0")}</span><b>{node}</b>
                  </div>
                ))}
              </div>
              <ol className={styles.architectureTrace} aria-label="Required observed event sequence">
                <li>tool_search_call</li><li>getTools()</li><li>tool_search_output</li><li>function call</li><li>executeTool()</li><li>revision committed</li>
              </ol>
              <div className={styles.truthRowCenter}>
                <TruthLabel tone="violet">APPLICATION-OWNED IN-PAGE RELAY — NOT NATIVE LUNA SITE TOOLS</TruthLabel>
                <TruthLabel tone="green">LUNA TOOL SEARCH · LOCAL API OBSERVED</TruthLabel>
                <TruthLabel tone="neutral">NATIVE PROOF IS DATED, OBSERVATIONAL EVIDENCE</TruthLabel>
                <TruthLabel tone="neutral">PRODUCT FLOW VISUAL</TruthLabel>
              </div>
              <SourceLinks dark />
            </Slide>
          </li>

          <li>
            <Slide index={11} currentIndex={currentIndex} compositionClass={styles.finalSlide}>
              <div className={styles.finalComposition}>
                <div className={`${styles.previewFrame} ${styles.finalDocument} ${styles.finalPostmortem}`}><PreviewLabel>POSTMORTEM · TWO PAGES</PreviewLabel><span>INC-482</span><b>Root cause verified</b><small>Code · General · History</small></div>
                <div className={styles.finalAt} aria-hidden="true">@</div>
                <div className={`${styles.previewFrame} ${styles.finalDocument} ${styles.finalProduct}`}><PreviewLabel>PRODUCT DOC · TWO PAGES</PreviewLabel><span>NORTHSTAR</span><b>Launch scope measured</b><small>Data · Capacity · Revision</small></div>
                <div className={`${styles.finalCriterion} ${styles.finalCriterionOne}`}><b>WebMCP Leverage</b><span>the page changes the tools.</span></div>
                <div className={`${styles.finalCriterion} ${styles.finalCriterionTwo}`}><b>Execution</b><span>the result is scoped, bounded, and reversible.</span></div>
                <div className={`${styles.finalCriterion} ${styles.finalCriterionThree}`}><b>Potential Impact</b><span>people and agents share one decision trail.</span></div>
                <div className={`${styles.finalCriterion} ${styles.finalCriterionFour}`}><b>Creativity & Ambition</b><span>the document becomes the runtime.</span></div>
              </div>
              <Link className={styles.finalAction} href="/">Open the live demo picker →</Link>
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
