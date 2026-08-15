import { Component, type ErrorInfo, type ReactNode } from 'react';
import { CircleAlert as AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'حدث خطأ غير متوقع' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-cream-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full card text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-forest-900 mb-2">حدث خطأ في التطبيق</h1>
            <p className="text-sm text-charcoal-500 mb-6">
              {this.state.message || 'يرجى تحديث الصفحة أو المحاولة لاحقاً.'}
            </p>
            <button type="button" onClick={this.handleReload} className="btn btn-primary w-full">
              <RefreshCw className="w-4 h-4" />
              تحديث الصفحة
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
