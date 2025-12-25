import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

// 自定义插件：阻止 Vite 解析 better-sqlite3
function ignoreBetterSqlite3() {
  return {
    name: 'ignore-better-sqlite3',
    resolveId(id: string) {
      if (id === 'better-sqlite3') {
        // 返回特殊的外部模块标记
        return '\0virtual:better-sqlite3';
      }
      return null;
    },
    load(id: string) {
      if (id === '\0virtual:better-sqlite3') {
        // 返回空的模块导出（在 Web 环境下不会被使用）
        return 'export default {};';
      }
      return null;
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr(),
    tsconfigPaths(),
    ignoreBetterSqlite3(),
  ],
  server: {
    port: 3000,
    open: true,
    host: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'build',
    sourcemap: false,
    rollupOptions: {
      external: [
        'better-sqlite3', // Node.js 原生模块，仅在 Electron 中可用
      ],
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['antd', '@headlessui/react'],
          'vendor-editor': ['slate', 'slate-react', 'slate-history', '@tiptap/react'],
          'vendor-calendar': ['dayjs', 'chrono-node'],
        },
      },
    },
  },
  optimizeDeps: {
    // 只扫描主入口，避免 public/docs/_archive/.history 等大量调试页面里的 ESM 脚本影响预构建
    entries: ['index.html'],
    include: [
      'react',
      'react-dom',
      'antd',
      'dayjs',
      '@microsoft/microsoft-graph-client',
    ],
    exclude: [
      'better-sqlite3', // Node.js 原生模块，排除预构建
    ],
  },
  // 外部化 Node.js 模块（仅 Electron 环境需要）
  ssr: {
    noExternal: [], // 保持默认
  },
});
