import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { Router } from '@angular/router';
import { SeoService } from '../web/seo.service';
import type { SeoConfig } from '@nxt1/core/seo';

describe('SeoService (SSR canonical + JSON-LD)', () => {
  let service: SeoService;
  let documentRef: Document;

  beforeAll(() => {
    try {
      getTestBed().initTestEnvironment(
        BrowserDynamicTestingModule,
        platformBrowserDynamicTesting()
      );
    } catch (error) {
      const message = String(error);
      if (!message.includes('Cannot set base providers because it has already been called')) {
        throw error;
      }
    }
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SeoService,
        Meta,
        Title,
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: Router, useValue: { url: '/test-route' } },
      ],
    });

    service = TestBed.inject(SeoService);
    documentRef = TestBed.inject(DOCUMENT);
  });

  afterEach(() => {
    if (!documentRef?.head) {
      return;
    }

    const managedCanonical = documentRef.head.querySelectorAll(
      'link[rel="canonical"][data-nxt1-seo="true"]'
    );
    managedCanonical.forEach((node) => node.remove());

    const managedStructuredData = documentRef.head.querySelectorAll(
      'script[type="application/ld+json"][data-nxt1-seo="true"]'
    );
    managedStructuredData.forEach((node) => node.remove());
  });

  it('renders canonical and structured data when running on server platform', () => {
    const config: SeoConfig = {
      page: {
        title: 'Athlete Profile',
        description: 'Profile overview',
        canonicalUrl: 'https://nxt1sports.com/profile/basketball/jane-doe/123456',
      },
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'ProfilePage',
        name: 'Jane Doe',
      },
    };

    service.applySeoConfig(config);

    const canonical = documentRef.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"][data-nxt1-seo="true"]'
    );
    const structuredDataScript = documentRef.head.querySelector<HTMLScriptElement>(
      'script[type="application/ld+json"][data-nxt1-seo="true"]'
    );

    expect(canonical).toBeTruthy();
    expect(canonical?.href).toContain('https://nxt1sports.com/profile/basketball/jane-doe/123456');

    expect(structuredDataScript).toBeTruthy();
    expect(structuredDataScript?.text).toContain('"@type":"ProfilePage"');
    expect(structuredDataScript?.text).toContain('"name":"Jane Doe"');
  });

  it('replaces previous managed canonical and JSON-LD on subsequent updates', () => {
    service.applySeoConfig({
      page: {
        title: 'First',
        description: 'First description',
        canonicalUrl: 'https://nxt1sports.com/first',
      },
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'First Schema',
      },
    });

    service.applySeoConfig({
      page: {
        title: 'Second',
        description: 'Second description',
        canonicalUrl: 'https://nxt1sports.com/second',
      },
      structuredData: {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Second Schema',
      },
    });

    const canonicalTags = documentRef.head.querySelectorAll(
      'link[rel="canonical"][data-nxt1-seo="true"]'
    );
    const structuredDataTags = documentRef.head.querySelectorAll(
      'script[type="application/ld+json"][data-nxt1-seo="true"]'
    );

    expect(canonicalTags.length).toBe(1);
    expect(structuredDataTags.length).toBe(1);

    const canonical = canonicalTags.item(0) as HTMLLinkElement;
    const structuredData = structuredDataTags.item(0) as HTMLScriptElement;

    expect(canonical.href).toContain('https://nxt1sports.com/second');
    expect(structuredData.text).toContain('"name":"Second Schema"');
    expect(structuredData.text).not.toContain('"name":"First Schema"');
  });
});
