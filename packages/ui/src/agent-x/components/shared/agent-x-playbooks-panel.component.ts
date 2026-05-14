import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { NxtIconComponent } from '../../../components/icon/icon.component';
import { NxtStateViewComponent } from '../../../components/state-view/state-view.component';
import { AgentXService } from '../../services/agent-x.service';
import { AGENT_X_API_BASE_URL } from '../../services/agent-x-job.service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlaybookSummary {
  readonly id: string;
  readonly teamId: string;
  readonly sport: string;
  readonly name: string;
  readonly title?: string;
  readonly season?: string;
  readonly source?: string;
  readonly sourceUrl?: string;
  readonly playCount?: number;
  readonly updatedAt?: string;
  readonly createdAt?: string;
  readonly archived?: boolean;
}

interface PlaybookPlay {
  readonly id?: string;
  readonly name?: string;
  readonly title?: string;
  readonly series?: string;
  readonly category?: string;
  readonly formation?: string;
  readonly personnel?: string;
  readonly downDistance?: string;
  readonly objective?: string;
  readonly installNotes?: string;
  readonly tags?: readonly string[];
  readonly conceptTags?: readonly string[];
  readonly diagramUrl?: string;
  readonly videoUrl?: string;
  readonly installUrl?: string;
}

interface PlaybookDetail extends PlaybookSummary {
  readonly plays?: readonly PlaybookPlay[];
  readonly conceptTagIndex?: readonly string[];
  readonly formationIndex?: readonly string[];
  readonly personnelIndex?: readonly string[];
  readonly categoryIndex?: readonly string[];
  readonly createdBy?: string;
  readonly updatedBy?: string;
}

interface PlaybooksResponse {
  readonly success: boolean;
  readonly data?: { readonly playbooks: readonly PlaybookSummary[]; readonly count: number };
  readonly error?: string;
}

interface PlaybookDetailResponse {
  readonly success: boolean;
  readonly data?: { readonly playbook: PlaybookDetail };
  readonly error?: string;
}

interface MutationResponse {
  readonly success: boolean;
  readonly data?: Record<string, unknown>;
  readonly error?: string;
}

