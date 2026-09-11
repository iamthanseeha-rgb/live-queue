import React from 'react';

export default function LandingPage({ onGetStarted, onSignIn, onGoHome, onNavigate }) {
  const whatsappUrl = "https://wa.me/918921677207?text=Hi%20LiveQueue%20Team%2C%20I%20saw%20your%20app%20and%20want%20to%20know%20more%20about%20setting%20it%20up%3A";

  const advantages = [
    {
      title: 'Zero Hardware Cost',
      desc: 'Display your live queue on any existing Smart TV, Android TV box, tablet, or monitor. No need to purchase expensive LED token machines.',
      icon: '📺'
    },
    {
      title: 'Live Mobile Tracking',
      desc: 'Patients scan the counter QR code to watch their live token position right from their phone. They can wait outside, in vehicles, or nearby without losing their turn.',
      icon: '📱'
    },
    {
      title: 'Instant 1-Tap Calling',
      desc: 'Advance or manage tokens from your phone, reception desk, or doctor consultation room with zero lag across screens.',
      icon: '⚡'
    },
    {
      title: 'Flexible Pay-As-You-Go',
      desc: 'No expensive recurring software lock-ins. Get 1,500 complimentary calls upon signup, then recharge only as needed from ₹99.',
      icon: '💳'
    },
    {
      title: 'Instant Printable Posters',
      desc: 'Automatically generate and print clean A4 QR posters for your entrance or reception counter in a single click.',
      icon: '🖨️'
    },
    {
      title: 'Custom Clinic URL',
      desc: 'Choose your own vanity web address (like livequeue.co.in/dr-adam) that patients can remember and check anytime.',
      icon: '🔗'
    }
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#222222', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 72, padding: '0 24px', borderBottom: '1px solid #f0f0f0', maxWidth: 1100, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={onGoHome}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #FF385C 0%, #E00B41 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(255, 56, 92, 0.3)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="7" y1="8" x2="17" y2="8" />
              <line x1="7" y1="12" x2="13" y2="12" />
              <line x1="7" y1="16" x2="10" y2="16" />
            </svg>
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: '#222222' }}>
            live<span style={{ color: '#FF385C' }}>queue</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onSignIn}
            style={{ background: 'transparent', color: '#222222', border: '1px solid #dddddd', padding: '9px 18px', borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            Sign In
          </button>
          <button
            onClick={onGetStarted}
            style={{ background: 'linear-gradient(90deg, #FF385C 0%, #E00B41 100%)', color: '#ffffff', border: 'none', padding: '10px 18px', borderRadius: 999, fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 10px rgba(255, 56, 92, 0.25)' }}
          >
            Get Started
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{ textAlign: 'center', padding: '56px 20px 40px', maxWidth: 840, margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          backgroundColor: '#fff1f2',
          border: '1px solid #fecdd3',
          color: '#FF385C',
          padding: '6px 16px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          marginBottom: 20
        }}>
          Smart Queue Display for Clinics & Consultations
        </div>

        <h1 style={{ fontSize: 'clamp(2.3rem, 6vw, 3.8rem)', fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.03em', margin: '0 0 18px', color: '#111827' }}>
          Eliminate Waiting Room Crowding in Under 60 Seconds
        </h1>

        <p style={{ fontSize: 'clamp(1.05rem, 3vw, 1.25rem)', color: '#4b5563', lineHeight: 1.6, maxWidth: 640, margin: '0 auto 32px' }}>
          Transform any TV, tablet, or phone into a live digital token screen. Patients track their turns from their own smartphones while you call tokens with 1 tap.
        </p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={onGetStarted}
            style={{
              background: 'linear-gradient(90deg, #FF385C 0%, #E00B41 100%)',
              color: '#ffffff',
              border: 'none',
              padding: '16px 36px',
              borderRadius: 999,
              fontSize: 16,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 18px rgba(255, 56, 92, 0.35)'
            }}
          >
            Create Free Host Desk ↗
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: '#ffffff',
              color: '#374151',
              border: '1.5px solid #d1d5db',
              padding: '16px 26px',
              borderRadius: 999,
              fontSize: 15,
              fontWeight: 700,
              textDecoration: 'none',
              cursor: 'pointer'
            }}
          >
            Ask on WhatsApp
          </a>
        </div>

        <div style={{ marginTop: 24, fontSize: 13, color: '#9ca3af', fontWeight: 500 }}>
          ✓ Instant Setup • No Credit Card Required • 1,500 Complimentary Calls
        </div>
      </section>

      {/* Feature Cards Grid */}
      <section style={{ maxWidth: 1040, margin: '20px auto 60px', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {advantages.map((item, idx) => (
            <div key={idx} style={{
              backgroundColor: '#ffffff',
              border: '1.5px solid #ffe4e6',
              borderRadius: 24,
              padding: '28px 22px',
              boxShadow: '0 12px 32px -6px rgba(255, 56, 92, 0.08), 0 4px 12px rgba(0,0,0,0.02)',
              textAlign: 'left'
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{item.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px', color: '#111827' }}>{item.title}</h3>
              <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.55 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3 Steps Section */}
      <section style={{ backgroundColor: '#fffdfd', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6', padding: '50px 20px', textAlign: 'center' }}>
        <div style={{ maxWidth: 840, margin: '0 auto' }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px', color: '#111827' }}>
            How It Works in 3 Simple Steps
          </h2>
          <p style={{ color: '#6b7280', fontSize: 15, margin: '0 0 36px' }}>Ready to run in under 2 minutes right in your browser.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, textAlign: 'left' }}>
            <div style={{ background: '#ffffff', padding: '24px 20px', borderRadius: 20, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#FF385C', marginBottom: 6 }}>STEP 1</div>
              <h4 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: '#111827' }}>Create Your Desk</h4>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>Sign up with your email to get your private controller and unique counter link.</p>
            </div>
            <div style={{ background: '#ffffff', padding: '24px 20px', borderRadius: 20, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#FF385C', marginBottom: 6 }}>STEP 2</div>
              <h4 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: '#111827' }}>Open on TV & Print QR</h4>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>Display the link on your waiting area screen and print the QR poster for patients.</p>
            </div>
            <div style={{ background: '#ffffff', padding: '24px 20px', borderRadius: 20, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#FF385C', marginBottom: 6 }}>STEP 3</div>
              <h4 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: '#111827' }}>Call Next Patient</h4>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>Tap "+1 Next Token" on your mobile or PC as each consultation completes.</p>
            </div>
          </div>

          <div style={{ marginTop: 36 }}>
            <button
              onClick={onGetStarted}
              style={{
                background: 'linear-gradient(90deg, #FF385C 0%, #E00B41 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '14px 32px',
                borderRadius: 999,
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(255, 56, 92, 0.3)'
              }}
            >
              Set Up Your Desk Now ↗
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '32px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        maxWidth: 960,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        gap: 12,
        fontSize: 13,
        color: '#717171',
        textAlign: 'center',
        marginTop: 'auto'
      }}>
        <div>
          © {new Date().getFullYear()} LiveQueue. All rights reserved.
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
          <button
            onClick={() => onNavigate('contact')}
            style={{ background: 'none', border: 'none', color: '#717171', cursor: 'pointer', padding: 0, fontSize: 13 }}
          >
            Contact Us
          </button>
          <button
            onClick={() => onNavigate('privacy')}
            style={{ background: 'none', border: 'none', color: '#717171', cursor: 'pointer', padding: 0, fontSize: 13 }}
          >
            Privacy Policy
          </button>
          <button
            onClick={() => onNavigate('terms')}
            style={{ background: 'none', border: 'none', color: '#717171', cursor: 'pointer', padding: 0, fontSize: 13 }}
          >
            Terms of Service
          </button>
          <button
            onClick={() => onNavigate('refunds')}
            style={{ background: 'none', border: 'none', color: '#717171', cursor: 'pointer', padding: 0, fontSize: 13 }}
          >
            Refund Policy
          </button>
        </div>
      </footer>
    </div>
  );
}