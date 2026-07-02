'use client';

/**
 * IVarse Technologies — WhatsApp Sales Widget
 * 
 * Includes:
 *  1. WhatsAppFAB     — Floating action button with animated panel
 *  2. WhatsAppTrigger — Inline CTA button (use in hero, contact section)
 *  3. useWhatsApp     — Hook for generating pre-filled deep links
 * 
 * Usage:
 *   import { WhatsAppFAB } from '@/components/WhatsAppWidget';
 *   <WhatsAppFAB phoneNumber="2348XXXXXXXXX" />
 * 
 *   import { WhatsAppTrigger } from '@/components/WhatsAppWidget';
 *   <WhatsAppTrigger phoneNumber="2348XXXXXXXXX" label="Chat with us" context="hero" />
 * 
 *   // After contact form submit:
 *   import { buildWhatsAppLink } from '@/components/WhatsAppWidget';
 *   const link = buildWhatsAppLink({ phone, name, service });
 */

import { useState, useEffect, useCallback } from 'react';

// ─── Config ───────────────────────────────────────────────────────────────────
const IVARSE_WA_NUMBER = process.env.NEXT_PUBLIC_WA_NUMBER || '2348000000000';

// ─── Utility ──────────────────────────────────────────────────────────────────
export function buildWhatsAppLink({ phone = IVARSE_WA_NUMBER, name = '', service = '', source = '' } = {}) {
  const parts = [`Hi IVarse Technologies! 👋`];
  if (name) parts.push(`I'm ${name}.`);
  if (service) parts.push(`I'm interested in: ${service}.`);
  parts.push(`I'd love to discuss a project with your team.`);
  const message = encodeURIComponent(parts.join(' '));
  return `https://wa.me/${phone}?text=${message}`;
}

export function useWhatsApp({ name = '', service = '', source = '' } = {}) {
  const link = buildWhatsAppLink({ name, service, source });
  const open = useCallback(() => window.open(link, '_blank', 'noopener'), [link]);
  return { link, open };
}

