export type AnswerMap = Record<string, string>;

// ── Conversation state (held in Redis, TTL 24h) ───────────────────────────────
export interface ConvState {
  companySlug: string;
  stage: number;
  answers: AnswerMap;
  name: string | null;
  source: string;
  startedAt: number; // unix ms
  mode: 'bot' | 'human';        // 'human' = human takeover active
  humanTakeoverAt?: number;     // unix ms when takeover was triggered
  lastOffFlowMessage?: string;  // the off-flow question that triggered takeover
}

// ── Stage types ───────────────────────────────────────────────────────────────
export type CollectingStageType = 'select' | 'free_text' | 'number' | 'confirm' | 'branch' | 'erpnext_item_select';
export type InfoStageType       = 'message' | 'media';
export type TerminalStageType   = 'save_lead' | 'create_order' | 'notify_only' | 'send_info' | 'book_appointment' | 'webhook';
export type StageType           = CollectingStageType | InfoStageType | TerminalStageType;

export interface FlowStage {
  stage: number;                    // 0-indexed sequential
  id: string;                       // human slug e.g. "ask_service", "confirm_order"
  type: StageType;
  message: string;                  // bot message. Supports {name}, {answers.key} tokens
  answerKey?: string;               // key to write answer into state.answers (collecting stages)
  options?: StageOption[];          // for select, branch, confirm
  branches?: Record<string, number>; // answer value → next stage index (select/branch routing)
  mediaUrl?: string;                // media type: URL of image or PDF to send
  erpnextItemSelect?: ERPNextItemSelectConfig; // only for type === 'erpnext_item_select'
  actions?: NodeAction[];           // side-effects fired when this stage's answer is accepted
  // Terminal stage config:
  terminal?: TerminalConfig;
}

// ── Pluggable per-node actions (run mid-flow, after an answer is accepted) ─────
// Non-blocking by default: they run in array order but do not hold up the
// customer's next message. Set `blocking: true` (or use `saveResponseTo`) when a
// later step needs the action's result inline.
export type NodeAction = HttpRequestAction | NotifyOwnerAction | PluginAction;

export interface HttpRequestAction {
  type: 'http_request';
  method?: 'GET' | 'POST';          // default POST
  url: string;                      // supports {name}, {phone}, {answers.key} tokens
  headers?: Record<string, string>;
  // Custom JSON body (values support tokens). Omit → standard lead payload
  // { companySlug, phone, name, answers }.
  body?: Record<string, string>;
  saveResponseTo?: string;          // answers key to store the response (implies blocking)
  responsePath?: string;            // dot-path into JSON response, e.g. "data.id"
  blocking?: boolean;
}

export interface NotifyOwnerAction {
  type: 'notify_owner';
  channels?: ('email' | 'whatsapp' | 'sms')[];  // which channels to send on; default ['whatsapp']
  blocking?: boolean;
}

// Invoke a global plugin's action against the tenant's own connected system.
export interface PluginAction {
  type: 'plugin';
  pluginId: string;                 // e.g. 'erpnext'
  actionId: string;                 // e.g. 'create' | 'read' | 'update' | 'delete'
  inputs: Record<string, any>;      // { doctype, name?, fields? } — values may hold tokens
  saveResponseTo?: string;          // answers key to store response (implies blocking)
  responsePath?: string;            // dot-path into JSON response
  blocking?: boolean;
}

export interface StageOption {
  value: string;                    // what customer types e.g. "1"
  label: string;                    // human readable label stored in answers
}

// ── Terminal action config ────────────────────────────────────────────────────
export type TerminalConfig =
  | SaveLeadTerminal
  | CreateOrderTerminal
  | NotifyOnlyTerminal
  | SendInfoTerminal
  | BookAppointmentTerminal
  | WebhookTerminal;

export interface SaveLeadTerminal {
  type: 'save_lead';
  successMessage: string;           // sent to customer after lead is saved
  fieldMapping?: ERPNextFieldMap;   // optional: map answers → ERPNext Lead fields
}

export interface CreateOrderTerminal {
  type: 'create_order';
  successMessage: string;           // sent to customer e.g. "Order placed! We'll confirm shortly."
  fieldMapping: ERPNextFieldMap;    // required: map answers → Sales Order fields
  // Which answer key holds the item name
  itemAnswerKey: string;            // e.g. "item_name"
  itemCodeAnswerKey?: string;       // e.g. "item_code" (falls back to itemAnswerKey if not set)
  qtyAnswerKey: string;             // e.g. "quantity"
  customerPhoneKey?: string;        // defaults to the sender's phone
  customerNameKey?: string;         // defaults to state.name
}

export interface NotifyOnlyTerminal {
  type: 'notify_only';
  successMessage: string;           // sent to customer
}

export interface SendInfoTerminal {
  type: 'send_info';
  infoMessage: string;              // the info text to send to customer (can be long)
  // After sending info, optionally loop back to a stage (e.g. main menu)
  loopToStage?: number;
}

export interface BookAppointmentTerminal {
  type: 'book_appointment';
  successMessage: string;
  bookingLink?: string;             // if set: send link to customer
  // if no link: collect date/time via flow answers, notify tenant
  dateAnswerKey?: string;
  timeAnswerKey?: string;
}

export interface WebhookTerminal {
  type: 'webhook';
  url?: string;                     // POST all state.answers to this URL (legacy key)
  webhookUrl?: string;              // builder key
  headers?: Record<string, string>; // optional custom headers (e.g. auth)
  successMessage: string;
}

export type ERPNextFieldMap = Record<string, string>;

// ── Company Config ────────────────────────────────────────────────────────────
export interface CompanyConfig {
  slug: string;
  name: string;
  active?: boolean;                 // mirrors Tenant.active; runtime cache honors this flag
  openwaSessionId: string;
  openwaApiKey: string;
  openwaBaseUrl: string;
  ownerPhone: string;               // WhatsApp number for tenant alerts (no +)
  websiteUrl: string;
  erpnextProxySecret?: string;      // secret ERPNext sends with outbound-message webhooks
  flows: FlowStage[];               // ALL stages including the terminal stage
  scoring?: ScoringRule[];          // optional; only used by save_lead terminal
  messages: MessageOverrides;
}

export interface ScoringRule {
  answerKey: string;
  values: Record<string, number>;
}

export interface MessageOverrides {
  unknown_input?: string;     
  escalate_confirm?: string;
  stop?: string;
  human_takeover?: string;    
}

// ── ERPNext Item cache entry ──────────────────────────────────────────────────
export interface ERPNextItem {
  item_code: string;
  item_name: string;
  item_group: string;
  standard_rate: number;
  currency: string;
  description?: string;
}

export interface ERPNextItemSelectConfig {
  itemGroup?: string;           
  displayFormat: string;        
  itemNameAnswerKey: string;    
  itemCodeAnswerKey: string;    
  itemPriceAnswerKey: string;   
  noItemsMessage?: string;      
}

export interface InboundMessage {
  channelType: 'whatsapp';
  openwaSessionId: string;
  fromPhone: string;
  profileName: string | null;
  text: string;
  rawPayload: unknown;
}
