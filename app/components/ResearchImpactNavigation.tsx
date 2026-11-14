"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ResearchImpact } from "./ResearchImpact";
import styles from "./ResearchImpact.module.css";

export function ResearchImpactNavigation({ children }: { children: ReactNode }) {
  const [researchOpen, setResearchOpen] = useState(false);
  const workspaceButton = useRef<HTMLButtonElement>(null);
  const openWorkspace = useCallback(() => {
    setResearchOpen(false);
    workspaceButton.current?.focus();
  }, []);

  return (
    <>
      <nav className={styles.navigation} aria-label="FundPilot-AI views">
        <button
          ref={workspaceButton}
          type="button"
          aria-pressed={!researchOpen}
          aria-controls="allocation-workspace"
          onClick={openWorkspace}
        >
          Allocation workspace
        </button>
        <button
          type="button"
          aria-pressed={researchOpen}
          aria-controls="research-impact"
          onClick={() => setResearchOpen(true)}
        >
          Research &amp; impact
        </button>
      </nav>
      <div id="allocation-workspace" hidden={researchOpen}>
        {children}
      </div>
      <div id="research-impact" hidden={!researchOpen}>
        <ResearchImpact onOpenWorkspace={openWorkspace} />
      </div>
    </>
  );
}
