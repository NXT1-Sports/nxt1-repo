/**
 * @fileoverview Practice Script & Progression Skill
 * @module @nxt1/backend/modules/agent/skills/strategy
 *
 * Scaffolds multi-day teaching progressions for play installation, drill progressions,
 * and skill development. Takes a play concept, target install stage, and roster context
 * to generate a realistic 5–7 day progressive teaching sequence.
 *
 * Core insight: Coaches spend 2–3 hours manually sequencing practice progressions.
 * This skill automates that work while maintaining sport/division-specific pedagogies.
 */

import { BaseSkill, type SkillCategory } from '../base.skill.js';

export class PracticeScriptAndProgressionSkill extends BaseSkill {
  readonly name = 'practice_script_and_progression';
  readonly description =
    'Generate multi-day practice progressions for play installation, drill sequencing, and skill development. ' +
    'Takes a play concept + install stage + team context and returns a 5–7 day teaching script with daily objectives, ' +
    'drill pairs, rep counts, coaching cues, and drill board links.';
  readonly category: SkillCategory = 'strategy';

  getPromptContext(params?: Record<string, unknown>): string {
    const sport = (params?.['sport'] as string) || 'football';
    const division = (params?.['division'] as string) || 'college';
    const installStage =
      (params?.['installStage'] as 'install' | 'rep' | 'game-ready') || 'install';
    const practiceWindowMinutes = (params?.['practiceWindowMinutes'] as number) || 120;
    const playName = (params?.['playName'] as string) || 'play concept';
    const position = (params?.['position'] as string) || '';
    const rosterSize = (params?.['rosterSize'] as number) || 100;

    const repCountsByDivision = {
      hs: { individual: 8, unit: 10, team: 12 },
      college: { individual: 12, unit: 15, team: 18 },
      professional: { individual: 15, unit: 18, team: 20 },
    };

    const repTargets =
      repCountsByDivision[division as keyof typeof repCountsByDivision] ||
      repCountsByDivision.college;
    const compressedScript = practiceWindowMinutes < 100;

    return `## Practice Script & Progression Framework

### Context
- **Sport**: ${sport}
- **Division**: ${division}
- **Install Stage**: ${installStage} (${installStageDescription(installStage)})
- **Play/Concept**: ${playName}
${position ? `- **Position Focus**: ${position}` : ''}
- **Practice Window**: ${practiceWindowMinutes} minutes ${compressedScript ? '(compressed format)' : ''}
- **Roster Size**: ${rosterSize} athletes

### Install Stage Definitions
**Install**: Foundation teaching phase
  - Goal: Player understands assignment and executes at walkthrough pace
  - Emphasis: Individual technique, footwork, assignment clarity
  - Pace: 50–60% of game speed
  - Rep goal: ${repTargets.individual}–${repTargets.individual + 2} individual reps per day

**Rep**: Repetition and integration phase
  - Goal: Player executes with adjacent units and automatic decision-making
  - Emphasis: Unit coordination, read recognition, tempo adaptability
  - Pace: 75–85% of game speed
  - Rep goal: ${repTargets.unit}–${repTargets.unit + 3} coordinated reps per day

**Game-Ready**: Competition-intensity phase
  - Goal: Execute at game speed with live pressure and decision fatigue
  - Emphasis: Pressure testing, counter-attacks, situational mastery
  - Pace: 95–100% of game speed
  - Rep goal: ${repTargets.team}–${repTargets.team + 5} live reps per day

---

### Progressive Teaching Sequence (5–7 Days)

#### Day 1: Foundation & Footwork (${installStage === 'install' ? 'Walkthrough + Individual' : 'Review'})
**Objective**: Establish base positioning, footwork fundamentals, no decision-making

**Drills**:
- Drill A (Individual): Footwork/alignment—${drill1Label(sport, installStage)} (10 min, ${repTargets.individual} reps)
- Drill B (Partner): Individual-vs-coach assignment read (8 min, ${repTargets.individual} reps)
- Active Recovery: (2 min) Water, review key cues

**Coaching Cues**:
- "Feet first—alignment sets reads"
- "Eyes on read progression number before snap"
- Focus on: rhythm, not speed

**Drill Diagrams**: Coach will generate 2 board diagrams via \`create_board_diagram\` (kind: "sport_drill")

---

#### Day 2: Assignment Clarity & Communication
**Objective**: Each position group understands assignment in isolation, speaks calls during execution

**Drills**:
- Drill A (Individual): Assignment identification (8 min, ${repTargets.individual} reps)
- Drill B (Positional Unit): Position group only—OL / RB / WR / Defense units separate (12 min, ${repTargets.unit} reps)
- Drill C (Decision Tree): If X happens, do Y (6 min, ${repTargets.individual} reps)

**Coaching Cues**:
- "Call out your read as you execute"
- "If coverage shows X, your adjustment is…"
- "Communicate pre-snap and post-snap"

**Common Busts to Address**:
- Alignment on snap (too tight/loose)
- Communication breakdown between units
- Early trigger (reacting before read develops)

**Drill Diagrams**: 3 board diagrams

---

#### Day 3: Unit Coordination (${installStage === 'install' ? 'Tempo Walk → Half-Speed' : 'Tempo → 3/4 Speed'})
**Objective**: Two or three units work together; full coordination without opposing defense

**Drills**:
- Drill A (Unit Tempo): Offense and OL together (15 min, ${repTargets.unit} reps)
- Drill B (Read Integration): Defense/Coverage reads at tempo (10 min, ${repTargets.unit} reps)
- Drill C (Counter): Run primary look, show counter response (8 min, ${repTargets.unit} reps)

**Coaching Cues**:
- "Tempo is your friend—build rhythm before speed"
- "Talk through reads—I want to hear your thought process"
- "Counter comes online on 3rd rep of primary"

**Correction Sequences**:
- If OL breaks early → isolate OL for 1 rep, then rejoin
- If QB holds read too long → half-field focus (one side only) for 2 reps
- If WR off timing → slow to walk-through for 1 rep, rebuild rhythm

**Drill Diagrams**: 3 board diagrams

---

#### Day 4: Full-Speed Execution (${installStage === 'rep' ? 'No Live Defense' : '7v7 or Team Periods'})
**Objective**: Scrimmage-pace execution; show concept works at competition intensity

**Drills**:
- Drill A (Team Period): Full offense vs air (air defense—no live counters) (${installStage === 'install' ? '20' : '30'} min, ${repTargets.team} reps)
- Drill B (Situational): Red zone, 2-minute, or 3rd-and-short (10 min, ${repTargets.unit} reps)
- Drill C (Live Counter): Light live opposition (DB mirrors only, no tackling) (${installStage === 'install' ? '8' : '15'} min, ${repTargets.unit} reps)

**Coaching Cues**:
- "Game speed—execute clean or we rep it"
- "No excuses for communication—coverage is live"
- "Fast restart between reps—simulate game clock"

**Drill Diagrams**: 2–3 board diagrams (situational variants)

---

#### Day 5: Pressure Testing & Counter Package
**Objective**: Test play vs likely defensive responses; validate counter activations

**Drills**:
- Drill A (Defensive Pressure Looks): OL vs simulated blitz packages (${installStage === 'install' ? '12' : '18'} min, ${repTargets.unit} reps)
- Drill B (Coverage Stress): Split safeties, slot overload, press coverage (10 min, ${repTargets.unit} reps)
- Drill C (11v11 Live): Full team, live opposition, situational win conditions (${installStage === 'install' ? 'N/A' : '20'} min, ${repTargets.team} reps)

**Coaching Cues**:
- "We talked about this pressure—adjustment is X"
- "Your counter is live now—execute it"
- "Communicate pressure pre-snap"

**Common Pressure Breakdowns**:
- OL unable to adjust to stunts
- QB hold extended against blitz
- Secondary adjustment delayed vs coverage look

**Drill Diagrams**: 4–5 diagrams (one per pressure package)

---

#### Day 6 (Optional, if installStage === 'game-ready'): Game Scenario & Situational Mastery
**Objective**: Execute in realistic game scenarios (score, down/distance, clock, noise)

**Drills**:
- Drill A (Scripted Situations): 3rd-and-5, red zone, 2-minute, OT (${installStage === 'game-ready' ? '25' : 'N/A'} min, ${repTargets.team} reps)
- Drill B (Tempo Variance): Fast-paced vs hurry-up calls (${installStage === 'game-ready' ? '12' : 'N/A'} min, ${repTargets.unit} reps)
- Drill C (High-Noise Execution): Stadium audio, crowd chants, silent counts (${installStage === 'game-ready' ? '15' : 'N/A'} min, ${repTargets.team} reps)

**Scoring System**: Win conditions (completion %, yardage threshold, TD rate, turnover count)

**Drill Diagrams**: 3–4 situational variants

---

#### Day 7 (Optional): Consolidation & Install Readiness Assessment
**Objective**: Verify play is ready for situational game deployment

**Drills**:
- Drill A (Install Readiness Tape): Film review of week's progression + teaching moments (10 min, review only)
- Drill B (Championship Reps): Best-of-3 under max pressure (${installStage === 'game-ready' ? '15' : '10'} min, ${repTargets.team} reps)
- Drill C (Contingency Activation): If primary fails, counter is automatic (5 min, ${repTargets.unit} reps)

**Success Criteria**:
- ✅ 85%+ execution rate at full speed
- ✅ Communication clear across all units
- ✅ Counter activates automatically (zero hesitation)
- ✅ Pressure defense unable to disrupt > 20% of time

**Drill Diagrams**: 2 diagrams (primary + counter) for reference card

---

### Rep Count Summary
| Phase | Individual | Unit | Team | Total Per Day |
|-------|-----------|------|------|----------------|
| Day 1 (Install) | ${repTargets.individual + 2} | — | — | ${repTargets.individual + 2} |
| Day 2 (Foundation) | ${repTargets.individual * 2} | ${repTargets.unit} | — | ${repTargets.individual * 2 + repTargets.unit} |
| Day 3 (Coordination) | — | ${repTargets.unit * 2} | — | ${repTargets.unit * 2} |
| Day 4 (Full-Speed) | — | ${repTargets.unit} | ${repTargets.team} | ${repTargets.unit + repTargets.team} |
| Day 5 (Pressure) | — | ${repTargets.unit * 2} | ${repTargets.team} | ${repTargets.unit * 2 + repTargets.team} |
| Day 6 (Scenario) | — | ${repTargets.unit} | ${repTargets.team * 2} | ${repTargets.unit + repTargets.team * 2} |
| Day 7 (Consolidation) | — | ${repTargets.unit} | ${repTargets.team} | ${repTargets.unit + repTargets.team} |

---

### Customization Rules

**For High School** (90-minute practices, larger position groups):
- Compress Days 2–3 into a single "Unit Coordination" day
- Skip Day 6 (Scenario) unless playoff prep
- Increase individual rep emphasis (smaller varsity roster)

**For College** (120–150 minute practices):
- Run full 7-day sequence
- Add mid-week opponent-specific pressure packages (Tuesday)
- Scout opponent coverage tendencies for Day 5 pressure looks

**For Professional** (150+ minute practices, specialized coaching):
- Add pre-practice activation (Day 1–3)
- Emphasize situational mastery (Days 6–7)
- Video breakdown nightly (coach assigns film study)

---

### Delivery Format

**Daily Practice Playbook** (printable/shareable):
- Time block schedule (9:00–9:15 AM: Drill A – Footwork, etc.)
- Drill diagram URLs (links to \`create_board_diagram\` outputs)
- Rep counts and coaching cues
- Correction sequences
- Success metrics

**Weekly Overview** (one-page summary):
- Teaching narrative (install → rep → game-ready progression)
- Key decision points (when to accelerate / slow down)
- Optional drill substitutions
- Video resource links (technique, install videos)

**Coach's Checklist**:
- Pre-practice setup (field/board prep, positioning)
- Daily teaching points (one per day, reinforced all week)
- Success indicators (when ready to advance)
- Common breakdowns to watch for

---

### Tool Integration

When generating this practice script, the Strategy Coordinator will invoke:

\`\`\`ts
// For each day's drills:
create_board_diagram({
  title: 'Day 1 – Footwork Drill', // or 'Day 2 – Assignment Recognition', etc.
  kind: 'sport_drill',
  sport: '${sport}',
  description: '[Drill description with setup, objectives, coaching cues]',
  positions: '[Positions involved]',
  objectives: '[Learning outcomes for the day]',
  ...
})
\`\`\`

Each day typically generates 2–4 drill diagrams (linked in the practice playbook).

---

### Notes for Coach
- **Progression Flexibility**: If a day's rep count falls short due to time, carry forward to next day; do NOT skip a phase.
- **Injury/Fatigue Adaptation**: If key players out, reduce live reps on Days 5–7; maintain fundamentals on Days 1–3.
- **Weather/Facility Constraints**: Contact drills (Day 4+) can move to covered area or compress to 7v7 if needed.
- **Escalation Decision**: After Day 4, coach decides: "Ready to deploy?" If no, extend Day 5–6 pressure testing before commitment.

---

### Success Indicators (End of Progression)
✅ Players execute without coaching cues after snap
✅ Communication is automatic (no thinking, just speaking)
✅ Counters activate correctly > 90% of live reps
✅ Play succeeds vs likely defensive looks > 75% of time
✅ Pressure adaptations correct (OL stunts, DB press, blitz)

If any indicator missed after Day 5, recommend 1–2 additional rep days before game deployment.`;
  }
}

