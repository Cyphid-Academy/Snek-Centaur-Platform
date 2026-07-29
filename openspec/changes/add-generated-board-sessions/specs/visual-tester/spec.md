## MODIFIED Purpose

The dedicated visual testing application for the game rules: board-state
editing, manual move staging, engine-driven turn simulation with in-memory
session history, and management and replay of saved Test Sequences with
discrepancy annotation. A development tool for humans vetting resolver
behaviour — never part of the player- or operator-facing platform.

Depends on: game-engine, test-sequences. Consumed by: (none — leaf
capability).

## MODIFIED Requirements

### Requirement: visual-tester/team-configuration
The tool SHALL let the tester configure teams, each with a name and a colour; snakes are rendered in their team's colour. Adding a team SHALL auto-assign the next colour in a fixed sequence together with a matching default name, and both the name and the colour (via a colour picker) SHALL remain editable. The Add Snake tool assigns new snakes to a chosen configured team. Teams present in a loaded or generated state that lack a configuration SHALL receive a default name and the next colour, without disturbing already-configured teams.

#### Scenario: #add-team-auto-colour
- **WHEN** the tester adds a team
- **THEN** it takes the next colour in the sequence and a matching default name, both then editable

#### Scenario: #team-colour-drives-board
- **WHEN** a team's colour is changed
- **THEN** every snake on that team is redrawn in the new colour