interface UploadAttachmentResponse {
  readonly success: boolean;
  readonly data?: {
    readonly url: string;
    readonly storagePath?: string;
    readonly name?: string;
    readonly mimeType?: string;
    readonly sizeBytes?: number;
  };
  readonly error?: string;
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface NewPlaybookForm {
  name: string;
  sport: string;
  season: string;
}
interface EditPlaybookForm {
  name: string;
  season: string;
  source: string;
}
interface PlayForm {
  name: string;
  series: string;
  category: string;
  formation: string;
  personnel: string;
  objective: string;
  installNotes: string;
  conceptTags: string;
  diagramUrl: string;
}

const EMPTY_NEW_PLAYBOOK: NewPlaybookForm = { name: '', sport: '', season: '' };
const EMPTY_EDIT_PLAYBOOK: EditPlaybookForm = { name: '', season: '', source: '' };
const EMPTY_PLAY_FORM: PlayForm = {
  name: '',
  series: '',
  category: '',
  formation: '',
  personnel: '',
  objective: '',
  installNotes: '',
  conceptTags: '',
  diagramUrl: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map(toTitleCase);
}

@Component({
  selector: 'nxt1-agent-x-playbooks-panel',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtStateViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="playbooks-panel">
      <!-- ──────────────── DETAIL VIEW ──────────────── -->
      @if (showingDetail() && selectedPlaybook()) {
        <div class="playbook-detail">
          <div class="detail-header">
            <div
              class="detail-back-link"
              role="button"
              tabindex="0"
              (click)="clearSelection()"
              (keydown.enter)="clearSelection()"
              (keydown.space)="$event.preventDefault(); clearSelection()"
              aria-label="Back to playbooks"
            >
              <nxt1-icon name="chevronLeft" [size]="18"></nxt1-icon>
              <span>Playbooks</span>
            </div>
            @if (!editingMeta()) {
              <button
                type="button"
                class="icon-btn"
                title="Edit playbook"
                (click)="startEditMeta()"
              >
                <nxt1-icon name="pencil" [size]="15"></nxt1-icon>
              </button>
            }
          </div>

          @if (editingMeta()) {
            <div class="detail-form">
              <h4 class="form-heading">Edit</h4>
              <input
                class="form-input"
                placeholder="Name *"
                [value]="editPlaybookForm().name"
                (input)="patchEditPlaybook('name', $event)"
              />
              <input
                class="form-input"
                placeholder="Season"
                [value]="editPlaybookForm().season"
                (input)="patchEditPlaybook('season', $event)"
              />
              <input
                class="form-input"
                placeholder="Source"
                [value]="editPlaybookForm().source"
                (input)="patchEditPlaybook('source', $event)"
              />
              <div class="form-actions">
                <button type="button" class="btn-cancel" (click)="cancelEditMeta()">Cancel</button>
                <button
                  type="button"
                  class="btn-save"
                  [disabled]="saving()"
                  (click)="saveEditPlaybook(selectedPlaybook()!.id)"
                >
                  {{ saving() ? 'Saving…' : 'Save' }}
                </button>
              </div>
            </div>
          } @else {
            <h2 class="detail-title">
              {{ selectedPlaybook()!.title || selectedPlaybook()!.name }}
            </h2>
            <div class="detail-meta-grid">
              <div class="meta-item">
                <span class="meta-label">Sport</span>
                <span class="meta-value">{{ selectedPlaybook()!.sport | titlecase }}</span>
              </div>
              @if (selectedPlaybook()!.season) {
                <div class="meta-item">
                  <span class="meta-label">Season</span>
                  <span class="meta-value">{{ selectedPlaybook()!.season }}</span>
                </div>
              }
              <div class="meta-item">
                <span class="meta-label">Plays</span>
                <span class="meta-value">{{ totalPlays() }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Updated</span>
                <span class="meta-value">{{
                  formatDate(selectedPlaybook()!.updatedAt || selectedPlaybook()!.createdAt)
                }}</span>
              </div>
            </div>
          }

          @if (!editingMeta() && (selectedPlaybook()!.source || selectedPlaybook()!.sourceUrl)) {
            <section class="detail-section">
              <h3 class="section-title">Source</h3>
              <p class="section-meta">
                {{ selectedPlaybook()!.source || 'Internal' }}
                @if (selectedPlaybook()!.sourceUrl) {
                  &middot;
                  <a
                    class="section-link"
                    [href]="selectedPlaybook()!.sourceUrl!"
                    target="_blank"
                    rel="noopener noreferrer"
                    >Open Source</a
                  >
                }
              </p>
            </section>
          }

          @if (hasIndexes()) {
            <section class="detail-section">
              <h3 class="section-title">Playbook Index</h3>
              <p class="section-meta">
                Auto-built from your saved plays so staff can scan concepts, fronts, personnel, and
                call families fast.
              </p>
              @if (selectedPlaybook()!.conceptTagIndex?.length) {
                <div class="index-group">
                  <span class="index-label">Concept Tags</span>
                  <div class="chip-list">
                    @for (tag of selectedPlaybook()!.conceptTagIndex!; track tag) {
                      <span class="chip">{{ tag }}</span>
                    }
                  </div>
                </div>
              }
              @if (selectedPlaybook()!.formationIndex?.length) {
                <div class="index-group">
                  <span class="index-label">Formations</span>
                  <div class="chip-list">
                    @for (tag of selectedPlaybook()!.formationIndex!; track tag) {
                      <span class="chip chip--soft">{{ tag }}</span>
                    }
                  </div>
                </div>
              }
              @if (selectedPlaybook()!.personnelIndex?.length) {
                <div class="index-group">
                  <span class="index-label">Personnel Packages</span>
                  <div class="chip-list">
                    @for (tag of selectedPlaybook()!.personnelIndex!; track tag) {
                      <span class="chip chip--soft">{{ tag }}</span>
                    }
                  </div>
                </div>
              }
              @if (selectedPlaybook()!.categoryIndex?.length) {
                <div class="index-group">
                  <span class="index-label">Call Families</span>
                  <div class="chip-list">
                    @for (tag of selectedPlaybook()!.categoryIndex!; track tag) {
                      <span class="chip chip--soft">{{ tag }}</span>
                    }
                  </div>
                </div>
              }
            </section>
          }

          <section class="detail-section">
            <div class="section-header">
              <h3 class="section-title">Plays</h3>
              @if (!showAddPlayForm()) {
                <button type="button" class="btn-add-play" (click)="startAddPlay()">
                  <nxt1-icon name="plus" [size]="13"></nxt1-icon>
                  Add Play
                </button>
              }
            </div>

            @if (showAddPlayForm()) {
              <div class="inline-form inline-form--plays">
                <h4 class="form-heading">New Play</h4>
                <input
                  class="form-input"
                  placeholder="Play name *"
                  [value]="addPlayForm().name"
                  (input)="patchAddPlayForm('name', $event)"
                />
                <div class="form-row">
                  <input
                    class="form-input"
                    placeholder="Series"
                    [value]="addPlayForm().series"
                    (input)="patchAddPlayForm('series', $event)"
                  />
                  <input
                    class="form-input"
                    placeholder="Category"
                    [value]="addPlayForm().category"
                    (input)="patchAddPlayForm('category', $event)"
                  />
                </div>
                <div class="form-row">
                  <input
                    class="form-input"
                    placeholder="Formation"
                    [value]="addPlayForm().formation"
                    (input)="patchAddPlayForm('formation', $event)"
                  />
                  <input
                    class="form-input"
                    placeholder="Personnel"
                    [value]="addPlayForm().personnel"
                    (input)="patchAddPlayForm('personnel', $event)"
                  />
                </div>
                <textarea
                  class="form-input form-textarea"
                  placeholder="Objective"
                  [value]="addPlayForm().objective"
                  (input)="patchAddPlayForm('objective', $event)"
                ></textarea>
                <input
                  class="form-input"
                  placeholder="Install notes"
                  [value]="addPlayForm().installNotes"
                  (input)="patchAddPlayForm('installNotes', $event)"
                />
                <input
                  class="form-input"
                  placeholder="Concept tags (comma-separated)"
                  [value]="addPlayForm().conceptTags"
                  (input)="patchAddPlayForm('conceptTags', $event)"
                />
                <input
                  class="form-input"
                  placeholder="Diagram URL"
                  [value]="addPlayForm().diagramUrl"
                  (input)="patchAddPlayForm('diagramUrl', $event)"
                />
                <div class="form-actions">
                  <button type="button" class="btn-cancel" (click)="cancelAddPlay()">Cancel</button>
                  <button
                    type="button"
                    class="btn-save"
                    [disabled]="savingPlay()"
                    (click)="addPlay()"
                  >
                    {{ savingPlay() ? 'Saving…' : 'Add Play' }}
                  </button>
                </div>
              </div>
            }

            @if (selectedPlaybook()!.plays?.length) {
              <div class="plays-list">
                @for (play of selectedPlaybook()!.plays!; track play.id || play.name || $index) {
                  <article class="play-item">
                    @if (deletingPlayIndex() === $index) {
                      <div class="delete-overlay">
                        <p class="delete-msg">
                          Remove <strong>{{ play.title || play.name }}</strong
                          >?
                        </p>
                        <div class="form-actions">
                          <button type="button" class="btn-cancel" (click)="cancelDeletePlay()">
                            Keep
                          </button>
                          <button
                            type="button"
                            class="btn-delete-confirm"
                            [disabled]="savingPlay()"
                            (click)="deletePlay($index)"
                          >
                            {{ savingPlay() ? 'Removing…' : 'Remove' }}
                          </button>
                        </div>
                      </div>
                    } @else if (editingPlayIndex() === $index) {
                      <div class="play-edit-form">
                        <input
                          class="form-input"
                          placeholder="Play name *"
                          [value]="editPlayForm().name"
                          (input)="patchEditPlayForm('name', $event)"
                        />
                        <div class="form-row">
                          <input
                            class="form-input"
                            placeholder="Series"
                            [value]="editPlayForm().series"
                            (input)="patchEditPlayForm('series', $event)"
                          />
                          <input
                            class="form-input"
                            placeholder="Category"
                            [value]="editPlayForm().category"
                            (input)="patchEditPlayForm('category', $event)"
                          />
                        </div>
                        <div class="form-row">
                          <input
                            class="form-input"
                            placeholder="Formation"
                            [value]="editPlayForm().formation"
                            (input)="patchEditPlayForm('formation', $event)"
                          />
                          <input
                            class="form-input"
                            placeholder="Personnel"
                            [value]="editPlayForm().personnel"
                            (input)="patchEditPlayForm('personnel', $event)"
                          />
                        </div>
                        <textarea
                          class="form-input form-textarea"
                          placeholder="Objective"
                          [value]="editPlayForm().objective"
                          (input)="patchEditPlayForm('objective', $event)"
                        ></textarea>
                        <input
                          class="form-input"
                          placeholder="Install notes"
                          [value]="editPlayForm().installNotes"
                          (input)="patchEditPlayForm('installNotes', $event)"
                        />
                        <input
                          class="form-input"
                          placeholder="Concept tags (comma-separated)"
                          [value]="editPlayForm().conceptTags"
                          (input)="patchEditPlayForm('conceptTags', $event)"
                        />
                        <div class="diagram-upload-row">
                          <input
                            #editDiagramInput
                            class="hidden-file-input"
                            type="file"
                            accept="image/*"
                            (change)="onEditDiagramFileSelected($event)"
                          />
                          <button
                            type="button"
                            class="btn-upload-diagram"
                            (click)="editDiagramInput.click()"
                          >
                            Upload Diagram
                          </button>
                          @if (editPlayDiagramFileName()) {
                            <span class="diagram-upload-status">{{
                              editPlayDiagramFileName()
                            }}</span>
                          } @else if (editPlayForm().diagramUrl) {
                            <span class="diagram-upload-status">Current diagram attached</span>
                          }
                        </div>
                        <div class="form-actions">
                          <button type="button" class="btn-cancel" (click)="cancelEditPlay()">
                            Cancel
                          </button>
                          <button
                            type="button"
                            class="btn-save"
                            [disabled]="savingPlay()"
                            (click)="saveEditPlay($index)"
                          >
                            {{ savingPlay() ? 'Saving…' : 'Save' }}
                          </button>
                        </div>
                      </div>
                    } @else {
                      <div class="play-actions">
                        <button
                          type="button"
                          class="icon-btn icon-btn--sm"
                          title="Edit play"
                          (click)="startEditPlay($index, play)"
                        >
                          <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                        </button>
                        <button
                          type="button"
                          class="icon-btn icon-btn--sm icon-btn--danger"
                          title="Remove play"
                          (click)="confirmDeletePlay($index)"
                        >
                          <nxt1-icon name="trash" [size]="12"></nxt1-icon>
                        </button>
                      </div>
                      <div class="play-head">
                        <h4>{{ play.title || play.name || 'Untitled Play' }}</h4>
                        @if (play.series) {
                          <span class="chip chip--soft">{{ play.series }}</span>
                        }
                      </div>
                      <div class="play-meta">
                        @if (play.category) {
                          <span>{{ play.category }}</span>
                        }
                        @if (play.formation) {
                          <span>{{ play.formation }}</span>
                        }
                        @if (play.personnel) {
                          <span>{{ play.personnel }}</span>
                        }
                        @if (play.downDistance) {
                          <span>{{ play.downDistance }}</span>
                        }
                      </div>
                      @if (play.objective) {
                        <p class="play-copy">{{ play.objective }}</p>
                      }
                      @if (play.installNotes) {
                        <p class="play-copy play-copy--muted">Install: {{ play.installNotes }}</p>
                      }
                      @if (play.tags?.length || play.conceptTags?.length) {
                        <div class="chip-list">
                          @for (tag of play.tags || []; track tag) {
                            <span class="chip chip--soft">{{ tag }}</span>
                          }
                          @for (tag of play.conceptTags || []; track tag) {
                            <span class="chip">{{ tag }}</span>
                          }
                        </div>
                      }
                      @if (play.diagramUrl) {
                        <a
                          class="diagram-preview-card"
                          [href]="play.diagramUrl"
                          target="_blank"
                          rel="noopener noreferrer"
                          [attr.aria-label]="
                            'Open diagram for ' + (play.title || play.name || 'play')
                          "
                        >
                          @if (isImageUrl(play.diagramUrl)) {
                            <img
                              class="diagram-preview-image"
                              [src]="play.diagramUrl"
                              [alt]="(play.title || play.name || 'Play') + ' diagram'"
                              loading="lazy"
                            />
                          } @else {
                            <div class="diagram-preview-fallback">
                              <nxt1-icon name="image" [size]="18"></nxt1-icon>
                              <span>Open Diagram</span>
                            </div>
                          }
                        </a>
                      } @else {
                        <div class="diagram-preview-fallback diagram-preview-fallback--empty">
                          <nxt1-icon name="image" [size]="16"></nxt1-icon>
                          <span>No diagram yet</span>
                        </div>
                      }
                      <div class="play-links">
                        @if (play.videoUrl) {
                          <a
                            class="play-link"
                            [href]="play.videoUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            >Video</a
                          >
                        }
                        @if (play.installUrl) {
                          <a
                            class="play-link"
                            [href]="play.installUrl"
                            target="_blank"
                            rel="noopener noreferrer"
                            >Install</a
                          >
                        }
                      </div>
                    }
                  </article>
                }
              </div>
            } @else if (!showAddPlayForm()) {
              <p class="section-meta">No plays yet &mdash; add the first one above.</p>
            }
          </section>

          <section class="detail-section detail-section--meta">
            <h3 class="section-title">Record</h3>
            <p class="section-meta">Created: {{ formatDate(selectedPlaybook()!.createdAt) }}</p>
            <p class="section-meta">Updated: {{ formatDate(selectedPlaybook()!.updatedAt) }}</p>
          </section>
        </div>
      } @else if (showingDetail() && detailLoading()) {
        <div class="playbooks-loading">
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </div>
      } @else if (loading()) {
        <div class="playbooks-loading">
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
          <div class="skeleton-card"></div>
        </div>
      } @else if (!hasTeamContext()) {
        <nxt1-state-view
          title="Team Context Required"
          message="Select a team to view that team's playbooks only"
          icon="users"
        />
      } @else if (error()) {
        <nxt1-state-view
          title="Unable to load playbooks"
          [message]="error()!"
          icon="alertCircle"
          actionLabel="Try Again"
          (action)="reload()"
        />
      } @else {
        <div class="playbooks-list-header">
          <div>
            <h3>Playbooks</h3>
          </div>
          @if (!showCreateForm()) {
            <button type="button" class="btn-new" (click)="startCreate()">
              <nxt1-icon name="plus" [size]="14"></nxt1-icon>
              New
            </button>
          }
        </div>

        @if (showCreateForm()) {
          <div class="inline-form">
            <h4 class="form-heading">New Playbook</h4>
            <input
              class="form-input"
              placeholder="Playbook name *"
              [value]="newPlaybook().name"
              (input)="patchNewPlaybook('name', $event)"
            />
            <div class="form-row">
              <input
                class="form-input"
                placeholder="Sport (e.g. basketball) *"
                [value]="newPlaybook().sport"
                (input)="patchNewPlaybook('sport', $event)"
              />
              <input
                class="form-input"
                placeholder="Season (e.g. 2025-26)"
                [value]="newPlaybook().season"
                (input)="patchNewPlaybook('season', $event)"
              />
            </div>
            <div class="form-actions">
              <button type="button" class="btn-cancel" (click)="cancelCreate()">Cancel</button>
              <button
                type="button"
                class="btn-save"
                [disabled]="saving() || !newPlaybook().name.trim() || !newPlaybook().sport.trim()"
                (click)="createPlaybook()"
              >
                {{ saving() ? 'Creating…' : 'Create Playbook' }}
              </button>
            </div>
          </div>
        }

        @if (playbooks().length === 0 && !showCreateForm()) {
          <nxt1-state-view
            title="No playbooks yet"
            message="Generate team playbooks with Agent X or create one manually."
            icon="grid"
          />
        }

        @if (playbooks().length > 0) {
          <div class="playbooks-grid" role="list" aria-label="Team playbooks">
            @for (playbook of playbooks(); track playbook.id) {
              @if (deletingPlaybookId() === playbook.id) {
                <div class="playbook-card-static playbook-card--confirm">
                  <p class="delete-msg">
                    Delete <strong>{{ playbook.name }}</strong
                    >? This cannot be undone.
                  </p>
                  <div class="form-actions">
                    <button type="button" class="btn-cancel" (click)="cancelDeletePlaybook()">
                      Keep
                    </button>
                    <button
                      type="button"
                      class="btn-delete-confirm"
                      [disabled]="saving()"
                      (click)="deletePlaybook(playbook.id)"
                    >
                      {{ saving() ? 'Deleting…' : 'Delete' }}
                    </button>
                  </div>
                </div>
              } @else if (editingPlaybookId() === playbook.id) {
                <div class="playbook-card-static playbook-card--editing">
                  <h4 class="form-heading">Edit</h4>
                  <input
                    class="form-input"
                    placeholder="Name *"
                    [value]="editPlaybookForm().name"
                    (input)="patchEditPlaybook('name', $event)"
                  />
                  <input
                    class="form-input"
                    placeholder="Season"
                    [value]="editPlaybookForm().season"
                    (input)="patchEditPlaybook('season', $event)"
                  />
                  <div class="form-actions">
                    <button type="button" class="btn-cancel" (click)="cancelEditPlaybook()">
                      Cancel
                    </button>
                    <button
                      type="button"
                      class="btn-save"
                      [disabled]="saving()"
                      (click)="saveEditPlaybook(playbook.id)"
                    >
                      {{ saving() ? 'Saving…' : 'Save' }}
                    </button>
                  </div>
                </div>
              } @else {
                <button
                  type="button"
                  class="playbook-card"
                  role="listitem"
                  (click)="selectPlaybook(playbook)"
                  [attr.aria-label]="'Open playbook ' + (playbook.title || playbook.name)"
                >
                  <span class="card-title">{{ playbook.title || playbook.name }}</span>
                  <div class="card-meta-row">
                    <span>{{ playbook.sport | titlecase }}</span>
                    @if (playbook.season) {
                      <span>{{ playbook.season }}</span>
                    }
                  </div>
                  <div class="card-metrics">
                    <span>{{ playbook.playCount ?? 0 }} plays</span>
                    <span>{{ formatDate(playbook.updatedAt || playbook.createdAt) }}</span>
                  </div>
                  <div class="card-crud-row">
                    <button
                      type="button"
                      class="icon-btn icon-btn--sm"
                      title="Edit"
                      (click)="startEditPlaybook(playbook, $event)"
                    >
                      <nxt1-icon name="pencil" [size]="12"></nxt1-icon>
                    </button>
                    <button
                      type="button"
                      class="icon-btn icon-btn--sm icon-btn--danger"
                      title="Delete"
                      (click)="confirmDeletePlaybook(playbook, $event)"
                    >
                      <nxt1-icon name="trash" [size]="12"></nxt1-icon>
                    </button>
                  </div>
                </button>
              }
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .playbooks-panel {
        height: 100%;
        overflow: auto;
        padding: var(--nxt1-spacing-3, 12px);
        color: var(--agent-text-primary, #1a1a1a);
        scrollbar-color: var(--agent-border, rgba(0, 0, 0, 0.08)) transparent;
      }

      /* ── List Header ── */
      .playbooks-list-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 12px;
        gap: 8px;
      }
      .playbooks-list-header h3 {
        margin: 0;
        font-size: 0.95rem;
        letter-spacing: 0.01em;
      }
      .playbooks-list-header p {
        margin: 4px 0 0;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 0.76rem;
      }

      .btn-new {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-primary, #ccff00);
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.12));
        color: var(--agent-text-primary, #1a1a1a);
        font-size: 0.75rem;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .btn-new:hover {
        background: rgba(204, 255, 0, 0.22);
      }

      /* ── Grid ── */
      .playbooks-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }

      .playbook-card {
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 8px;
        position: relative;
        min-height: 110px;
        border-radius: var(--nxt1-radius-md, 12px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        padding: var(--nxt1-spacing-3, 12px);
        color: var(--agent-text-primary, #1a1a1a);
        cursor: pointer;
        transition:
          transform 120ms ease,
          border-color 120ms ease,
          background 120ms ease;
        width: 100%;
        padding-bottom: 40px;
      }
      .playbook-card:hover {
        transform: translateY(-1px);
        border-color: var(--agent-primary, #ccff00);
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
      }

      .card-crud-row {
        display: flex;
        align-items: center;
        gap: 4px;
        position: absolute;
        left: 8px;
        bottom: 8px;
      }

      .playbook-card-static {
        border-radius: var(--nxt1-radius-md, 12px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .card-title {
        font-size: 0.82rem;
        font-weight: 700;
        line-height: 1.3;
        display: block;
      }

      .card-meta-row,
      .card-metrics {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 0.7rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }
      .card-meta-row span + span::before {
        content: '·';
        margin-right: 6px;
        opacity: 0.4;
      }

      /* ── Detail ── */
      .playbook-detail {
        display: grid;
        gap: 14px;
      }

      .detail-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .detail-back-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 0.8rem;
        cursor: pointer;
      }

      .detail-title {
        margin: 0;
        font-size: 1.05rem;
        line-height: 1.3;
      }

      .detail-meta-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
      }

      .meta-item {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        padding: 8px;
      }
      .meta-label {
        display: block;
        font-size: 0.66rem;
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
      }
      .meta-value {
        display: block;
        margin-top: 2px;
        font-size: 0.78rem;
        font-weight: 600;
      }

      /* ── Sections ── */
      .detail-section {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-md, 12px);
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        padding: 12px;
        display: grid;
        gap: 10px;
      }
      .detail-section--meta {
        opacity: 0.7;
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .section-title {
        margin: 0;
        font-size: 0.84rem;
      }
      .section-meta {
        margin: 0;
        font-size: 0.75rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }
      .section-link {
        color: var(--agent-primary, #ccff00);
      }

      .index-group {
        display: grid;
        gap: 6px;
      }
      .index-label {
        font-size: 0.72rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      /* ── Chips ── */
      .chip-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .chip {
        border-radius: 999px;
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.1));
        color: var(--agent-primary, #ccff00);
        padding: 3px 9px;
        font-size: 0.69rem;
        font-weight: 600;
      }
      .chip--soft {
        border-color: var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      /* ── Plays ── */
      .btn-add-play {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: transparent;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 0.72rem;
        font-weight: 600;
        cursor: pointer;
      }
      .btn-add-play:hover {
        border-color: var(--agent-primary, #ccff00);
        color: var(--agent-text-primary, #1a1a1a);
      }

      .plays-list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 9px;
      }

      .play-item {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-sm, 8px);
        padding: 10px;
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-height: 100%;
      }

      .play-actions {
        display: flex;
        justify-content: flex-start;
        gap: 4px;
        order: 99;
        margin-top: auto;
      }

      .play-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .play-head h4 {
        margin: 0;
        font-size: 0.8rem;
      }

      .play-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        font-size: 0.7rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      .play-copy {
        margin: 0;
        font-size: 0.74rem;
      }
      .play-copy--muted {
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      /* ── Diagram ── */
      .diagram-preview-card {
        display: block;
        width: 100%;
        min-height: 120px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        overflow: hidden;
        text-decoration: none;
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
      }
      .diagram-preview-card:hover {
        border-color: var(--agent-primary, #ccff00);
      }
      .diagram-preview-image {
        display: block;
        width: 100%;
        height: 160px;
        object-fit: cover;
      }
      .diagram-preview-fallback {
        min-height: 120px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px dashed var(--agent-border, rgba(0, 0, 0, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 12px;
        font-weight: 600;
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
      }
      .diagram-preview-fallback--empty {
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.5));
      }

      .play-links {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 0.72rem;
      }
      .play-link {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 3px 9px;
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.1));
        color: var(--agent-primary, #ccff00);
        font-size: 11px;
        font-weight: 600;
        text-decoration: none;
      }

      .play-edit-form {
        display: grid;
        gap: 7px;
      }

      .diagram-upload-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .btn-upload-diagram {
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: transparent;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 0.72rem;
        font-weight: 600;
        cursor: pointer;
        height: 28px;
      }
      .btn-upload-diagram:hover {
        border-color: var(--agent-primary, #ccff00);
        color: var(--agent-text-primary, #1a1a1a);
      }

      .diagram-upload-status {
        font-size: 0.7rem;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
      }

      .hidden-file-input {
        display: none;
      }

      /* ── Icon Buttons ── */
      .icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        cursor: pointer;
      }
      .icon-btn:hover {
        border-color: var(--agent-primary, #ccff00);
        color: var(--agent-text-primary, #1a1a1a);
      }
      .icon-btn--sm {
        width: 24px;
        height: 24px;
      }
      .icon-btn--danger:hover {
        border-color: rgb(239, 68, 68);
        color: rgb(239, 68, 68);
        background: rgba(239, 68, 68, 0.06);
      }

      /* ── Forms ── */
      .inline-form {
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        border-radius: var(--nxt1-radius-md, 12px);
        padding: 14px;
        background: var(--agent-surface, rgba(0, 0, 0, 0.03));
        display: grid;
        gap: 8px;
        margin-bottom: 12px;
      }
      .inline-form--plays {
        margin-bottom: 0;
      }
      .form-heading {
        margin: 0;
        font-size: 0.82rem;
        font-weight: 700;
      }
      .form-row {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .form-input {
        width: 100%;
        padding: 7px 10px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: var(--agent-surface-hover, rgba(0, 0, 0, 0.05));
        color: var(--agent-text-primary, #1a1a1a);
        font-size: 0.78rem;
        outline: none;
        box-sizing: border-box;
      }
      .form-input:focus {
        border-color: var(--agent-primary, #ccff00);
      }
      .form-input::placeholder {
        color: var(--agent-text-muted, rgba(0, 0, 0, 0.4));
      }
      .form-textarea {
        resize: vertical;
        min-height: 60px;
      }
      .form-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      .btn-cancel {
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-border, rgba(0, 0, 0, 0.08));
        background: transparent;
        color: var(--agent-text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 0.74rem;
        font-weight: 500;
        cursor: pointer;
        height: 28px;
        white-space: nowrap;
      }
      .btn-save {
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid var(--agent-primary, #ccff00);
        background: var(--agent-primary-glow, rgba(204, 255, 0, 0.15));
        color: var(--agent-text-primary, #1a1a1a);
        font-size: 0.74rem;
        font-weight: 600;
        cursor: pointer;
        height: 28px;
        white-space: nowrap;
      }
      .btn-save:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-delete-confirm {
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-sm, 8px);
        border: 1px solid rgb(239, 68, 68);
        background: rgba(239, 68, 68, 0.1);
        color: rgb(239, 68, 68);
        font-size: 0.74rem;
        font-weight: 600;
        cursor: pointer;
        height: 28px;
        white-space: nowrap;
      }
      .btn-delete-confirm:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .delete-overlay {
        display: grid;
        gap: 10px;
      }
      .delete-msg {
        margin: 0;
        font-size: 0.78rem;
      }

      /* ── Skeleton ── */
      .playbooks-loading {
        display: grid;
        gap: 10px;
      }
      .skeleton-card {
        border-radius: var(--nxt1-radius-md, 12px);
        min-height: 88px;
        background: linear-gradient(
          100deg,
          var(--agent-surface, rgba(0, 0, 0, 0.03)) 20%,
          var(--agent-surface-hover, rgba(0, 0, 0, 0.05)) 45%,
          var(--agent-surface, rgba(0, 0, 0, 0.03)) 70%
        );
        background-size: 200% 100%;
        animation: pulse 1.1s ease-in-out infinite;
      }

      /* ── Responsive ── */
      @media (max-width: 1450px) {
        .playbooks-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      @media (max-width: 1180px) {
        .playbooks-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .detail-meta-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 760px) {
        .playbooks-grid {
          grid-template-columns: minmax(0, 1fr);
        }
        .plays-list {
          grid-template-columns: minmax(0, 1fr);
        }
        .detail-meta-grid {
          grid-template-columns: minmax(0, 1fr);
        }
      }

      @keyframes pulse {
        0% {
          background-position: 100% 0;
        }
        100% {
          background-position: -100% 0;
        }
      }
    `,
  ],
})
export class AgentXPlaybooksPanelComponent {
  private readonly http = inject(HttpClient);
  private readonly agentX = inject(AgentXService);
  private readonly baseUrl = `${inject(AGENT_X_API_BASE_URL)}/agent-x`;

  // ── Read state ──────────────────────────────────────────────────────────────
  protected readonly loading = signal(true);
  protected readonly detailLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly _teamId = signal<string | null>(null);
  protected readonly playbooks = signal<readonly PlaybookSummary[]>([]);
  protected readonly selectedPlaybook = signal<PlaybookDetail | null>(null);

  // ── CRUD: Playbook ───────────────────────────────────────────────────────────
  protected readonly showCreateForm = signal(false);
  protected readonly newPlaybook = signal<NewPlaybookForm>({ ...EMPTY_NEW_PLAYBOOK });
  protected readonly editingPlaybookId = signal<string | null>(null);
  protected readonly editPlaybookForm = signal<EditPlaybookForm>({ ...EMPTY_EDIT_PLAYBOOK });
  protected readonly deletingPlaybookId = signal<string | null>(null);
  protected readonly editingMeta = signal(false);
  protected readonly saving = signal(false);

  // ── CRUD: Play ───────────────────────────────────────────────────────────────
  protected readonly showAddPlayForm = signal(false);
  protected readonly addPlayForm = signal<PlayForm>({ ...EMPTY_PLAY_FORM });
  protected readonly editingPlayIndex = signal<number | null>(null);
  protected readonly editPlayForm = signal<PlayForm>({ ...EMPTY_PLAY_FORM });
  protected readonly editPlayDiagramFile = signal<File | null>(null);
  protected readonly deletingPlayIndex = signal<number | null>(null);
  protected readonly savingPlay = signal(false);
  protected readonly editPlayDiagramFileName = computed(
    () => this.editPlayDiagramFile()?.name ?? ''
  );

  // ── Computed ─────────────────────────────────────────────────────────────────
  protected readonly showingDetail = computed(
    () => this.detailLoading() || this.selectedPlaybook() !== null
  );
  protected readonly hasTeamContext = computed(() => {
    const id = this._teamId();
    return typeof id === 'string' && id.trim().length > 0;
  });
  protected readonly totalPlays = computed(() => this.selectedPlaybook()?.plays?.length ?? 0);
  protected readonly hasIndexes = computed(() => {
    const s = this.selectedPlaybook();
    if (!s) return false;
    return !!(
      s.conceptTagIndex?.length ||
      s.formationIndex?.length ||
      s.personnelIndex?.length ||
      s.categoryIndex?.length
    );
  });

  @Input()
  set teamId(value: string | null | undefined) {
    const normalized = typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
    if (normalized === this._teamId()) return;
    this._teamId.set(normalized);
    this.clearSelection();
    void this.loadPlaybooks();
  }

  constructor() {
    void this.loadPlaybooks();
  }

  protected clearSelection(): void {
    this.selectedPlaybook.set(null);
    this.detailLoading.set(false);
    this.editingMeta.set(false);
    this.cancelEditPlay();
    this.cancelAddPlay();
    this.deletingPlayIndex.set(null);
  }

  protected reload(): void {
    this.clearSelection();
    void this.loadPlaybooks();
  }

  protected selectPlaybook(playbook: PlaybookSummary): void {
    this.detailLoading.set(true);
    this.selectedPlaybook.set(null);
    void this.loadPlaybookDetail(playbook.id);
  }

  // ── Playbook CRUD ────────────────────────────────────────────────────────────

  protected startCreate(): void {
    this.newPlaybook.set({ ...EMPTY_NEW_PLAYBOOK });
    this.showCreateForm.set(true);
  }
  protected cancelCreate(): void {
    this.showCreateForm.set(false);
    this.newPlaybook.set({ ...EMPTY_NEW_PLAYBOOK });
  }
  protected patchNewPlaybook(field: keyof NewPlaybookForm, event: Event): void {
    this.newPlaybook.update((p) => ({ ...p, [field]: (event.target as HTMLInputElement).value }));
  }
  protected async createPlaybook(): Promise<void> {
    const form = this.newPlaybook();
    if (!form.name.trim() || !form.sport.trim()) return;
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.post<MutationResponse>(`${this.baseUrl}/playbooks`, {
          teamId: this._teamId(),
          name: toTitleCase(form.name),
          sport: form.sport.trim().toLowerCase(),
          season: form.season.trim() || undefined,
        })
      );
      this.cancelCreate();
      await this.loadPlaybooks();
    } catch {
      /* surface via next error state */
    } finally {
      this.saving.set(false);
    }
  }

  protected startEditPlaybook(playbook: PlaybookSummary, event: Event): void {
    event.stopPropagation();
    this.editingPlaybookId.set(playbook.id);
    this.editPlaybookForm.set({
      name: playbook.name,
      season: playbook.season ?? '',
      source: playbook.source ?? '',
    });
  }
  protected cancelEditPlaybook(): void {
    this.editingPlaybookId.set(null);
    this.editPlaybookForm.set({ ...EMPTY_EDIT_PLAYBOOK });
  }
  protected patchEditPlaybook(field: keyof EditPlaybookForm, event: Event): void {
    this.editPlaybookForm.update((p) => ({
      ...p,
      [field]: (event.target as HTMLInputElement).value,
    }));
  }
  protected async saveEditPlaybook(playbookId: string): Promise<void> {
    const form = this.editPlaybookForm();
    if (!form.name.trim()) return;
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.patch<MutationResponse>(`${this.baseUrl}/playbooks/${playbookId}`, {
          name: toTitleCase(form.name),
          season: form.season.trim() || null,
          source: form.source.trim() || null,
        })
      );
      this.cancelEditPlaybook();
      this.editingMeta.set(false);
      if (this.selectedPlaybook()?.id === playbookId) {
        await this.loadPlaybookDetail(playbookId);
      } else {
        await this.loadPlaybooks();
      }
    } catch {
      /* noop */
    } finally {
      this.saving.set(false);
    }
  }

  protected startEditMeta(): void {
    const pb = this.selectedPlaybook();
    if (!pb) return;
    this.editPlaybookForm.set({ name: pb.name, season: pb.season ?? '', source: pb.source ?? '' });
    this.editingMeta.set(true);
  }
  protected cancelEditMeta(): void {
    this.editingMeta.set(false);
    this.editPlaybookForm.set({ ...EMPTY_EDIT_PLAYBOOK });
  }

  protected confirmDeletePlaybook(playbook: PlaybookSummary, event: Event): void {
    event.stopPropagation();
    this.deletingPlaybookId.set(playbook.id);
  }
  protected cancelDeletePlaybook(): void {
    this.deletingPlaybookId.set(null);
  }
  protected async deletePlaybook(playbookId: string): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.delete<MutationResponse>(`${this.baseUrl}/playbooks/${playbookId}`)
      );
      this.deletingPlaybookId.set(null);
      await this.loadPlaybooks();
    } catch {
      /* noop */
    } finally {
      this.saving.set(false);
    }
  }

  // ── Play CRUD ────────────────────────────────────────────────────────────────

  protected startAddPlay(): void {
    this.addPlayForm.set({ ...EMPTY_PLAY_FORM });
    this.showAddPlayForm.set(true);
  }
  protected cancelAddPlay(): void {
    this.showAddPlayForm.set(false);
    this.addPlayForm.set({ ...EMPTY_PLAY_FORM });
  }
  protected patchAddPlayForm(field: keyof PlayForm, event: Event): void {
    this.addPlayForm.update((p) => ({
      ...p,
      [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value,
    }));
  }
  protected async addPlay(): Promise<void> {
    const form = this.addPlayForm();
    const playbook = this.selectedPlaybook();
    if (!form.name.trim() || !playbook) return;
    this.savingPlay.set(true);
    try {
      await firstValueFrom(
        this.http.post<MutationResponse>(`${this.baseUrl}/playbooks/${playbook.id}/plays`, {
          name: toTitleCase(form.name),
          series: form.series.trim() || undefined,
          category: form.category.trim() || undefined,
          formation: form.formation.trim() || undefined,
          personnel: form.personnel.trim() || undefined,
          objective: form.objective.trim() || undefined,
          installNotes: form.installNotes.trim() || undefined,
          diagramUrl: form.diagramUrl.trim() || undefined,
          conceptTags: parseTags(form.conceptTags),
        })
      );
      this.cancelAddPlay();
      await this.loadPlaybookDetail(playbook.id);
    } catch {
      /* noop */
    } finally {
      this.savingPlay.set(false);
    }
  }

  protected async startEditPlay(index: number, play: PlaybookPlay): Promise<void> {
    this.editingPlayIndex.set(index);
    this.editPlayDiagramFile.set(null);
    this.editPlayForm.set({
      name: play.name ?? play.title ?? '',
      series: play.series ?? '',
      category: play.category ?? '',
      formation: play.formation ?? '',
      personnel: play.personnel ?? '',
      objective: play.objective ?? '',
      installNotes: play.installNotes ?? '',
      conceptTags: (play.conceptTags ?? []).join(', '),
      diagramUrl: play.diagramUrl ?? '',
    });

    if (play.diagramUrl) {
      await this.seedDiagramEditInAgentChat(play);
    }
  }
  protected cancelEditPlay(): void {
    this.editingPlayIndex.set(null);
    this.editPlayForm.set({ ...EMPTY_PLAY_FORM });
    this.editPlayDiagramFile.set(null);
  }
  protected patchEditPlayForm(field: keyof PlayForm, event: Event): void {
    this.editPlayForm.update((p) => ({
      ...p,
      [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value,
    }));
  }
  protected async saveEditPlay(index: number): Promise<void> {
    const form = this.editPlayForm();
    const playbook = this.selectedPlaybook();
    if (!form.name.trim() || !playbook) return;
    this.savingPlay.set(true);
    try {
      const uploadedDiagramUrl = await this.uploadEditPlayDiagramIfNeeded();
      const nextDiagramUrl =
        uploadedDiagramUrl ?? (form.diagramUrl.trim().length ? form.diagramUrl.trim() : undefined);

      await firstValueFrom(
        this.http.patch<MutationResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/plays/${index}`,
          {
            name: toTitleCase(form.name),
            series: form.series.trim() || undefined,
            category: form.category.trim() || undefined,
            formation: form.formation.trim() || undefined,
            personnel: form.personnel.trim() || undefined,
            objective: form.objective.trim() || undefined,
            installNotes: form.installNotes.trim() || undefined,
            diagramUrl: nextDiagramUrl,
            conceptTags: parseTags(form.conceptTags),
          }
        )
      );
      this.cancelEditPlay();
      await this.loadPlaybookDetail(playbook.id);
    } catch {
      /* noop */
    } finally {
      this.savingPlay.set(false);
    }
  }

  protected onEditDiagramFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    const file = target?.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      if (target) target.value = '';
      return;
    }
    this.editPlayDiagramFile.set(file);
    if (target) target.value = '';
  }

  protected confirmDeletePlay(index: number): void {
    this.deletingPlayIndex.set(index);
  }
  protected cancelDeletePlay(): void {
    this.deletingPlayIndex.set(null);
  }
  protected async deletePlay(index: number): Promise<void> {
    const playbook = this.selectedPlaybook();
    if (!playbook) return;
    this.savingPlay.set(true);
    try {
      await firstValueFrom(
        this.http.delete<MutationResponse>(
          `${this.baseUrl}/playbooks/${playbook.id}/plays/${index}`
        )
      );
      this.deletingPlayIndex.set(null);
      await this.loadPlaybookDetail(playbook.id);
    } catch {
      /* noop */
    } finally {
      this.savingPlay.set(false);
    }
  }

  // ── Formatters ───────────────────────────────────────────────────────────────

  protected formatDate(value?: string): string {
    if (!value) return 'Unknown';
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return value;
    return new Date(parsed).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  protected isImageUrl(url?: string): boolean {
    if (!url) return false;
    return /\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(url);
  }

  private async uploadEditPlayDiagramIfNeeded(): Promise<string | null> {
    const file = this.editPlayDiagramFile();
    if (!file) return null;

    const formData = new FormData();
    formData.append('file', file);

    const response = await firstValueFrom(
      this.http.post<UploadAttachmentResponse>(`${this.baseUrl}/upload`, formData)
    );

    if (!response.success || !response.data?.url) {
      throw new Error(response.error ?? 'Failed to upload diagram');
    }

    return response.data.url;
  }

  private async seedDiagramEditInAgentChat(play: PlaybookPlay): Promise<void> {
    const diagramUrl = play.diagramUrl?.trim();
    if (!diagramUrl) return;

    const playName = (play.title || play.name || 'this play').trim();
    const prompt = `Edit this play diagram for "${playName}". Keep the concept intact, improve spacing and labels, and return an updated diagram.`;

    const fetchedFile = await this.fetchDiagramAsFile(diagramUrl, playName);
    if (fetchedFile) {
      this.agentX.addFiles([fetchedFile]);
      this.agentX.setUserMessage(prompt);
      return;
    }

    this.agentX.setUserMessage(`${prompt}\n\nSource diagram: ${diagramUrl}`);
  }

  private async fetchDiagramAsFile(diagramUrl: string, playName: string): Promise<File | null> {
    try {
      const response = await fetch(diagramUrl);
      if (!response.ok) return null;

      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) return null;

      const safeBaseName =
        playName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'play-diagram';
      const extension = this.getImageExtension(blob.type, diagramUrl);
      return new File([blob], `${safeBaseName}.${extension}`, { type: blob.type });
    } catch {
      return null;
    }
  }

  private getImageExtension(mimeType: string, diagramUrl: string): string {
    if (mimeType === 'image/png') return 'png';
    if (mimeType === 'image/jpeg') return 'jpg';
    if (mimeType === 'image/webp') return 'webp';
    if (mimeType === 'image/gif') return 'gif';
    if (mimeType === 'image/svg+xml') return 'svg';

    const urlMatch = diagramUrl.match(/\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i);
    if (urlMatch?.[1]) {
      return urlMatch[1].toLowerCase().replace('jpeg', 'jpg');
    }
    return 'png';
  }

  // ── Loaders ──────────────────────────────────────────────────────────────────

  private async loadPlaybooks(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const teamId = this._teamId();
    if (!teamId) {
      this.playbooks.set([]);
      this.loading.set(false);
      return;
    }
    try {
      const response = await firstValueFrom(
        this.http.get<PlaybooksResponse>(`${this.baseUrl}/playbooks`, {
          params: { limit: '16', teamId },
        })
      );
      if (!response.success || !response.data)
        throw new Error(response.error ?? 'Unable to load playbooks.');
      this.playbooks.set(response.data.playbooks ?? []);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Unable to load playbooks.');
      this.playbooks.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPlaybookDetail(playbookId: string): Promise<void> {
    const teamId = this._teamId();
    if (!teamId) {
      this.selectedPlaybook.set(null);
      this.detailLoading.set(false);
      return;
    }
    try {
      const response = await firstValueFrom(
        this.http.get<PlaybookDetailResponse>(`${this.baseUrl}/playbooks/${playbookId}`, {
          params: { teamId },
        })
      );
      if (
        !response.success ||
        !response.data?.playbook ||
        response.data.playbook.teamId !== teamId
      ) {
        throw new Error(response.error ?? 'Unable to load playbook detail.');
      }
      this.selectedPlaybook.set(response.data.playbook);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Unable to load playbook detail.');
      this.selectedPlaybook.set(null);
    } finally {
      this.detailLoading.set(false);
    }
  }
}