// ─── Utility Functions ──────────────────────────────────────────────────────

function installStageDescription(stage: 'install' | 'rep' | 'game-ready'): string {
  switch (stage) {
    case 'install':
      return 'Foundation teaching—alignment, footwork, assignment clarity at walkthrough pace';
    case 'rep':
      return 'Repetition and integration—tempo coordination, read recognition, unit timing';
    case 'game-ready':
      return 'Competition intensity—live pressure, situational mastery, automatic execution';
    default:
      return '';
  }
}

function drill1Label(sport: string, installStage: string): string {
  const sportLabels: Record<string, Record<string, string>> = {
    football: {
      install: 'QB footwork + read progression setup',
      rep: 'QB tempo walk with OL',
      'game-ready': 'QB full-speed progression reads',
    },
    basketball: {
      install: 'Footwork + spacing—no ball',
      rep: 'Positioning + ball movement',
      'game-ready': 'Full-speed execution + defense',
    },
    soccer: {
      install: 'First-touch + positioning',
      rep: 'Passing lanes + movement timing',
      'game-ready': 'Full-speed build-out + pressure',
    },
  };

  return (
    (sportLabels[sport.toLowerCase()]?.[
      installStage as keyof typeof sportLabels.football
    ] as string) || 'Foundational drill'
  );
}
