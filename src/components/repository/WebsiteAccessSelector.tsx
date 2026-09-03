import type { ManagedRelayAccessProfile } from "@/repository/contracts";

import { RELAY_ACCESS_PROFILE_OPTIONS } from "./relay-access-copy";
import styles from "./repository-workspace.module.css";

export interface WebsiteAccessSelectorProps {
  value: ManagedRelayAccessProfile;
  onChange: (value: ManagedRelayAccessProfile) => void;
}

export function WebsiteAccessSelector({ value, onChange }: WebsiteAccessSelectorProps) {
  return (
    <div className={styles.websiteAccessSelector} data-testid="website-access-selector">
      <label htmlFor="repository-managed-access-profile">Website access for this run</label>
      <select
        id="repository-managed-access-profile"
        value={value}
        onChange={(event) => onChange(event.target.value as ManagedRelayAccessProfile)}
      >
        {RELAY_ACCESS_PROFILE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label} — {option.description}
          </option>
        ))}
      </select>
      <small>This choice—not the bot’s expertise—sets the WebMCP catalog. Only the selected passage can be edited.</small>
    </div>
  );
}
