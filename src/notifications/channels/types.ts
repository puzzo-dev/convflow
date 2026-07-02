export type ChannelKind = 'email' | 'whatsapp' | 'sms';
export type Provider    = 'smtp' | 'meta' | 'openwa' | 'twilio';

export interface SendResult {
  ok: boolean;
  error?: string;
}

// Every adapter takes decrypted credentials + a destination + the message.
// `subject` is only meaningful for email.
export interface ChannelAdapter {
  kind: ChannelKind;
  provider: Provider;
  send(
    creds: Record<string, string>,
    target: string,
    message: string,
    subject?: string,
  ): Promise<SendResult>;
}

// Which credential fields each provider expects — drives the settings UI and
// the global-fallback env mapping. `secret: true` fields are never returned to
// the browser.
export interface CredField {
  key: string;
  label: string;
  secret?: boolean;
  optional?: boolean;
  placeholder?: string;
}

export const PROVIDER_FIELDS: Record<Provider, CredField[]> = {
  smtp: [
    { key: 'host',   label: 'SMTP Host', placeholder: 'smtp.gmail.com' },
    { key: 'port',   label: 'Port',      placeholder: '587' },
    { key: 'user',   label: 'Username' },
    { key: 'pass',   label: 'Password',  secret: true },
    { key: 'from',   label: 'From address', placeholder: 'alerts@yourco.com' },
  ],
  meta: [
    { key: 'phoneNumberId', label: 'Phone Number ID' },
    { key: 'accessToken',   label: 'Access Token', secret: true },
  ],
  openwa: [
    { key: 'baseUrl',   label: 'OpenWA Base URL', placeholder: 'http://localhost:2785/api', optional: true },
    { key: 'apiKey',    label: 'API Key', secret: true, optional: true },
    { key: 'sessionId', label: 'Session ID' },
  ],
  twilio: [
    { key: 'accountSid', label: 'Account SID' },
    { key: 'authToken',  label: 'Auth Token', secret: true },
    { key: 'from',       label: 'From Number', placeholder: '+14155238886' },
  ],
};

export const PROVIDERS_BY_KIND: Record<ChannelKind, Provider[]> = {
  email:    ['smtp'],
  whatsapp: ['meta', 'openwa'],
  sms:      ['twilio'],
};
