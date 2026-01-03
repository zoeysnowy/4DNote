/**
 * ErrorBoundary - React 错误边界组件
 * 用于捕获子组件树中的 JavaScript 错误，防止整个应用崩溃
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    // 更新 state 使下一次渲染能够显示降级后的 UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 记录错误到日志服务
    console.error('🚨 [ErrorBoundary] Component Error:', error);
    console.error('🚨 [ErrorBoundary] Error Info:', errorInfo);

    this.setState({
      error,
      errorInfo
    });

    // 调用自定义错误处理回调
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      // 如果提供了自定义 fallback UI，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认错误 UI
      return (
        <div style={{
          padding: '20px',
          margin: '20px',
          border: '2px solid #f44336',
          borderRadius: '8px',
          backgroundColor: '#ffebee',
          fontFamily: 'monospace'
        }}>
          <h2 style={{ color: '#d32f2f', marginTop: 0 }}>
            ⚠️ 组件渲染错误
          </h2>
          <p style={{ color: '#666' }}>
            组件在渲染过程中遇到了问题，但不会影响其他功能。
          </p>
          {this.state.error && (
            <details style={{ marginTop: '10px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold', color: '#d32f2f' }}>
                查看错误详情
              </summary>
              <pre style={{
                marginTop: '10px',
                padding: '10px',
                backgroundColor: '#fff',
                border: '1px solid #ccc',
                borderRadius: '4px',
                overflow: 'auto',
                maxHeight: '200px',
                fontSize: '12px'
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo && (
                  <>
                    {'\n\n'}
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </pre>
            </details>
          )}
          <button
            onClick={this.handleReset}
            style={{
              marginTop: '15px',
              padding: '8px 16px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            🔄 重新加载组件
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
