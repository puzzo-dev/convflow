export const PROVIDER_FIELDS = {
    smtp: [
        { key: 'host', label: 'SMTP Host', placeholder: 'smtp.gmail.com' },
        { key: 'port', label: 'Port', placeholder: '587' },
        { key: 'user', label: 'Username' },
        { key: 'pass', label: 'Password', secret: true },
        { key: 'from', label: 'From address', placeholder: 'alerts@yourco.com' },
    ],
    meta: [
        { key: 'phoneNumberId', label: 'Phone Number ID' },
        { key: 'accessToken', label: 'Access Token', secret: true },
    ],
    openwa: [
        { key: 'baseUrl', label: 'OpenWA Base URL', placeholder: 'http://localhost:2785/api', optional: true },
        { key: 'apiKey', label: 'API Key', secret: true, optional: true },
        { key: 'sessionId', label: 'Session ID' },
    ],
    twilio: [
        { key: 'accountSid', label: 'Account SID' },
        { key: 'authToken', label: 'Auth Token', secret: true },
        { key: 'from', label: 'From Number', placeholder: '+14155238886' },
    ],
};
export const PROVIDERS_BY_KIND = {
    email: ['smtp'],
    whatsapp: ['meta', 'openwa'],
    sms: ['twilio'],
};
