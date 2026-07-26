// spec: global-invariants/centaur-state-boundary
// Convex Component: centaur-state
// Owns Centaur subsystem tables: snake_config, snake_drives, heuristic_config,
// snake_heuristic_overrides, bot_params, centaur_action_log.
// This is a typed skeleton — implementation deferred.

// ---------------------------------------------------------------------------
// Table record types
// spec: operator-control/exclusive-selection (snake_config),
//       bot-configuration/per-snake-portfolio-record (snake_drives),
//       bot-configuration/team-heuristic-defaults (heuristic_config),
//       bot-configuration/team-bot-parameters (bot_params),
//       replay-and-audit/team-action-log (centaur_action_log)
// ---------------------------------------------------------------------------

export interface SnakeConfigRecord {
  readonly _id: string;
  readonly gameId: string;
  readonly teamId: string;
  readonly snakeId: string;
  readonly currentSelectorUserId: string | null;
  readonly manualMode: boolean;
}

export interface DriveRecord {
  readonly _id: string;
  readonly gameId: string;
  readonly teamId: string;
  readonly snakeId: string;
  readonly driveType: string;
  readonly targetId: string;
  readonly weight: number;
  readonly addedAt: number;
}

export interface HeuristicConfigRecord {
  readonly _id: string;
  readonly teamId: string;
  readonly snakeId: string | null;
  readonly heuristicType: string;
  readonly defaultWeight: number;
}

export interface SnakeHeuristicOverrideRecord {
  readonly _id: string;
  readonly gameId: string;
  readonly teamId: string;
  readonly snakeId: string;
  readonly heuristicType: string;
  readonly weight: number;
}

export interface BotParamsRecord {
  readonly _id: string;
  readonly gameId: string;
  readonly teamId: string;
  readonly snakeId: string;
  readonly temperature: number;
}

// ---------------------------------------------------------------------------
// Centaur action log — discriminated union
// spec: replay-and-audit/team-action-log
// ---------------------------------------------------------------------------

export type CentaurActionType =
  | "SelectSnake"
  | "DeselectSnake"
  | "ToggleManualMode"
  | "StageMove"
  | "AddDrive"
  | "RemoveDrive"
  | "UpdateDriveWeight"
  | "UpdateBotParam"
  | "TempoChange"
  | "CaptainTurnSubmit"
  | "CaptainBoot"
  | "StateMapSnapshot";

export interface CentaurActionRecord {
  readonly _id: string;
  readonly gameId: string;
  readonly teamId: string;
  readonly actionType: CentaurActionType;
  readonly actorUserId: string;
  readonly snakeId: string | null;
  readonly payload: unknown;
  readonly wallClockTs: number;
  readonly turn: number;
}

// ---------------------------------------------------------------------------
// Selection invariant types
// spec: operator-control/exclusive-selection
// ---------------------------------------------------------------------------

export interface SelectionState {
  readonly snakeId: string;
  readonly selectorUserId: string;
}

// ---------------------------------------------------------------------------
// Convex Component config — placeholder
// ---------------------------------------------------------------------------

export const componentConfig = {
  name: "centaur-state",
} as const;
