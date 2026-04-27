import { describe, expect, it } from 'vitest';
import { getAllAgentToolPolicies, isToolAllowedByPatterns } from '../tool-policy.js';

type WorkflowDefinition = {
  readonly name: string;
  readonly coordinator: keyof ReturnType<typeof getAllAgentToolPolicies>;
  readonly requiredTools: readonly string[];
  readonly optionalAnyOf?: readonly string[];
};

function getMissingTools(
  availableTools: readonly string[],
  requiredTools: readonly string[]
): readonly string[] {
  return requiredTools.filter((toolName) => !isToolAllowedByPatterns(toolName, availableTools));
}

describe('Agent workflow integration coverage', () => {
  it('keeps critical recruiting, brand, performance, and data workflows fully tool-addressable', () => {
    const policies = getAllAgentToolPolicies();

    const workflowDefinitions: readonly WorkflowDefinition[] = [
      {
        name: 'Recruiting: college search to coach outreach',
        coordinator: 'recruiting_coordinator',
        requiredTools: [
          'search_colleges',
          'search_college_coaches',
          'send_email',
          'run_google_workspace_tool',
          'gmail_send_email',
        ],
      },
      {
        name: 'Brand: analyze video to publish timeline post',
        coordinator: 'brand_coordinator',
        requiredTools: ['analyze_video', 'write_timeline_post'],
        optionalAnyOf: ['clip_video', 'generate_thumbnail', 'generate_captions'],
      },
      {
        name: 'Performance: film analysis to persisted intel',
        coordinator: 'performance_coordinator',
        requiredTools: ['analyze_video', 'write_intel'],
        optionalAnyOf: ['update_intel', 'get_video_details'],
      },
      {
        name: 'Data: profile ingestion to durable writes',
        coordinator: 'data_coordinator',
        requiredTools: [
          'scrape_and_index_profile',
          'read_distilled_section',
          'dispatch_extraction',
          'write_core_identity',
        ],
        optionalAnyOf: [
          'write_season_stats',
          'write_team_stats',
          'write_athlete_videos',
          'write_intel',
        ],
      },
    ];

    const failures: string[] = [];

    for (const workflow of workflowDefinitions) {
      const availableTools = policies[workflow.coordinator];
      const missingRequired = getMissingTools(availableTools, workflow.requiredTools);

      if (missingRequired.length > 0) {
        failures.push(`${workflow.name}: missing required tools -> ${missingRequired.join(', ')}`);
      }

      if (workflow.optionalAnyOf && workflow.optionalAnyOf.length > 0) {
        const hasOptionalTool = workflow.optionalAnyOf.some((toolName) =>
          isToolAllowedByPatterns(toolName, availableTools)
        );

        if (!hasOptionalTool) {
          failures.push(
            `${workflow.name}: expected at least one optional tool -> ${workflow.optionalAnyOf.join(', ')}`
          );
        }
      }
    }

    expect(
      failures,
      `Workflow integration coverage gaps detected:\n${failures.join('\n')}`
    ).toEqual([]);
  });
});
