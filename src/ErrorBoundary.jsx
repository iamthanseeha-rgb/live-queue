import { Component } from 'react';

// Last line of defence: an unexpected error shows a way home instead of a blank white page.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('LiveQueue crashed:', error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', textAlign: 'center', color: '#222222', background: '#ffffff' }}>
        <div style={{ maxWidth: 360 }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ color: '#64748b', fontSize: 15, margin: '0 0 20px' }}>Reload the page, or go back to the LiveQueue home page.</p>
          <a href="/" style={{ display: 'inline-block', background: '#C8093A', color: '#ffffff', padding: '12px 24px', borderRadius: 999, textDecoration: 'none', fontWeight: 700 }}>Go to home page</a>
        </div>
      </div>
    );
  }
}
