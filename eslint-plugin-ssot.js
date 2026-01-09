/**
 * ESLint Plugin for SSOT Architecture Rules
 * 
 * 静态代码检查规则，在编译/提交前捕获违反SSOT架构的代码
 * 
 * 使用方法：
 * 1. 在 .eslintrc.js 中添加：
 *    rules: {
 *      '@local/ssot/no-deprecated-event-fields': 'warn',
 *      '@local/ssot/no-iso-time-format': 'error',
 *      '@local/ssot/no-signal-fields-in-event': 'error',
 *    }
 * 
 * @created 2026-01-09
 * @version 1.0.0
 */

module.exports = {
  rules: {
    /**
     * 禁止使用deprecated的Event字段
     */
    'no-deprecated-event-fields': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow deprecated Event fields (isTask, isPlan, content, etc.)',
          category: 'SSOT Architecture',
          recommended: true,
        },
        messages: {
          deprecatedField: '{{ field }} is deprecated. Use {{ replacement }} instead.',
        },
        schema: [],
      },
      create(context) {
        const DEPRECATED_FIELDS = {
          isTask: 'hasTaskFacet(event)',
          isPlan: 'shouldShowInPlan(event)',
          isTimeCalendar: 'shouldShowInTimeCalendar(event)',
          content: 'event.title.fullTitle or resolveDisplayTitle(event)',
          isTimer: 'event.id.startsWith("timer-")',
          isTimeLog: 'event.source === "local:timelog"',
          isOutsideApp: 'event.source === "local:timelog"',
        };

        return {
          // 检测 event.isTask 这样的访问
          MemberExpression(node) {
            if (node.property.type === 'Identifier') {
              const fieldName = node.property.name;
              if (fieldName in DEPRECATED_FIELDS) {
                context.report({
                  node,
                  messageId: 'deprecatedField',
                  data: {
                    field: fieldName,
                    replacement: DEPRECATED_FIELDS[fieldName],
                  },
                });
              }
            }
          },
          
          // 检测对象字面量中的赋值: { isTask: true }
          Property(node) {
            if (node.key.type === 'Identifier') {
              const fieldName = node.key.name;
              if (fieldName in DEPRECATED_FIELDS && node.value.type !== 'Identifier') {
                // 允许解构，但不允许直接赋值
                context.report({
                  node,
                  messageId: 'deprecatedField',
                  data: {
                    field: fieldName,
                    replacement: DEPRECATED_FIELDS[fieldName],
                  },
                });
              }
            }
          },
        };
      },
    },

    /**
     * 禁止使用 toISOString() 或 toJSON() 格式化时间
     */
    'no-iso-time-format': {
      meta: {
        type: 'error',
        docs: {
          description: 'Disallow ISO time format (toISOString, toJSON) for Event time fields',
          category: 'SSOT Architecture',
          recommended: true,
        },
        messages: {
          isoTimeMethod: 'Do not use {{ method }}() for time fields. Use formatTimeForStorage() instead.',
        },
        schema: [],
      },
      create(context) {
        return {
          CallExpression(node) {
            if (
              node.callee.type === 'MemberExpression' &&
              node.callee.property.type === 'Identifier' &&
              (node.callee.property.name === 'toISOString' || 
               node.callee.property.name === 'toJSON')
            ) {
              // 检查是否在Event相关的上下文中
              const sourceCode = context.getSourceCode();
              const text = sourceCode.getText(node.parent);
              
              // 简单启发式：检查是否赋值给时间字段
              const timeFieldPattern = /(startTime|endTime|createdAt|updatedAt|deletedAt|lastSyncTime|dueDateTime|lastNonBlankAt|capturedAt)\s*[:=]/;
              
              if (timeFieldPattern.test(text)) {
                context.report({
                  node,
                  messageId: 'isoTimeMethod',
                  data: {
                    method: node.callee.property.name,
                  },
                });
              }
            }
          },
        };
      },
    },

    /**
     * 禁止在Event中添加Signal相关字段
     */
    'no-signal-fields-in-event': {
      meta: {
        type: 'error',
        docs: {
          description: 'Disallow Signal-related fields in Event interface',
          category: 'SSOT Architecture',
          recommended: true,
        },
        messages: {
          signalField: 'Do not add Signal field "{{ field }}" to Event. Use SignalService instead.',
        },
        schema: [],
      },
      create(context) {
        const FORBIDDEN_SIGNAL_FIELDS = [
          'isHighlight',
          'hasQuestions',
          'signalCount',
          'importanceLevel',
          'isImportant',
          'hasDoubt',
          'needsAction',
        ];

        return {
          Property(node) {
            if (node.key.type === 'Identifier') {
              const fieldName = node.key.name;
              if (FORBIDDEN_SIGNAL_FIELDS.includes(fieldName)) {
                context.report({
                  node,
                  messageId: 'signalField',
                  data: {
                    field: fieldName,
                  },
                });
              }
            }
          },
        };
      },
    },
  },
};
