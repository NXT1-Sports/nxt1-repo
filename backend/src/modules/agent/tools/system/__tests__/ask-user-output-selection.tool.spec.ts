import { describe, expect, it } from 'vitest';
import { isAgentYield } from '../../../exceptions/agent-yield.exception.js';
import { ASK_USER_CONTEXT_KEY, AskUserTool } from '../ask-user.tool.js';

describe('AskUserTool output selection mode', () => {
  it('yields with a pending ask_user tool call for typed output choices', async () => {
    const tool = new AskUserTool();
    const input = {
      question: 'How should I deliver this film breakdown?',
      category: 'film_review',
      inputMode: 'multi_select',
      allowCustomText: true,
      options: [
        {
          id: 'pdf',
          title: 'Printable PDF',
          description: 'Best for sharing with staff or printing.',
          formatTag: 'PDF',
          badge: 'Recommended',
        },
        {
          id: 'gamma_pdf',
          title: 'Gamma PDF',
          description: 'Narrative Gamma-styled PDF with richer layout.',
          formatTag: 'GAMMA',
        },
        {
          id: 'gamma_deck',
          title: 'Gamma Deck',
          description: 'Interactive meeting deck with richer layout.',
          formatTag: 'GAMMA',
        },
        {
          id: 'csv',
          title: 'CSV',
          description: 'Flat raw data for import or spreadsheet work.',
          formatTag: 'CSV',
        },
        {
          id: 'xlsx',
          title: 'Excel Workbook',
          description: 'Best for sorting tendencies and filters.',
          formatTag: 'XLSX',
        },
      ],
      [ASK_USER_CONTEXT_KEY]: {
        agentId: 'router',
        messages: [{ role: 'user', content: 'Export this film breakdown' }],
        toolCallId: 'call_ask_user_1',
      },
    };

    await expect(tool.execute(input)).rejects.toMatchObject({ isYield: true });

    try {
      await tool.execute(input);
      throw new Error('Expected tool to yield');
    } catch (error) {
      expect(isAgentYield(error)).toBe(true);
      if (!isAgentYield(error)) return;
      expect(error.payload.reason).toBe('needs_input');
      expect(error.payload.pendingToolCall).toMatchObject({
        toolName: 'ask_user',
        toolCallId: 'call_ask_user_1',
      });
      expect(error.payload.pendingToolCall?.toolInput).toMatchObject({
        prompt: 'How should I deliver this film breakdown?',
        multiSelect: true,
        allowCustomOption: true,
      });
      const options = error.payload.pendingToolCall?.toolInput['options'];
      expect(options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'chat_summary', icon: 'choice' }),
          expect.objectContaining({ id: 'printable_pdf', icon: 'pdf' }),
          expect.objectContaining({ id: 'gamma_pdf', icon: 'sparkles' }),
          expect.objectContaining({ id: 'gamma_deck', icon: 'sparkles' }),
          expect.objectContaining({ id: 'editable_pptx', icon: 'slides' }),
          expect.objectContaining({ id: 'csv', icon: 'spreadsheet' }),
          expect.objectContaining({ id: 'xlsx_workbook', icon: 'spreadsheet' }),
        ])
      );
    }
  });

  it('keeps plain ask_user as a card-backed yield with a pending tool call', async () => {
    const tool = new AskUserTool();
    const input = {
      question: 'Which team should I use?',
      [ASK_USER_CONTEXT_KEY]: {
        agentId: 'router',
        messages: [{ role: 'user', content: 'Make a report' }],
        toolCallId: 'call_ask_user_text',
      },
    };

    try {
      await tool.execute(input);
      throw new Error('Expected tool to yield');
    } catch (error) {
      expect(isAgentYield(error)).toBe(true);
      if (!isAgentYield(error)) return;
      expect(error.payload.promptToUser).toBe('Which team should I use?');
      expect(error.payload.pendingToolCall).toMatchObject({
        toolName: 'ask_user',
        toolCallId: 'call_ask_user_text',
        toolInput: {
          question: 'Which team should I use?',
          prompt: 'Which team should I use?',
          steps: [
            expect.objectContaining({
              id: 'response',
              prompt: 'Which team should I use?',
              inputMode: 'text',
              allowCustomOption: true,
              customPlaceholder: 'Type your answer...',
            }),
          ],
        },
      });
    }
  });

  it('accepts generic label/value choices for normal clarification cards', async () => {
    const tool = new AskUserTool();
    const input = {
      question: 'Which team is ODK keyed to?',
      inputMode: 'single_select',
      options: [
        { label: 'O rows are Falcons', value: 'falcons_offense' },
        { label: 'D rows are Falcons', value: 'falcons_defense' },
      ],
      [ASK_USER_CONTEXT_KEY]: {
        agentId: 'performance_coordinator',
        messages: [{ role: 'user', content: 'break down this film' }],
        toolCallId: 'call_ask_user_odk',
      },
    };

    try {
      await tool.execute(input);
      throw new Error('Expected tool to yield');
    } catch (error) {
      expect(isAgentYield(error)).toBe(true);
      if (!isAgentYield(error)) return;
      expect(error.payload.pendingToolCall).toMatchObject({
        toolName: 'ask_user',
        toolCallId: 'call_ask_user_odk',
      });
      expect(error.payload.pendingToolCall?.toolInput['options']).toEqual([
        expect.objectContaining({
          id: 'falcons_offense',
          title: 'O rows are Falcons',
          formatTag: 'CHOICE',
          icon: 'choice',
        }),
        expect.objectContaining({
          id: 'falcons_defense',
          title: 'D rows are Falcons',
          formatTag: 'CHOICE',
          icon: 'choice',
        }),
      ]);
    }
  });

  it('accepts simple string choices for lightweight selection cards', async () => {
    const tool = new AskUserTool();
    const input = {
      question: 'Pick a focus area',
      inputMode: 'single_select',
      options: ['Offense', 'Defense', 'Special teams'],
      [ASK_USER_CONTEXT_KEY]: {
        agentId: 'router',
        messages: [{ role: 'user', content: 'analyze this' }],
        toolCallId: 'call_ask_user_strings',
      },
    };

    try {
      await tool.execute(input);
      throw new Error('Expected tool to yield');
    } catch (error) {
      expect(isAgentYield(error)).toBe(true);
      if (!isAgentYield(error)) return;
      expect(error.payload.pendingToolCall?.toolInput['options']).toEqual([
        expect.objectContaining({ id: 'offense', title: 'Offense', formatTag: 'CHOICE' }),
        expect.objectContaining({ id: 'defense', title: 'Defense', formatTag: 'CHOICE' }),
        expect.objectContaining({
          id: 'special_teams',
          title: 'Special teams',
          formatTag: 'CHOICE',
        }),
      ]);
    }
  });

  it('infers format icons for output choices when the LLM omits formatTag metadata', async () => {
    const tool = new AskUserTool();
    const input = {
      question: 'What format for the target list deliverable?',
      inputMode: 'single_select',
      allowCustomText: true,
      options: [
        { label: 'Chat Summary', value: 'chat_summary' },
        { label: 'Printable PDF', value: 'printable_pdf' },
        { label: 'Gamma PDF', value: 'gamma_pdf' },
        { label: 'Gamma Deck / PPTX', value: 'gamma_deck_pptx', formatTag: 'PPTX' },
        { label: 'Editable PPTX', value: 'editable_pptx' },
        { label: 'XLSX Workbook', value: 'xlsx_workbook' },
        { label: 'CSV', value: 'csv' },
      ],
      [ASK_USER_CONTEXT_KEY]: {
        agentId: 'recruiting_coordinator',
        messages: [{ role: 'user', content: 'Build Program Target List' }],
        toolCallId: 'call_ask_user_export_format',
      },
    };

    try {
      await tool.execute(input);
      throw new Error('Expected tool to yield');
    } catch (error) {
      expect(isAgentYield(error)).toBe(true);
      if (!isAgentYield(error)) return;
      expect(error.payload.pendingToolCall?.toolInput['options']).toEqual([
        expect.objectContaining({ id: 'chat_summary', title: 'Chat Summary', formatTag: 'CHOICE', icon: 'choice' }),
        expect.objectContaining({ id: 'printable_pdf', title: 'Printable PDF', formatTag: 'PDF', icon: 'pdf' }),
        expect.objectContaining({ id: 'gamma_pdf', title: 'Gamma PDF', formatTag: 'GAMMA', icon: 'sparkles' }),
        expect.objectContaining({ id: 'gamma_deck_pptx', title: 'Gamma Deck / PPTX', formatTag: 'GAMMA', icon: 'sparkles' }),
        expect.objectContaining({ id: 'editable_pptx', title: 'Editable PPTX', formatTag: 'PPTX', icon: 'slides' }),
        expect.objectContaining({ id: 'xlsx_workbook', title: 'XLSX Workbook', formatTag: 'XLSX', icon: 'spreadsheet' }),
        expect.objectContaining({ id: 'csv', title: 'CSV', formatTag: 'CSV', icon: 'spreadsheet' }),
      ]);
    }
  });

  it('emits normalized multi-step selection flows through ask_user', async () => {
    const tool = new AskUserTool();
    const input = {
      question: 'I need two answers before I can continue.',
      steps: [
        {
          id: 'ownership',
          question: 'Which team is ODK keyed to?',
          inputMode: 'single_select',
          options: [
            { label: 'O rows are Falcons', value: 'falcons_offense' },
            { label: 'D rows are Falcons', value: 'falcons_defense' },
          ],
        },
        {
          id: 'deliverable',
          question: 'How should I package the final report?',
          inputMode: 'multi_select',
          allowCustomText: true,
          options: [
            {
              id: 'pdf',
              title: 'Printable PDF',
              description: 'Best for sharing with staff.',
              formatTag: 'PDF',
            },
            {
              id: 'gamma_pdf',
              title: 'Gamma PDF',
              description: 'Narrative Gamma-styled PDF for staff packets.',
              formatTag: 'GAMMA',
            },
            {
              id: 'gamma_deck',
              title: 'Gamma Deck',
              description: 'Interactive deck for meetings.',
              formatTag: 'GAMMA',
            },
            {
              id: 'csv',
              title: 'CSV',
              description: 'Flat export for spreadsheet or import workflows.',
              formatTag: 'CSV',
            },
          ],
        },
      ],
      [ASK_USER_CONTEXT_KEY]: {
        agentId: 'performance_coordinator',
        messages: [{ role: 'user', content: 'break down this film' }],
        toolCallId: 'call_ask_user_steps',
      },
    };

    try {
      await tool.execute(input);
      throw new Error('Expected tool to yield');
    } catch (error) {
      expect(isAgentYield(error)).toBe(true);
      if (!isAgentYield(error)) return;
      expect(error.payload.pendingToolCall).toMatchObject({
        toolName: 'ask_user',
        toolCallId: 'call_ask_user_steps',
      });
      expect(error.payload.pendingToolCall?.toolInput['steps']).toEqual([
        expect.objectContaining({
          id: 'ownership',
          prompt: 'Which team is ODK keyed to?',
          inputMode: 'single_select',
          options: [
            expect.objectContaining({ id: 'falcons_offense', title: 'O rows are Falcons' }),
            expect.objectContaining({ id: 'falcons_defense', title: 'D rows are Falcons' }),
          ],
        }),
        expect.objectContaining({
          id: 'deliverable',
          prompt: 'How should I package the final report?',
          inputMode: 'multi_select',
          allowCustomOption: true,
          options: [
            expect.objectContaining({ id: 'chat_summary', icon: 'choice' }),
            expect.objectContaining({ id: 'printable_pdf', icon: 'pdf' }),
            expect.objectContaining({ id: 'gamma_pdf', icon: 'sparkles' }),
            expect.objectContaining({ id: 'gamma_deck', icon: 'sparkles' }),
            expect.objectContaining({ id: 'editable_pptx', icon: 'slides' }),
            expect.objectContaining({ id: 'xlsx_workbook', icon: 'spreadsheet' }),
            expect.objectContaining({ id: 'csv', icon: 'spreadsheet' }),
          ],
        }),
      ]);
    }
  });

  it('upgrades partial film-report delivery choices to the full checkbox set', async () => {
    const tool = new AskUserTool();
    const input = {
      question: 'How would you like this report delivered?',
      category: 'film_review',
      inputMode: 'single_select',
      options: [
        { id: 'printable_pdf', title: 'Printable PDF', formatTag: 'PDF' },
        { id: 'csv', title: 'CSV', formatTag: 'CSV' },
      ],
      [ASK_USER_CONTEXT_KEY]: {
        agentId: 'performance_coordinator',
        messages: [{ role: 'user', content: 'analyze this film breakdown' }],
        toolCallId: 'call_ask_user_delivery',
      },
    };

    try {
      await tool.execute(input);
      throw new Error('Expected tool to yield');
    } catch (error) {
      expect(isAgentYield(error)).toBe(true);
      if (!isAgentYield(error)) return;
      expect(error.payload.pendingToolCall?.toolInput).toMatchObject({
        multiSelect: true,
        allowCustomOption: true,
      });
      expect(error.payload.pendingToolCall?.toolInput['options']).toEqual([
        expect.objectContaining({ id: 'chat_summary', title: 'Chat Summary' }),
        expect.objectContaining({ id: 'printable_pdf', title: 'Printable PDF' }),
        expect.objectContaining({ id: 'gamma_pdf', title: 'Gamma PDF' }),
        expect.objectContaining({ id: 'gamma_deck', title: 'Gamma Deck' }),
        expect.objectContaining({ id: 'editable_pptx', title: 'Editable PPTX' }),
        expect.objectContaining({ id: 'xlsx_workbook', title: 'XLSX Workbook' }),
        expect.objectContaining({ id: 'csv', title: 'CSV' }),
      ]);
    }
  });

  it('does not rewrite film report perspective questions into delivery options', async () => {
    const tool = new AskUserTool();
    const input = {
      question: 'Confirm film report setup',
      category: 'film_review',
      steps: [
        {
          id: 'report_type',
          question: 'What kind of report do you want?',
          inputMode: 'single_select',
          options: [
            { id: 'printable_pdf', title: 'Printable PDF', formatTag: 'PDF' },
            { id: 'csv', title: 'CSV', formatTag: 'CSV' },
          ],
        },
      ],
      [ASK_USER_CONTEXT_KEY]: {
        agentId: 'performance_coordinator',
        messages: [{ role: 'user', content: 'Analyze this film breakdown' }],
        toolCallId: 'call_ask_user_report_type',
      },
    };

    try {
      await tool.execute(input);
      throw new Error('Expected tool to yield');
    } catch (error) {
      expect(isAgentYield(error)).toBe(true);
      if (!isAgentYield(error)) return;
      expect(error.payload.pendingToolCall?.toolInput['steps']).toEqual([
        expect.objectContaining({
          id: 'report_type',
          inputMode: 'single_select',
          allowCustomOption: true,
          options: [
            expect.objectContaining({ id: 'self_scout', title: 'Self-scout our tendencies' }),
            expect.objectContaining({ id: 'opponent_scout', title: 'Opponent scout their tendencies' }),
            expect.objectContaining({ id: 'balanced_tendencies', title: 'Balanced team-vs-team trends' }),
          ],
        }),
      ]);
    }
  });

  it('normalizes top-level film report perspective questions away from delivery options', async () => {
    const tool = new AskUserTool();
    const input = {
      question: 'What kind of report do you want?',
      inputMode: 'single_select',
      options: [
        { id: 'printable_pdf', title: 'Printable PDF', formatTag: 'PDF' },
        { id: 'gamma_deck', title: 'Gamma Deck', formatTag: 'GAMMA' },
      ],
      [ASK_USER_CONTEXT_KEY]: {
        agentId: 'performance_coordinator',
        messages: [{ role: 'user', content: 'Analyze this film breakdown' }],
        toolCallId: 'call_ask_user_top_report_type',
      },
    };

    try {
      await tool.execute(input);
      throw new Error('Expected tool to yield');
    } catch (error) {
      expect(isAgentYield(error)).toBe(true);
      if (!isAgentYield(error)) return;
      expect(error.payload.pendingToolCall?.toolInput).toMatchObject({
        multiSelect: false,
        allowCustomOption: true,
        options: [
          expect.objectContaining({ id: 'self_scout', title: 'Self-scout our tendencies' }),
          expect.objectContaining({ id: 'opponent_scout', title: 'Opponent scout their tendencies' }),
          expect.objectContaining({ id: 'balanced_tendencies', title: 'Balanced team-vs-team trends' }),
        ],
      });
    }
  });
});