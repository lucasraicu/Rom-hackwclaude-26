"use client";

import { useEffect, useRef, useState } from "react";
import { researchImpactHtml } from "./researchImpactHtml";
import styles from "./ResearchImpact.module.css";

// Keep the handoff's global styles and document scripts inside their own document.
// The sandbox deliberately omits allow-same-origin; messages are checked by source.
const bridge = `<script>
document.querySelector('.demo-link').addEventListener('click', (event) => {
  event.preventDefault();
  parent.postMessage({ type: 'fundproof:open-workspace' }, '*');
});
const shell = document.querySelector('.shell');
const reportHeight = () => parent.postMessage({
  type: 'fundproof:research-height',
  height: Math.ceil(shell.getBoundingClientRect().height) + 24
}, '*');
new ResizeObserver(reportHeight).observe(shell);
reportHeight();
</script>`;

const documentHtml = researchImpactHtml
  .replace('href="http://localhost:3000"', 'href="#allocation-workspace"')
  .replace("Open live demo", "Open allocation workspace")
  .replace("</body>", `${bridge}</body>`);

export function ResearchImpact({ onOpenWorkspace }: { onOpenWorkspace: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1150);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow || !event.data) return;
      if (event.data.type === "fundproof:open-workspace") onOpenWorkspace();
      if (
        event.data.type === "fundproof:research-height" &&
        Number.isFinite(event.data.height)
      ) {
        setHeight(Math.max(600, Math.min(6000, event.data.height)));
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onOpenWorkspace]);

  return (
    <section className={styles.companion} aria-label="Research and modeled impact">
      <iframe
        ref={frame}
        title="FundPilot-AI research and illustrative savings calculator"
        srcDoc={documentHtml}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        allow="fullscreen *"
        allowFullScreen
        style={{ height }}
      />
    </section>
  );
}
