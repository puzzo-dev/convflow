// Declarative plugin contract. A plugin is DATA (a manifest), not code — OSS
// devs describe their system's HTTP actions and the platform's runner executes
// them. The manifest is GLOBAL; credentials + live options resolve PER TENANT.

export type Verb = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface PluginInput {
  key: string;                       // e.g. 'doctype', 'name', 'fields'
  label: string;
  type: 'text' | 'doctype' | 'fieldmap';
  optionsFrom?: string;              // key into manifest.dynamicOptions (live-fetched)
  required?: boolean;
  help?: string;
}

export interface PluginActionDef {
  id: string;                        // e.g. 'create'
  label: string;                     // e.g. 'Create'
  verb: Verb;
  url: string;                       // template: {creds.x}, {input.y}, {answers.z}, {name}, {phone}
  headers?: Record<string, string>;  // values are templated too
  bodyFrom?: 'fields' | 'none';      // 'fields' → POST/PUT the mapped fields object
  inputs: PluginInput[];
}

// A live, per-tenant option list (e.g. the tenant's ERPNext doctypes).
export interface DynamicOptionDef {
  verb: Verb;
  url: string;
  headers?: Record<string, string>;
  itemsPath: string;                 // dot-path to the array in the response
  labelKey: string;
  valueKey: string;
}

export type CredentialSource =
  | { source: 'erpnext_connection' }                                   // reuse per-tenant ErpnextConnection
  | { source: 'stored'; fields: { key: string; label: string; secret?: boolean }[] };

export interface PluginManifest {
  id: string;
  name: string;
  description?: string;
  credentials: CredentialSource;
  dynamicOptions?: Record<string, DynamicOptionDef>;
  actions: PluginActionDef[];
}

// Interpolation context for templates.
export interface InterpCtx {
  creds: Record<string, string>;
  input: Record<string, any>;
  answers: Record<string, string>;
  name: string | null;
  phone: string;
}