// ─── WhatsApp FAB ─────────────────────────────────────────────────────────────
export function WhatsAppFAB({ phoneNumber = IVARSE_WA_NUMBER }) {
  const [visible, setVisible] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  const services = [
    { id: 'custom-software', label: 'Custom Software', icon: '⚙️' },
    { id: 'ai-automation',   label: 'AI & Automation', icon: '🤖' },
    { id: 'erp',             label: 'ERP Setup',        icon: '📊' },
    { id: 'saas-product',    label: 'SaaS Development', icon: '🚀' },
    { id: 'infrastructure',  label: 'Infrastructure',   icon: '🏗️' },
    { id: 'consulting',      label: 'Just a question',  icon: '💬' },
  ];

  // Show FAB after 5s or 40% scroll
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 5000);
    const onScroll = () => {
      const pct = window.scrollY / (document.body.scrollHeight - window.innerHeight);
      if (pct > 0.4) setVisible(true);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const handleServiceClick = (service) => {
    setSelected(service.id);
    const link = buildWhatsAppLink({ phone: phoneNumber, service: service.label, source: 'fab' });
    setTimeout(() => window.open(link, '_blank', 'noopener'), 300);
  };

  const handleGeneralChat = () => {
    const link = buildWhatsAppLink({ phone: phoneNumber, source: 'fab' });
    window.open(link, '_blank', 'noopener');
  };

  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes wa-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.4); }
          50% { box-shadow: 0 0 0 12px rgba(37, 211, 102, 0); }
        }
        @keyframes wa-panel-in {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes wa-fab-in {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes wa-dot {
          0%, 80%, 100% { opacity: 0; transform: scale(0.8); }
          40%            { opacity: 1; transform: scale(1); }
        }
        .wa-fab-wrap { position: fixed; bottom: 28px; right: 28px; z-index: 9999; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; }
        .wa-fab { width: 58px; height: 58px; border-radius: 50%; background: #25D366; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; animation: wa-fab-in 0.4s ease both, wa-pulse 2.5s ease 1s 3; box-shadow: 0 4px 20px rgba(0,0,0,0.2); transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .wa-fab:hover { transform: scale(1.08); box-shadow: 0 8px 28px rgba(37,211,102,0.4); }
        .wa-fab svg { width: 30px; height: 30px; fill: white; transition: transform 0.3s ease; }
        .wa-fab.open svg { transform: rotate(45deg); }
        .wa-panel { background: #fff; border-radius: 20px; box-shadow: 0 12px 48px rgba(0,0,0,0.14); width: 300px; overflow: hidden; animation: wa-panel-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both; }
        .wa-panel-header { background: #075E54; padding: 18px 20px; display: flex; align-items: center; gap: 12px; }
        .wa-avatar { width: 44px; height: 44px; border-radius: 50%; background: #128C7E; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; position: relative; }
        .wa-online { position: absolute; bottom: 2px; right: 2px; width: 10px; height: 10px; background: #25D366; border-radius: 50%; border: 2px solid #075E54; }
        .wa-header-text h4 { color: #fff; font-size: 15px; font-weight: 600; margin: 0 0 2px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
        .wa-header-text p  { color: rgba(255,255,255,0.75); font-size: 12px; margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
        .wa-typing { display: flex; gap: 4px; align-items: center; margin-top: 4px; }
        .wa-typing span { width: 5px; height: 5px; background: rgba(255,255,255,0.6); border-radius: 50%; animation: wa-dot 1.4s infinite; }
        .wa-typing span:nth-child(2) { animation-delay: 0.2s; }
        .wa-typing span:nth-child(3) { animation-delay: 0.4s; }
        .wa-bubble { margin: 16px 16px 8px; background: #DCF8C6; border-radius: 12px 12px 12px 2px; padding: 12px 14px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 13.5px; line-height: 1.5; color: #111; position: relative; }
        .wa-bubble::before { content: ''; position: absolute; top: 0; left: -8px; width: 0; height: 0; border-top: 8px solid #DCF8C6; border-left: 8px solid transparent; }
        .wa-services { padding: 8px 12px 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .wa-service-btn { background: #f0f4f8; border: 1.5px solid transparent; border-radius: 10px; padding: 10px 8px; cursor: pointer; text-align: center; transition: all 0.2s ease; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
        .wa-service-btn:hover { background: #e8f5e9; border-color: #25D366; }
        .wa-service-btn.selected { background: #e8f5e9; border-color: #25D366; }
        .wa-service-btn .icon { font-size: 18px; display: block; margin-bottom: 4px; }
        .wa-service-btn .lbl  { font-size: 11.5px; font-weight: 500; color: #333; display: block; }
        .wa-footer { padding: 0 12px 16px; }
        .wa-start-btn { width: 100%; background: #25D366; color: white; border: none; border-radius: 12px; padding: 12px; font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; transition: background 0.2s; }
        .wa-start-btn:hover { background: #128C7E; }
        .wa-badge { position: absolute; top: -4px; right: -4px; background: #FF3B30; color: white; font-size: 10px; font-weight: 700; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
      `}</style>

      <div className="wa-fab-wrap">
        {panelOpen && (
          <div className="wa-panel">
            <div className="wa-panel-header">
              <div className="wa-avatar">
                💼
                <div className="wa-online" />
              </div>
              <div className="wa-header-text">
                <h4>IVarse Technologies</h4>
                <p>Typically replies within an hour</p>
                <div className="wa-typing"><span/><span/><span/></div>
              </div>
            </div>

            <div className="wa-bubble">
              Hey 👋 What are you looking to build? Pick a service below or just start chatting — we'll get you to the right person fast.
            </div>

            <div className="wa-services">
              {services.map((s) => (
                <button
                  key={s.id}
                  className={`wa-service-btn ${selected === s.id ? 'selected' : ''}`}
                  onClick={() => handleServiceClick(s)}
                >
                  <span className="icon">{s.icon}</span>
                  <span className="lbl">{s.label}</span>
                </button>
              ))}
            </div>

            <div className="wa-footer">
              <button className="wa-start-btn" onClick={handleGeneralChat}>
                <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'white' }}>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.526 5.843L.057 23.492a.5.5 0 0 0 .612.612l5.649-1.469A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.896 0-3.67-.52-5.192-1.427l-.372-.221-3.352.873.892-3.262-.242-.383A9.956 9.956 0 0 1 2 12c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10z"/>
                </svg>
                Start chatting on WhatsApp
              </button>
            </div>
          </div>
        )}

        <button
          className={`wa-fab ${panelOpen ? 'open' : ''}`}
          onClick={() => setPanelOpen(p => !p)}
          aria-label="Chat on WhatsApp"
          style={{ position: 'relative' }}
        >
          {!panelOpen && <div className="wa-badge">1</div>}
          {panelOpen ? (
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.526 5.843L.057 23.492a.5.5 0 0 0 .612.612l5.649-1.469A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.896 0-3.67-.52-5.192-1.427l-.372-.221-3.352.873.892-3.262-.242-.383A9.956 9.956 0 0 1 2 12c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10z"/>
            </svg>
          )}
        </button>
      </div>
    </>
  );
}

// ─── Inline Trigger Button ────────────────────────────────────────────────────
export function WhatsAppTrigger({
  phoneNumber = IVARSE_WA_NUMBER,
  label = 'Chat with us on WhatsApp',
  name = '',
  service = '',
  source = 'inline',
  className = '',
}) {
  const { open } = useWhatsApp({ name, service, source });

  return (
    <button
      onClick={open}
      className={`wa-trigger ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        background: '#25D366',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        padding: '14px 24px',
        fontSize: '15px',
        fontWeight: '600',
        cursor: 'pointer',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        transition: 'all 0.2s ease',
        boxShadow: '0 4px 16px rgba(37,211,102,0.3)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = '#128C7E';
        e.currentTarget.style.boxShadow = '0 6px 24px rgba(37,211,102,0.4)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = '#25D366';
        e.currentTarget.style.boxShadow = '0 4px 16px rgba(37,211,102,0.3)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: 'white', flexShrink: 0 }}>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.526 5.843L.057 23.492a.5.5 0 0 0 .612.612l5.649-1.469A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.896 0-3.67-.52-5.192-1.427l-.372-.221-3.352.873.892-3.262-.242-.383A9.956 9.956 0 0 1 2 12c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10z"/>
      </svg>
      {label}
    </button>
  );
}

// ─── Contact Form WhatsApp Enhancement ───────────────────────────────────────
/**
 * Drop this into your contact form's onSubmit handler:
 *
 * import { ContactFormWhatsAppCTA } from '@/components/WhatsAppWidget';
 *
 * After successful form submission, render:
 * <ContactFormWhatsAppCTA name={formData.name} service={formData.service} />
 */
export function ContactFormWhatsAppCTA({ name = '', service = '', phoneNumber = IVARSE_WA_NUMBER }) {
  const { open } = useWhatsApp({ name, service, source: 'contact_form' });

  return (
    <div style={{
      background: 'linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%)',
      border: '1.5px solid #c8e6c9',
      borderRadius: '16px',
      padding: '24px',
      textAlign: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
      <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1b5e20', margin: '0 0 8px' }}>
        Message received, {name ? name.split(' ')[0] : 'thanks'}!
      </h3>
      <p style={{ fontSize: '14px', color: '#388e3c', margin: '0 0 20px', lineHeight: 1.5 }}>
        We typically respond within a few hours. Want a faster reply?
        Connect with us directly on WhatsApp — our team is active and ready.
      </p>
      <button
        onClick={open}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '10px',
          background: '#25D366', color: 'white', border: 'none',
          borderRadius: '12px', padding: '13px 22px', fontSize: '14px',
          fontWeight: '600', cursor: 'pointer', transition: 'background 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#128C7E'}
        onMouseLeave={e => e.currentTarget.style.background = '#25D366'}
      >
        <svg viewBox="0 0 24 24" style={{ width: 18, height: 18, fill: 'white' }}>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.555 4.116 1.526 5.843L.057 23.492a.5.5 0 0 0 .612.612l5.649-1.469A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.896 0-3.67-.52-5.192-1.427l-.372-.221-3.352.873.892-3.262-.242-.383A9.956 9.956 0 0 1 2 12c0-5.514 4.486-10 10-10s10 4.486 10 10-4.486 10-10 10z"/>
        </svg>
        Continue on WhatsApp
      </button>
      <p style={{ fontSize: '12px', color: '#81c784', marginTop: '12px', marginBottom: 0 }}>
        Your form was also sent to our team ✓
      </p>
    </div>
  );
}
