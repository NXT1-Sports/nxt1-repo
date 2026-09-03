import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { AgentXShellComponent } from './agent-x-shell.component';

type MobileCoordinatorTapHelper = {
  haptics: { impact: ReturnType<typeof vi.fn> };
  selectedCoordinatorLabel: ReturnType<typeof signal<string | null>>;
  openOperationChat: ReturnType<typeof vi.fn>;
  onCategoryTap(cat: {
    id: string;
    label: string;
    icon: string;
    description: string;
    commands: readonly {
      id: string;
      label: string;
      icon: string;
      subLabel: string;
      promptText?: string;
    }[];
    suggestedActions?: readonly {
      id: string;
      label: string;
      icon: string;
      subLabel: string;
      promptText?: string;
    }[];
    scheduledActions?: readonly {
      id: string;
      label: string;
      icon: string;
      subLabel: string;
      promptText?: string;
    }[];
  }): Promise<void>;
};

describe('AgentXShellComponent coordinator sheet launch', () => {
  it('opens coordinator command sheets without a processing operation status', async () => {
    const component = Object.create(AgentXShellComponent.prototype) as MobileCoordinatorTapHelper;
    component.haptics = { impact: vi.fn().mockResolvedValue(undefined) };
    component.selectedCoordinatorLabel = signal(null);
    component.openOperationChat = vi.fn().mockResolvedValue(undefined);

    await component.onCategoryTap({
      id: 'brand_coordinator',
      label: 'Brand Coordinator',
      icon: 'sparkles',
      description: 'Build your athlete brand.',
      commands: [
        {
          id: 'create-athlete-post',
          label: 'Create Athlete Post',
          icon: 'edit',
          subLabel: 'Generate social-ready athlete content.',
        },
      ],
    });

    expect(component.openOperationChat).toHaveBeenCalledOnce();
    const [, , , contextType, , , , , , operationStatus] =
      component.openOperationChat.mock.calls[0]!;

    expect(contextType).toBe('command');
    expect(operationStatus).toBeNull();
    expect(component.selectedCoordinatorLabel()).toBeNull();
  });
});
