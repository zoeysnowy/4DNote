module.exports = {
  extends: [
    'react-app',
    'react-app/jest'
  ],
  rules: {
    // 🚫 禁止使用 toISOString() - 违反 TimeSpec 规范
    'no-restricted-syntax': [
      'error',
      {
        selector: "CallExpression[callee.property.name='toISOString']",
        message: '❌ 禁止使用 toISOString()！\n' +
          '原因：ISO 8601 格式（T 分隔符）会被 Outlook 误认为 UTC 时间，造成时区偏移。\n' +
          '✅ 正确做法：\n' +
          '  - 格式化时间：使用 formatTimeForStorage(date)\n' +
          '  - 解析时间：使用 parseLocalTimeString(str)\n' +
          '  - TimeSpec 格式：YYYY-MM-DD HH:mm:ss（空格分隔符，本地时间）\n' +
          '详见：docs/TimeSpec.md'
      },
      {
        selector: "MemberExpression[property.name='toISOString']",
        message: '❌ 禁止访问 toISOString 属性！请使用 formatTimeForStorage() 代替。'
      }
    ],
    
    // 🚫 禁止将空格替换为 T（ISO 格式转换）
    'no-restricted-properties': [
      'error',
      {
        object: 'String',
        property: 'replace',
        message: '⚠️ 注意：如果你在用 replace() 将空格转为 "T"，这是 ISO 格式转换，请使用 formatTimeForStorage() 代替。'
      }
    ]
  },
  overrides: [
    {
      // 允许在 timeUtils.ts 中使用（工具函数封装层）
      files: ['**/utils/timeUtils.ts'],
      rules: {
        'no-restricted-syntax': 'off'
      }
    },
    {
      // 允许在测试文件和日志文件中使用
      files: ['**/*.test.ts', '**/*.test.tsx', '**/debug*.ts', '**/performance*.ts'],
      rules: {
        'no-restricted-syntax': 'warn' // 降级为警告
      }
    }
  ]
};
