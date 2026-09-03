import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import { AgentXFilmTrackingInternalPanelComponent } from './agent-x-film-tracking-internal-panel.component';

describe('AgentXFilmTrackingInternalPanelComponent', () => {
  async function render(): Promise<ComponentFixture<AgentXFilmTrackingInternalPanelComponent>> {
    await TestBed.configureTestingModule({
      imports: [AgentXFilmTrackingInternalPanelComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(AgentXFilmTrackingInternalPanelComponent);
    fixture.componentRef.setInput('tracks', [
      {
        trackId: 'track-7',
        kind: 'player',
        teamSide: 'home',
        jerseyNumber: '7',
        positionLabel: 'WR',
        confidence: 0.94,
        surfacePoint: { x: 60, y: 26.65, unit: 'yard' },
        topSpeedMph: 18.4,
        separationYards: 3.8,
      },
      {
        trackId: 'ball-1',
        kind: 'ball',
        confidence: 0.88,
        surfacePoint: { x: 0.52, y: 0.5, unit: 'normalized' },
      },
    ]);
    fixture.detectChanges();
    return fixture;
  }

  it('renders all-track mode with a live map dot per positioned track', async () => {
    const fixture = await render();

    const dots = fixture.debugElement.queryAll(By.css('.tracking-map__dot'));
    expect(dots).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('2 tracked entities');
  });

  it('renders selected player dossier when a track is selected', async () => {
    const fixture = await render();

    fixture.componentRef.setInput('selectedTrackId', 'track-7');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Selected Player');
    expect(text).toContain('WR');
    expect(text).toContain('#7');
    expect(text).toContain('18.4 mph');
  });

  it('emits track selection from the minimap', async () => {
    const fixture = await render();
    const selected: string[] = [];
    fixture.componentInstance.trackSelected.subscribe((trackId) => selected.push(trackId));

    fixture.debugElement.query(By.css('.tracking-map__dot')).triggerEventHandler('click');

    expect(selected).toEqual(['track-7']);
  });
});
