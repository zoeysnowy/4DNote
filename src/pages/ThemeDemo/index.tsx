import React, { useEffect, useMemo, useState } from 'react';

import PageContainer from '@frontend/components/common/PageContainer';
import { ContentPanelPickersDemo } from './ContentPanelPickersDemo';
import { TagDropdownPickerDemo } from './TagDropdownPickerDemo';
import './ThemeDemoPage.css';

type ThemeFamily = {
  name: string;
  vars: string[];
};

type BrandFamily = {
  name: string;
  vars: string[];
};

const families: ThemeFamily[] = [
  { name: 'Red', vars: ['--tag-red-1', '--tag-red-2', '--tag-red-3', '--tag-red-4', '--tag-red-5', '--tag-red-6'] },
  { name: 'Orange', vars: ['--tag-orange-1', '--tag-orange-2', '--tag-orange-3', '--tag-orange-4', '--tag-orange-5', '--tag-orange-6'] },
  { name: 'Yellow', vars: ['--tag-yellow-1', '--tag-yellow-2', '--tag-yellow-3', '--tag-yellow-4', '--tag-yellow-5', '--tag-yellow-6'] },
  { name: 'Green', vars: ['--tag-green-1', '--tag-green-2', '--tag-green-3', '--tag-green-4', '--tag-green-5', '--tag-green-6'] },
  { name: 'Cyan', vars: ['--tag-cyan-1', '--tag-cyan-2', '--tag-cyan-3', '--tag-cyan-4', '--tag-cyan-5', '--tag-cyan-6'] },
  { name: 'Blue', vars: ['--tag-blue-1', '--tag-blue-2', '--tag-blue-3', '--tag-blue-4', '--tag-blue-5', '--tag-blue-6'] },
  { name: 'Purple', vars: ['--tag-purple-1', '--tag-purple-2', '--tag-purple-3', '--tag-purple-4', '--tag-purple-5', '--tag-purple-6'] },
  { name: 'Gray', vars: ['--tag-gray-1', '--tag-gray-2', '--tag-gray-3', '--tag-gray-4', '--tag-gray-5', '--tag-gray-6'] }
];

const brandAccents = ['--brand-accent-purple', '--brand-accent-blue', '--brand-accent-pink', '--brand-accent-neutral'];

const brandFamilies: BrandFamily[] = [
  {
    name: 'Smoked Purple',
    vars: ['--brand-smoked-purple-1', '--brand-smoked-purple-2', '--brand-smoked-purple-3', '--brand-smoked-purple-4', '--brand-smoked-purple-5', '--brand-smoked-purple-6']
  },
  {
    name: 'Rustic Red',
    vars: ['--brand-rustic-red-1', '--brand-rustic-red-2', '--brand-rustic-red-3', '--brand-rustic-red-4', '--brand-rustic-red-5']
  },
  {
    name: 'Ginger Yellow',
    vars: ['--brand-ginger-yellow-1', '--brand-ginger-yellow-2', '--brand-ginger-yellow-3', '--brand-ginger-yellow-4', '--brand-ginger-yellow-5']
  },
  {
    name: 'Deep Pine',
    vars: ['--brand-deep-pine-1', '--brand-deep-pine-2', '--brand-deep-pine-3', '--brand-deep-pine-4', '--brand-deep-pine-5']
  },
  {
    name: 'Glacier Blue',
    vars: ['--brand-glacier-blue-1', '--brand-glacier-blue-2', '--brand-glacier-blue-3', '--brand-glacier-blue-4', '--brand-glacier-blue-5']
  },
  {
    name: 'Periwinkle',
    vars: ['--brand-periwinkle-1', '--brand-periwinkle-2', '--brand-periwinkle-3', '--brand-periwinkle-4', '--brand-periwinkle-5']
  },
  {
    name: 'Graphite',
    vars: ['--brand-graphite-1', '--brand-graphite-2', '--brand-graphite-3', '--brand-graphite-4', '--brand-graphite-5']
  }
];

const AGREED_ELEVATION_SHADOW = '0 10px 15px -3px rgba(0, 0, 0, 0.12), 0 4px 6px -2px rgba(0, 0, 0, 0.08)';

