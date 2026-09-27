import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { NxtMarkdownEditorComponent } from './markdown-editor.component';

describe('NxtMarkdownEditorComponent', () => {
  it('lets users type when the rich editor has not mounted yet', () => {
    const fixture = TestBed.createComponent(NxtMarkdownEditorComponent);
    const contentChange = vi.fn();
    fixture.componentInstance.contentChange.subscribe(contentChange);
    fixture.detectChanges();

    const fallback = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.nxt-markdown-editor__fallback-action'
    );
    expect(fallback).not.toBeNull();
    fallback?.click();
    fixture.detectChanges();

    const textarea = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
      '.nxt-markdown-editor__fallback-input'
    );
    expect(textarea).not.toBeNull();
    if (!textarea) return;
    textarea.value = '# Practice plan';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    expect(contentChange).toHaveBeenCalledWith('# Practice plan');
    fixture.destroy();
  });

  it('mounts an editable document and emits Markdown when its content changes', async () => {
    const fixture = TestBed.createComponent(NxtMarkdownEditorComponent);
    const contentChange = vi.fn();
    fixture.componentInstance.contentChange.subscribe(contentChange);

    fixture.detectChanges();
    const surface = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.nxt-markdown-editor__surface:not(.nxt-markdown-editor__surface--fallback)'
    );
    expect(surface).not.toBeNull();

    const editorAccess = fixture.componentInstance as unknown as {
      createEditor: () => void;
      editor: Editor;
    };
    Object.defineProperty(fixture.componentInstance, 'editorHost', {
      value: () => ({ nativeElement: surface }),
    });
    editorAccess.createEditor();
    fixture.detectChanges();

    expect(surface?.hidden).toBe(false);
    const editable = surface?.querySelector<HTMLElement>('[contenteditable="true"]');
    expect(editable).not.toBeNull();

    editorAccess.editor.commands.insertContent('Practice plan updated');

    expect(contentChange).toHaveBeenCalledWith(expect.stringContaining('Practice plan updated'));
    fixture.destroy();
  });

  it('creates bullet and numbered lists when formatting text', () => {
    const fixture = TestBed.createComponent(NxtMarkdownEditorComponent);
    fixture.detectChanges();

    const surface = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.nxt-markdown-editor__surface:not(.nxt-markdown-editor__surface--fallback)'
    );
    Object.defineProperty(fixture.componentInstance, 'editorHost', {
      value: () => ({ nativeElement: surface }),
    });
    const editorAccess = fixture.componentInstance as unknown as {
      createEditor: () => void;
      editor: Editor;
    };
    editorAccess.createEditor();
    editorAccess.editor.commands.insertContent('First item');

    editorAccess.editor.commands.toggleBulletList();
    expect(surface?.querySelector('ul li')?.textContent).toContain('First item');

    editorAccess.editor.commands.toggleOrderedList();
    expect(surface?.querySelector('ol li')?.textContent).toContain('First item');
    fixture.destroy();
  });

  it('keeps live checklist text beside the checkbox using TipTap task-item attributes', () => {
    const fixture = TestBed.createComponent(NxtMarkdownEditorComponent);
    fixture.detectChanges();

    const surface = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.nxt-markdown-editor__surface:not(.nxt-markdown-editor__surface--fallback)'
    );
    Object.defineProperty(fixture.componentInstance, 'editorHost', {
      value: () => ({ nativeElement: surface }),
    });
    const editorAccess = fixture.componentInstance as unknown as {
      createEditor: () => void;
      editor: Editor;
    };
    editorAccess.createEditor();
    editorAccess.editor.commands.insertContent('Call the team');
    editorAccess.editor.commands.toggleTaskList();

    const taskItem = surface?.querySelector<HTMLElement>('li[data-checked]');
    expect(taskItem).not.toBeNull();
    expect(taskItem?.hasAttribute('data-type')).toBe(false);
    expect(taskItem?.querySelector(':scope > label input[type="checkbox"]')).not.toBeNull();
    expect(taskItem?.querySelector(':scope > div p')?.textContent).toBe('Call the team');

    fixture.destroy();
  });

  it('renders 5 primary icon tools and toggles the overflow menu with icon and label', () => {
    const fixture = TestBed.createComponent(NxtMarkdownEditorComponent);
    fixture.detectChanges();

    const tools = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(
      '.nxt-markdown-editor__tool:not(.nxt-markdown-editor__tool--more)'
    );
    expect(tools.length).toBe(5);

    for (const tool of tools) {
      expect(tool.querySelector('svg')).not.toBeNull();
    }
    const toolbarMouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    tools[4]?.dispatchEvent(toolbarMouseDown);
    expect(toolbarMouseDown.defaultPrevented).toBe(true);

    const headingOnePaths = tools[0]?.querySelectorAll('svg path');
    const headingTwoPaths = tools[1]?.querySelectorAll('svg path');
    expect(headingOnePaths?.[0]?.getAttribute('d')).toBe(headingTwoPaths?.[0]?.getAttribute('d'));
    expect(headingOnePaths?.[1]?.getAttribute('d')).not.toBe(headingTwoPaths?.[1]?.getAttribute('d'));

    const moreBtn = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.nxt-markdown-editor__tool--more'
    );
    expect(moreBtn).not.toBeNull();
    expect(moreBtn?.querySelector('svg')).not.toBeNull();

    moreBtn?.click();
    fixture.detectChanges();

    const menu = document.querySelector<HTMLElement>('.nxt-markdown-editor__menu');
    expect(menu).not.toBeNull();

    const menuItems = menu?.querySelectorAll<HTMLElement>('.nxt-markdown-editor__menu-item') ?? [];
    expect(menuItems.length).toBe(7);

    for (const item of menuItems) {
      expect(item.querySelector('.nxt-markdown-editor__menu-icon svg')).not.toBeNull();
      expect(item.querySelector('.nxt-markdown-editor__menu-label')?.textContent?.trim().length).toBeGreaterThan(0);
    }

    fixture.destroy();
  });
});