import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean; errorMessage: string };

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[CustomerPortal] Unhandled render error', error, info.componentStack);
  }

  handleReload(): void {
    window.location.reload();
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div dir="rtl" lang="he" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '2rem', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</p>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>אירעה שגיאה בלתי צפויה</h1>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1.5rem' }}>
            הדף נתקל בבעיה. נסו לרענן — אם הבעיה חוזרת, צרו קשר עם התמיכה.
          </p>
          <button
            onClick={this.handleReload}
            style={{ padding: '0.6rem 1.5rem', borderRadius: '0.5rem', background: '#111827', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.95rem' }}
          >
            רענן דף
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
