/**
 * 二维码显示组件
 * 显示从活动海报中提取的二维码，支持下载
 */

import React from 'react';
import type { QRCodeInfo } from '@frontend/types';
import './QRCodeDisplay.css';

interface QRCodeDisplayProps {
  qrCodes: QRCodeInfo[];
  onDownload?: (qrCode: QRCodeInfo) => void;
  onRemove?: (qrCodeId: string) => void;
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  qrCodes,
  onDownload,
  onRemove
}) => {
  if (!qrCodes || qrCodes.length === 0) {
    return null;
  }

  const handleDownload = (qrCode: QRCodeInfo) => {
    if (onDownload) {
      onDownload(qrCode);
      return;
    }

    // 默认下载逻辑
    if (!qrCode.imageData) {
      console.warn('[QRCodeDisplay] 该二维码没有图片数据');
      return;
    }

    const link = document.createElement('a');
    link.href = qrCode.imageData;
    link.download = `qr_${qrCode.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log('[QRCodeDisplay] ✅ 二维码已下载:', link.download);
  };

  return (
    <div className="qrcode-display-container">
      <div className="qrcode-display-header">
        <h4>📱 识别的二维码 ({qrCodes.length})</h4>
      </div>
      
      <div className="qrcode-display-list">
        {qrCodes.map((qr) => (
          <div key={qr.id} className="qrcode-item">
            {/* 二维码图片 */}
            {qr.imageData && (
              <div className="qrcode-image">
                <img src={qr.imageData} alt={qr.metadata?.title || 'QR Code'} />
              </div>
            )}

            {/* 二维码信息 */}
            <div className="qrcode-info">
              <div className="qrcode-title">
                {qr.metadata?.title || qr.type.toUpperCase()}
              </div>
              
              {qr.metadata?.description && (
                <div className="qrcode-description">
                  {qr.metadata.description}
                </div>
              )}

              {qr.url && (
                <div className="qrcode-url">
                  <a href={qr.url} target="_blank" rel="noopener noreferrer">
                    {qr.url.length > 50 ? qr.url.substring(0, 50) + '...' : qr.url}
                  </a>
                </div>
              )}

              {qr.metadata?.action && (
                <div className="qrcode-action">
                  建议操作: {qr.metadata.action}
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="qrcode-actions">
              {/* 下载按钮 */}
              {qr.imageData && (
                <button
                  type="button"
                  className="qrcode-btn qrcode-btn-download"
                  onClick={() => handleDownload(qr)}
                  title="下载二维码图片"
                >
                  💾
                </button>
              )}

              {/* 打开链接按钮 */}
              {qr.url && (
                <button
                  type="button"
                  className="qrcode-btn qrcode-btn-open"
                  onClick={() => window.open(qr.url, '_blank')}
                  title={qr.metadata?.action || '打开链接'}
                >
                  🔗
                </button>
              )}

              {/* 删除按钮 */}
              {onRemove && (
                <button
                  type="button"
                  className="qrcode-btn qrcode-btn-remove"
                  onClick={() => onRemove(qr.id)}
                  title="删除"
                >
                  ❌
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
