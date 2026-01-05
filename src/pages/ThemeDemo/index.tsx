import React from 'react';

import PageContainer from '@frontend/components/common/PageContainer';
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
    vars: ['--brand-smoked-purple-1', '--brand-smoked-purple-2', '--brand-smoked-purple-3', '--brand-smoked-purple-4', '--brand-smoked-purple-5']
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

const ThemeDemoPage: React.FC = () => {
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
    </PageContainer>
  );
};

export default ThemeDemoPage;
