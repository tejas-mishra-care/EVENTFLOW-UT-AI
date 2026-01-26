import React from 'react';
import QRCode from 'react-qr-code';

type QRProps = React.ComponentProps<typeof QRCode>;

interface QRErrorBoundaryProps {
  children: React.ReactNode;
}

interface QRErrorBoundaryState {
  hasError: boolean;
}

class QRErrorBoundary extends React.Component<QRErrorBoundaryProps, QRErrorBoundaryState> {
  public state: QRErrorBoundaryState;

  constructor(props: QRErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): QRErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: any, info?: any) {
    // You could log to an external service here
    // Keep console.error for local debugging
    console.error('SafeQRCode caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-slate-100 flex items-center justify-center" style={{ width: '100%', height: '100%' }}>
          <span className="text-xs text-slate-400">QR unavailable</span>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

export const SafeQRCode: React.FC<QRProps> = (props) => {
  // Defensive check: ensure value is non-empty string
  const value = typeof props.value === 'string' ? props.value.trim() : '';
  if (!value) {
    return (
      <div className="bg-slate-100 flex items-center justify-center" style={{ width: (props.size as number) || 100, height: (props.size as number) || 100 }}>
        <span className="text-xs text-slate-400">No data</span>
      </div>
    );
  }

  // Debug info in development to help track unexpected QR values
  if (process.env.NODE_ENV !== 'production') {
    try {
      // eslint-disable-next-line no-console
      console.debug('SafeQRCode value length:', value.length, 'sample:', value.slice(0, 120));
    } catch (e) {
      // ignore
    }
  }

  return (
    <QRErrorBoundary>
      {/* Filter out any undefined props (some callers may pass undefined error-correction props) */}
      {(() => {
        const safeEntries = Object.entries(props).filter(([, v]) => v !== undefined);
        const safeProps = Object.fromEntries(safeEntries) as QRProps;
        return <QRCode {...safeProps} value={value} />;
      })()}
    </QRErrorBoundary>
  );
};

export default SafeQRCode;