const ThemeDemoPage: React.FC = () => {
  const [activeFloatbarTools, setActiveFloatbarTools] = useState<Set<string>>(() => new Set(['bold']));
  const [activeMenuKey, setActiveMenuKey] = useState<string>('active');

  const demoCalendars = useMemo(() => {
    return [
      { id: 'cal-main', name: '日历', color: 'var(--brand-accent-purple)' },
      { id: 'cal-bday', name: 'My Calendar Birthdays', color: 'var(--brand-accent-blue)' },
      { id: 'cal-3x3', name: '#3x3', color: 'var(--ui-text-muted)' },
      { id: 'cal-3x3-work', name: '#3x3_工作', color: 'var(--tag-blue-4)' },
      { id: 'cal-3x3-meeting', name: '#3x3_会议', color: 'var(--tag-blue-5)' },
      { id: 'cal-3x3-social', name: '#3x3_社交', color: 'var(--tag-green-4)' },
      { id: 'cal-3x3-sport', name: '#3x3_运动', color: 'var(--tag-orange-4)' },
      { id: 'cal-3x3-life', name: '#3x3_生活', color: 'var(--tag-red-4)' },
    ];
  }, []);

  const demoTags = useMemo(() => {
    return [
      { id: 'tag-work', name: '工作', color: 'var(--tag-blue-4)', emoji: '🔒', level: 0 },
      { id: 'tag-dev', name: '4DNote开发', color: 'var(--tag-purple-4)', emoji: '🧑‍💻', parentId: 'tag-work', level: 1 },
      { id: 'tag-meeting', name: '会议', color: 'var(--tag-blue-5)', emoji: '👩‍💼', parentId: 'tag-work', level: 1 },
      { id: 'tag-life', name: '生活', color: 'var(--tag-red-4)', emoji: '🍒', level: 0 },
      { id: 'tag-badminton', name: '羽毛球', color: 'var(--tag-yellow-4)', emoji: '🏸', parentId: 'tag-life', level: 1 },
    ];
  }, []);

  const cssModules = useMemo(() => {
    return import.meta.glob<string>('../../**/*.css', { as: 'raw' }) as Record<string, () => Promise<string>>;
  }, []);

  const cssPaths = useMemo(() => Object.keys(cssModules).sort(), [cssModules]);

  type Histogram = Record<string, number>;

  type AuditResult = {
    totalFiles: number;
    categories: Array<{ name: string; count: number; files: string[] }>;
    borderRadius: Array<{ value: string; count: number }>;
    boxShadow: Array<{ value: string; count: number }>;
    zIndex: Array<{ value: string; count: number }>;
    overlayColors: Array<{ value: string; count: number }>;
  };

  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const normalizePath = (path: string) => path.replace(/^\.\.\/\.\.\//, 'src/');

    const bump = (hist: Histogram, key: string) => {
      const k = key.trim();
      if (!k) return;
      hist[k] = (hist[k] ?? 0) + 1;
    };

    const sortHist = (hist: Histogram, limit = 12) => {
      return Object.entries(hist)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([value, count]) => ({ value, count }));
    };

    const classify = (filePath: string) => {
      const p = filePath.toLowerCase();

      // More specific buckets first (avoid accidental capture by generic “modal”).
      // Mention menus are effectively “pickers” (autocomplete dropdowns).
      if (p.includes('mention')) return 'Picker / Selector';

      // Multi-layer / toggle pickers (tree/tag-style selectors)
      if (
        p.includes('hierarchicaltagpicker') ||
        p.includes('tagpicker') ||
        p.includes('eventtree') ||
        (p.includes('tag') && (p.includes('picker') || p.includes('manager')))
      ) {
        return 'Picker / Multi-layer';
      }

      if (p.includes('picker') || p.includes('calendar')) return 'Picker / Calendar';
      if (p.includes('slate') || p.includes('editor') || p.includes('eventeditmodal')) return 'Editor';
      if (p.includes('menu') || p.includes('dropdown')) return 'Menu / Dropdown';
      if (p.includes('toolbar') || p.includes('floating')) return 'FloatingBar / Toolbar';
      if (p.includes('card')) return 'Card';
      if (p.includes('layout') || p.includes('sidebar') || p.includes('pagecontainer')) return 'Layout / Navigation';
      if (p.includes('tag')) return 'Tag';
      if (p.includes('chart')) return 'Chart';

      // Generic modal/dialog bucket last.
      if (p.includes('modal') || p.includes('dialog')) return 'Modal / Dialog';

      return 'Other';
    };

    const run = async () => {
      try {
        const borderRadiusHist: Histogram = {};
        const boxShadowHist: Histogram = {};
        const zIndexHist: Histogram = {};
        const overlayColorHist: Histogram = {};

        const categoryToFiles = new Map<string, string[]>();

        await Promise.all(
          cssPaths.map(async (rawPath) => {
            const normalized = normalizePath(rawPath);
            const category = classify(normalized);
            const list = categoryToFiles.get(category) ?? [];
            list.push(normalized);
            categoryToFiles.set(category, list);

            const cssText = await cssModules[rawPath]();

            const radiusRe = /border-radius\s*:\s*([^;]+);/gi;
            for (const match of cssText.matchAll(radiusRe)) {
              bump(borderRadiusHist, match[1]);
            }

            const shadowRe = /box-shadow\s*:\s*([^;]+);/gi;
            for (const match of cssText.matchAll(shadowRe)) {
              bump(boxShadowHist, match[1].replace(/\s+/g, ' ').trim());
            }

            const zIndexRe = /z-index\s*:\s*(-?\d+)\s*;/gi;
            for (const match of cssText.matchAll(zIndexRe)) {
              bump(zIndexHist, match[1]);
            }

            const overlayRe = /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*(0?\.\d+|1(?:\.0+)?)\s*\)/gi;
            for (const match of cssText.matchAll(overlayRe)) {
              bump(overlayColorHist, `rgba(0, 0, 0, ${match[1]})`);
            }
          })
        );

        const categories = Array.from(categoryToFiles.entries())
          .map(([name, files]) => ({ name, count: files.length, files: files.sort() }))
          .sort((a, b) => b.count - a.count);

        const result: AuditResult = {
          totalFiles: cssPaths.length,
          categories,
          borderRadius: sortHist(borderRadiusHist, 10),
          boxShadow: sortHist(boxShadowHist, 8),
          zIndex: sortHist(zIndexHist, 12),
          overlayColors: sortHist(overlayColorHist, 8)
        };

        if (!cancelled) {
          setAudit(result);
          setAuditError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setAudit(null);
          setAuditError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [cssModules, cssPaths]);

  const recommendedRadius = useMemo(() => {
    const top = audit?.borderRadius?.[0]?.value;
    return top ?? '12px';
  }, [audit]);

  const preferredLargeRadius = useMemo(() => {
    const m = /^(-?\d+(?:\.\d+)?)px$/.exec(recommendedRadius.trim());
    if (!m) return '16px';
    const n = Number(m[1]);
    if (!Number.isFinite(n)) return '16px';
    return `${Math.max(16, Math.round(n + 4))}px`;
  }, [recommendedRadius]);

  const recommendedShadow = useMemo(() => {
    // ThemeDemo “After” is an explicit spec, not a statistical mode.
    // The audit histogram is useful as an inventory, but it must not drive UI rules.
    return AGREED_ELEVATION_SHADOW;
  }, []);

  const recommendedOverlay = useMemo(() => {
    const top = audit?.overlayColors?.[0]?.value;
    return top ?? 'rgba(0, 0, 0, 0.5)';
  }, [audit]);

  return (
    <PageContainer className="theme-demo theme-demo-page-container">
      <div className="theme-demo-card">
        <div className="theme-demo-title">Theme Tokens Demo</div>
        <div className="theme-demo-muted">
          This page previews CSS variables from <code>src/styles/theme.css</code>.
        </div>
      </div>

      <div className="theme-demo-card">
        <div className="theme-demo-title">Typography</div>
        <div style={{ color: 'var(--ui-text)', fontSize: 18, fontWeight: 700 }}>Heading / 标题</div>
        <div style={{ color: 'var(--ui-text)', fontSize: 14, marginTop: 6 }}>
          Body text / 正文：Segoe UI should render emoji ✅ ⏱️ 📌
        </div>
        <div className="theme-demo-muted" style={{ fontSize: 14, marginTop: 6 }}>
          Muted text / 次级文字
        </div>
      </div>

      <div className="theme-demo-card theme-demo-card--transparent">
        <div className="theme-demo-title">Surfaces</div>
        <div className="theme-demo-row">
          <div
            style={{
              width: 140,
              height: 54,
              borderRadius: 12,
              background: 'var(--ui-surface-strong)',
              border: '1px solid var(--ui-border)'
            }}
          />
          <div
            style={{
              width: 140,
              height: 54,
              borderRadius: 12,
              background: 'var(--ui-surface)',
              border: '1px solid var(--ui-border)'
            }}
          />
          <div
            style={{
              width: 140,
              height: 54,
              borderRadius: 12,
              background: 'var(--ui-surface-soft)',
              border: '1px solid var(--ui-border)'
            }}
          />
        </div>
      </div>

      <div className="theme-demo-card">
        <div className="theme-demo-title">Buttons</div>
        <div className="theme-demo-row">
          <button className="theme-demo-btn primary" type="button">Primary</button>
          <button className="theme-demo-btn secondary" type="button">Secondary</button>
          <button className="theme-demo-btn danger" type="button">Danger</button>
        </div>
      </div>

      <div className="theme-demo-card">
        <div className="theme-demo-title">APP Colorcode</div>

        <div className="theme-demo-row" style={{ alignItems: 'flex-end' }}>
          {brandAccents.map((v) => (
            <div
              key={v}
              className="theme-swatch"
              title={v}
              style={{ background: `var(${v})`, height: 36, width: 72 }}
            />
          ))}
        </div>

        {brandFamilies.map((family) => (
          <div key={family.name} className="theme-family">
            <div className="theme-family-name">{family.name}</div>
            <div className="theme-palette theme-palette--5">
              {family.vars.map((v) => (
                <div key={v} className="theme-swatch" title={v} style={{ background: `var(${v})` }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="theme-demo-card">
        <div className="theme-demo-title">Tag Palette</div>
        {families.map((family) => (
          <div key={family.name} className="theme-family">
            <div className="theme-family-name">{family.name}</div>
            <div className="theme-palette">
              {family.vars.map((v) => (
                <div key={v} className="theme-swatch" title={v} style={{ background: `var(${v})` }} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="theme-demo-card">
        <div className="theme-demo-title">CSS Inventory (Auto)</div>
        <div className="theme-demo-muted">
          Enumerates all <code>src/**/*.css</code> and extracts repeated style values.
        </div>

        <div className="theme-demo-row" style={{ marginTop: 10 }}>
          <div className="theme-demo-pill">Total CSS files: {audit?.totalFiles ?? cssPaths.length}</div>
          {auditError ? <div className="theme-demo-pill theme-demo-pill--danger">Audit error: {auditError}</div> : null}
        </div>

        <div className="theme-demo-grid" style={{ marginTop: 12 }}>
          <div className="theme-demo-subcard">
            <div className="theme-demo-subtitle">Categories</div>
            {audit ? (
              <div className="theme-demo-details-list">
                {audit.categories.map((cat) => (
                  <details key={cat.name}>
                    <summary>
                      <span>{cat.name}</span>
                      <span className="theme-demo-badge">{cat.count}</span>
                    </summary>
                    <div className="theme-demo-filelist">
                      {cat.files.map((f) => (
                        <div key={f} className="theme-demo-file">{f}</div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <div className="theme-demo-muted">Auditing…</div>
            )}
          </div>

          <div className="theme-demo-subcard">
            <div className="theme-demo-subtitle">Most Common Values (Before)</div>
            {!audit ? (
              <div className="theme-demo-muted">Auditing…</div>
            ) : (
              <div className="theme-demo-kv">
                <div className="theme-demo-kv-row">
                  <div className="theme-demo-kv-key">border-radius</div>
                  <div className="theme-demo-kv-val">
                    {audit.borderRadius.map((x) => (
                      <div key={x.value} className="theme-demo-kv-item">
                        <code>{x.value}</code>
                        <span className="theme-demo-kv-count">×{x.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="theme-demo-kv-row">
                  <div className="theme-demo-kv-key">box-shadow</div>
                  <div className="theme-demo-kv-val">
                    {audit.boxShadow.map((x) => (
                      <div key={x.value} className="theme-demo-kv-item">
                        <code>{x.value}</code>
                        <span className="theme-demo-kv-count">×{x.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="theme-demo-kv-row">
                  <div className="theme-demo-kv-key">z-index</div>
                  <div className="theme-demo-kv-val">
                    {audit.zIndex.map((x) => (
                      <div key={x.value} className="theme-demo-kv-item">
                        <code>{x.value}</code>
                        <span className="theme-demo-kv-count">×{x.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="theme-demo-kv-row">
                  <div className="theme-demo-kv-key">overlay rgba(0,0,0,a)</div>
                  <div className="theme-demo-kv-val">
                    {audit.overlayColors.length ? (
                      audit.overlayColors.map((x) => (
                        <div key={x.value} className="theme-demo-kv-item">
                          <code>{x.value}</code>
                          <span className="theme-demo-kv-count">×{x.count}</span>
                        </div>
                      ))
                    ) : (
                      <div className="theme-demo-muted">No rgba(0,0,0,α) found.</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="theme-demo-card">
        <div className="theme-demo-title">Spec Gallery (Before / After)</div>
        <div className="theme-demo-muted">
          “Before” shows representative variants found in existing CSS. “After” shows a proposed consistent spec (demo-only styles).
        </div>

        <div className="spec-gallery" style={{ marginTop: 12 }}>
          <div className="spec-block">
            <div className="spec-header">Modal / Dialog</div>
            <div className="spec-columns">
              <div className="spec-col">
                <div className="spec-label">Before</div>
                <div className="spec-canvas" style={{ background: recommendedOverlay }}>
                  <div className="spec-modal" style={{ borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                    <div className="spec-modal-title">Dialog Title</div>
                    <div className="spec-modal-body">Mixed radius/shadow across modals.</div>
                    <div className="spec-modal-actions">
                      <button className="theme-demo-btn secondary" type="button">Cancel</button>
                      <button className="theme-demo-btn primary" type="button">OK</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="spec-col">
                <div className="spec-label">After</div>
                <div className="spec-canvas" style={{ background: recommendedOverlay }}>
                  <div className="spec-modal spec-modal--after" style={{ borderRadius: preferredLargeRadius, boxShadow: recommendedShadow }}>
                    <div className="spec-modal-title">Dialog Title</div>
                    <div className="spec-modal-body">Standardized radius + shadow (agreed spec).</div>
                    <div className="spec-modal-actions">
                      <button className="theme-demo-btn secondary" type="button">Cancel</button>
                      <button className="theme-demo-btn primary" type="button">OK</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="spec-block">
            <div className="spec-header">Card</div>
            <div className="spec-note">
              Taxonomy: container card / elevated dashboard card / micro hover card. (Demo-only; we’re not refactoring production.)
            </div>

            <div className="spec-variants">
              <div className="spec-variant">
                <div className="spec-variant-title">Container Card (base)</div>
                <div className="spec-columns">
                  <div className="spec-col">
                    <div className="spec-label">Before</div>
                    <div className="spec-canvas spec-canvas--flat">
                      <div
                        className="spec-card"
                        style={{
                          borderRadius: '12px',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)'
                        }}
                      >
                        <div className="spec-card-title">DashboardCard</div>
                        <div className="spec-card-body">Radius/shadow vary across cards.</div>
                      </div>
                    </div>
                  </div>
                  <div className="spec-col">
                    <div className="spec-label">After</div>
                    <div className="spec-canvas spec-canvas--flat">
                      <div
                        className="spec-card spec-card--after"
                        style={{
                          borderRadius: preferredLargeRadius,
                          boxShadow: recommendedShadow
                        }}
                      >
                        <div className="spec-card-title">Card (spec)</div>
                        <div className="spec-card-body">One spec radius + one spec shadow.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="spec-variant">
                <div className="spec-variant-title">Elevated Dashboard Card (stats)</div>
                <div className="spec-columns">
                  <div className="spec-col">
                    <div className="spec-label">Before</div>
                    <div className="spec-canvas spec-canvas--flat">
                      <div
                        className="spec-card"
                        style={{
                          borderRadius: '16px',
                          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)'
                        }}
                      >
                        <div className="spec-card-title">DailyStatsCard / TimerCard</div>
                        <div className="spec-card-body">Different “premium” shadows exist.</div>
                      </div>
                    </div>
                  </div>
                  <div className="spec-col">
                    <div className="spec-label">After</div>
                    <div className="spec-canvas spec-canvas--flat">
                      <div
                        className="spec-card spec-card--after"
                        style={{
                          borderRadius: preferredLargeRadius,
                          boxShadow: recommendedShadow
                        }}
                      >
                        <div className="spec-card-title">Card (spec)</div>
                        <div className="spec-card-body">Same spec recipe, regardless of module.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="spec-variant">
                <div className="spec-variant-title">Micro Hover Card (popover-like)</div>
                <div className="spec-columns">
                  <div className="spec-col">
                    <div className="spec-label">Before</div>
                    <div className="spec-canvas spec-canvas--flat">
                      <div
                        className="spec-card"
                        style={{
                          width: 240,
                          borderRadius: '20px',
                          boxShadow: '0px 4px 10px 0px rgba(0, 0, 0, 0.25)'
                        }}
                      >
                        <div className="spec-card-title">TimeHoverCard</div>
                        <div className="spec-card-body">Often more rounded + heavier shadow.</div>
                      </div>
                    </div>
                  </div>
                  <div className="spec-col">
                    <div className="spec-label">After</div>
                    <div className="spec-canvas spec-canvas--flat">
                      <div
                        className="spec-card spec-card--after"
                        style={{
                          width: 240,
                          borderRadius: preferredLargeRadius,
                          boxShadow: recommendedShadow
                        }}
                      >
                        <div className="spec-card-title">Micro Card (spec)</div>
                        <div className="spec-card-body">Use same radius/shadow system.</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="spec-block">
            <div className="spec-header">Menu / Dropdown</div>
            <div className="spec-columns">
              <div className="spec-col">
                <div className="spec-label">Before</div>
                <div className="spec-canvas spec-canvas--flat">
                  <div className="spec-menu" style={{ borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                    <div className="spec-menu-item">Item</div>
                    <div className="spec-menu-item spec-menu-item--hover">Hover</div>
                    <div className="spec-menu-item">Item</div>
                  </div>
                </div>
              </div>
              <div className="spec-col">
                <div className="spec-label">After</div>
                <div className="spec-canvas spec-canvas--flat">
                  <div className="spec-menu spec-menu--after" style={{ borderRadius: preferredLargeRadius, boxShadow: recommendedShadow }}>
                    {(
                      [
                        { key: 'normal', label: 'Item' },
                        { key: 'hover', label: 'Hover sample', forceHover: true },
                        { key: 'active', label: 'Active (click to switch)' }
                      ] as const
                    ).map((item) => {
                      const selected = activeMenuKey === item.key;
                      const forceHover = 'forceHover' in item && Boolean(item.forceHover);
                      return (
                        <div
                          key={item.key}
                          className={`spec-menu-item${forceHover ? ' spec-menu-item--hover' : ''}`}
                          role="menuitem"
                          aria-selected={selected}
                          onClick={() => setActiveMenuKey(item.key)}
                        >
                          {item.label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="spec-block">
            <div className="spec-header">FloatingBar / Toolbar</div>
            <div className="spec-columns">
              <div className="spec-col">
                <div className="spec-label">Before</div>
                <div className="spec-canvas spec-canvas--flat">
                  <div className="spec-floatbar" style={{ borderRadius: '18px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
                    <button className="spec-floatbar-btn">B</button>
                    <button className="spec-floatbar-btn">I</button>
                    <button className="spec-floatbar-btn">⏱</button>
                    <button className="spec-floatbar-btn">⋯</button>
                  </div>
                </div>
              </div>
              <div className="spec-col">
                <div className="spec-label">After</div>
                <div className="spec-canvas spec-canvas--flat">
                  <div className="spec-floatbar spec-floatbar--after" style={{ borderRadius: '18px', boxShadow: recommendedShadow }}>
                    {(
                      [
                        { key: 'bold', label: 'B' },
                        { key: 'italic', label: 'I' },
                        { key: 'timer', label: '⏱' },
                        { key: 'more', label: '⋯' }
                      ] as const
                    ).map((t) => {
                      const pressed = activeFloatbarTools.has(t.key);
                      return (
                        <button
                          key={t.key}
                          className="spec-floatbar-btn spec-floatbar-btn--after"
                          type="button"
                          aria-pressed={pressed}
                          onClick={() => {
                            setActiveFloatbarTools((prev) => {
                              const next = new Set(prev);
                              if (next.has(t.key)) next.delete(t.key);
                              else next.add(t.key);
                              return next;
                            });
                          }}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="theme-demo-card">
        <div className="theme-demo-title">Isolated Pickers (review)</div>
        <div className="theme-demo-muted">
          复刻 sidebar 的 Tag/Calendar 选择区（task-tree + calendar-tree），但不渲染完整 sidebar panel。
        </div>

        <div className="theme-demo-content-panel-pickers" style={{ marginTop: 12, maxWidth: 360 }}>
          <ContentPanelPickersDemo tags={demoTags} calendars={demoCalendars} defaultExpandedTagIds={['tag-work', 'tag-life']} />

          <div style={{ height: 12 }} />

          <div className="theme-demo-muted" style={{ marginBottom: 8 }}>
            TagPicker dropdown（对比用，不改动上面的原始 section）
          </div>
          <TagDropdownPickerDemo tags={demoTags} defaultExpandedTagIds={['tag-work', 'tag-life']} />
        </div>
      </div>
    </PageContainer>
  );
};

export default ThemeDemoPage;
